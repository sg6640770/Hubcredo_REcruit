import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { Inbox as InboxIcon, Mail, ChevronRight, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Badge, EmptyState, LoadingSkeleton } from '@/components/ui';
import type { JpReply, JpOutreachMessage, ApplicationStage, JpApplication } from '@/types/db';

export default function InboxPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [replies, setReplies] = useState<JpReply[]>([]);
  const [selected, setSelected] = useState<JpReply | null>(null);
  const [originalMessage, setOriginalMessage] = useState<JpOutreachMessage | null>(null);
  const [applications, setApplications] = useState<Map<string, JpApplication>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'email' | 'linkedin'>('all');

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from('jp_replies').select('*').eq('user_id', profile.id).order('received_at', { ascending: false });
    const repliesData = (data as JpReply[]) ?? [];
    setReplies(repliesData);
    if (repliesData.length > 0) {
      const { data: apps } = await supabase.from('jp_applications').select('*').eq('user_id', profile.id);
      setApplications(new Map((apps as JpApplication[])?.map((a) => [a.id, a]) ?? []));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('jp-replies')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jp_replies', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          setReplies((prev) => [payload.new as JpReply, ...prev]);
          toast.show('New reply received!', 'info');
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, toast]);

  const selectReply = async (r: JpReply) => {
    setSelected(r);
    if (!r.is_read) {
      await supabase.from('jp_replies').update({ is_read: true }).eq('id', r.id);
      setReplies((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_read: true } : x)));
    }
    if (r.message_id) {
      const { data } = await supabase.from('jp_outreach_messages').select('*').eq('id', r.message_id).maybeSingle();
      setOriginalMessage(data as JpOutreachMessage | null);
    } else {
      setOriginalMessage(null);
    }
  };

  const moveStage = async (appId: string | null, stage: ApplicationStage) => {
    if (!appId) return;
    await supabase.from('jp_applications').update({ stage, stage_changed_at: new Date().toISOString() }).eq('id', appId);
    toast.show(`Moved to ${stage.replace('_', ' ')}.`, 'success');
  };

  const filtered = replies.filter((r) => filter === 'all' || r.channel === filter);
  const unreadCount = replies.filter((r) => !r.is_read).length;

  if (loading) return <div className="jp-page-header"><h1>Inbox</h1><LoadingSkeleton className="jp-card-skel" /></div>;

  return (
    <div className="jp-inbox-layout">
      <div className="jp-inbox-list">
        <div className="jp-page-header">
          <div><h1>Inbox</h1><p>{unreadCount} unread {unreadCount === 1 ? 'reply' : 'replies'}</p></div>
        </div>
        <div className="jp-inbox-filters">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'email' ? 'active' : ''} onClick={() => setFilter('email')}><Mail size={14} /> Email</button>
          <button className={filter === 'linkedin' ? 'active' : ''} onClick={() => setFilter('linkedin')}>LinkedIn</button>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={<InboxIcon size={36} />} title="No replies yet"
            description="When recruiters respond to your outreach, their replies will appear here in real time." />
        ) : (
          <div className="jp-reply-list">
            {filtered.map((r) => {
              const app = r.application_id ? applications.get(r.application_id) : null;
              return (
                <button key={r.id} className={`jp-reply-row ${selected?.id === r.id ? 'active' : ''} ${!r.is_read ? 'unread' : ''}`} onClick={() => selectReply(r)}>
                  <div className="jp-reply-row-main">
                    <strong>{r.from_name || r.from_address || 'Unknown'}</strong>
                    <span>{r.subject || '(no subject)'}</span>
                    {app && <small>{app.company_name} · {app.job_title}</small>}
                  </div>
                  <div className="jp-reply-row-meta">
                    <Badge variant={r.channel === 'email' ? 'info' : 'primary'}>{r.channel}</Badge>
                    <span>{new Date(r.received_at).toLocaleDateString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="jp-inbox-thread">
          <div className="jp-inbox-thread-header">
            <button className="jp-back-link jp-mobile-only" onClick={() => setSelected(null)}><ArrowLeft size={16} /></button>
            <h2>{selected.subject || '(no subject)'}</h2>
            <p>From {selected.from_name || selected.from_address || 'Unknown'} · {new Date(selected.received_at).toLocaleString()}</p>
          </div>
          <div className="jp-inbox-thread-body">
            {originalMessage && (
              <div className="jp-original-message">
                <small>Your original message:</small>
                <strong>{originalMessage.subject}</strong>
                <p>{originalMessage.body}</p>
              </div>
            )}
            <div className="jp-reply-content">
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.body || '') }} />
            </div>
          </div>
          {selected.application_id && (
            <div className="jp-inbox-quick-actions">
              <span>Move application:</span>
              <button className="jp-btn-primary jp-btn-sm" onClick={() => moveStage(selected.application_id, 'interview')}>Interview</button>
              <button className="jp-btn-ghost jp-btn-sm" onClick={() => moveStage(selected.application_id, 'rejected')}>Rejected</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
