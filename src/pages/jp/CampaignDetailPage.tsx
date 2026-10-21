import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X, Mail, Building2, Activity as ActivityIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Badge, LoadingSkeleton } from '@/components/ui';
import { mockCampaignJobs, mockCampaignMessages, mockContacts } from '@/lib/api';
import type { JpCampaign, JpApplication, JpOutreachMessage, MessageStatus } from '@/types/db';

const MSG_STATUS_VARIANT: Record<MessageStatus, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'neutral', queued: 'info', sending: 'info', sent: 'success', failed: 'error', cancelled: 'neutral', bounced: 'error',
};

type Tab = 'jobs' | 'messages' | 'activity';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const toast = useToast();
  const [campaign, setCampaign] = useState<JpCampaign | null>(null);
  const [jobs, setJobs] = useState<JpApplication[]>([]);
  const [messages, setMessages] = useState<JpOutreachMessage[]>([]);
  const [tab, setTab] = useState<Tab>('jobs');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !profile) return;
    (async () => {
      const { data: camp } = await supabase.from('jp_campaigns').select('*').eq('id', id).single();
      setCampaign(camp as JpCampaign);
      const { data: jobData } = await supabase.from('jp_applications').select('*').eq('campaign_id', id).order('match_score', { ascending: false });
      let realJobs = (jobData as JpApplication[]) ?? [];
      if (realJobs.length === 0) realJobs = mockCampaignJobs(id);
      setJobs(realJobs);
      if (realJobs.length > 0) {
        const { data: msgData } = await supabase.from('jp_outreach_messages').select('*').in('application_id', realJobs.map((j) => j.id));
        let realMsgs = (msgData as JpOutreachMessage[]) ?? [];
        if (realMsgs.length === 0) realMsgs = mockCampaignMessages(realJobs);
        setMessages(realMsgs);
      }
      setLoading(false);
    })();
  }, [id, profile]);

  const updateMessage = async (msgId: string, updates: Partial<JpOutreachMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, ...updates } : m)));
    const real = await supabase.from('jp_outreach_messages').select('id').eq('id', msgId).maybeSingle();
    if (real.data) {
      await supabase.from('jp_outreach_messages').update(updates).eq('id', msgId);
    }
  };

  const approveMessage = async (msg: JpOutreachMessage) => {
    await updateMessage(msg.id, { status: 'queued' });
    toast.show('Message approved and queued.', 'success');
  };

  const cancelMessage = async (msg: JpOutreachMessage) => {
    await updateMessage(msg.id, { status: 'cancelled' });
    toast.show('Message cancelled.', 'info');
  };

  if (loading) return <div><LoadingSkeleton className="jp-card-skel" /></div>;
  if (!campaign) return <div className="jp-muted">Campaign not found.</div>;

  return (
    <div>
      <Link to="/campaigns" className="jp-back-link"><ArrowLeft size={16} /> All campaigns</Link>
      <div className="jp-page-header">
        <div><h1>{campaign.name}</h1><p>{campaign.target_role} {campaign.industry ? `· ${campaign.industry}` : ''}</p></div>
        <Badge variant={campaign.status === 'active' ? 'success' : campaign.status === 'failed' ? 'error' : 'neutral'}>{campaign.status}</Badge>
      </div>

      <div className="jp-tabs">
        <button className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}><Building2 size={16} /> Jobs found ({jobs.length})</button>
        <button className={tab === 'messages' ? 'active' : ''} onClick={() => setTab('messages')}><Mail size={16} /> Messages ({messages.length})</button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><ActivityIcon size={16} /> Activity</button>
      </div>

      {tab === 'jobs' && (
        <div className="jp-jobs-list">
          {jobs.length === 0 && <p className="jp-muted">No jobs discovered yet. The campaign is still running.</p>}
          {jobs.map((job) => (
            <Link to={`/applications?app=${job.id}`} key={job.id} className="jp-job-row">
              <div className="jp-job-row-main">
                <h3>{job.job_title}</h3>
                <p>{job.company_name} · {job.location || 'Unknown'}</p>
              </div>
              <div className="jp-job-row-meta">
                {job.match_score != null && <Badge variant={job.match_score >= 85 ? 'success' : 'info'}>{Math.round(job.match_score)}% match</Badge>}
                <span>{job.work_model || '—'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'messages' && (
        <div className="jp-messages-list">
          {messages.length === 0 && <p className="jp-muted">No messages generated yet.</p>}
          {jobs.map((job) => {
            const jobMsgs = messages.filter((m) => m.application_id === job.id);
            if (jobMsgs.length === 0) return null;
            return (
              <div key={job.id} className="jp-message-group">
                <div className="jp-message-group-header">
                  <h3>{job.job_title} at {job.company_name}</h3>
                </div>
                <div className="jp-message-pair">
                  {jobMsgs.map((msg) => (
                    <MessageEditor
                      key={msg.id}
                      msg={msg}
                      onChange={(updates) => updateMessage(msg.id, updates)}
                      onApprove={() => approveMessage(msg)}
                      onCancel={() => cancelMessage(msg)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'activity' && (
        <div className="jp-activity-log">
          <p className="jp-muted">Campaign started {campaign.started_at ? new Date(campaign.started_at).toLocaleString() : 'not yet launched'}.</p>
          <p className="jp-muted">Status: {campaign.status}. Daily cap: {campaign.daily_cap}.</p>
          {campaign.error_message && <div className="jp-auth-error">{campaign.error_message}</div>}
        </div>
      )}
    </div>
  );
}

function MessageEditor({ msg, onChange, onApprove, onCancel }: {
  msg: JpOutreachMessage;
  onChange: (updates: Partial<JpOutreachMessage>) => void;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="jp-message-card">
      <div className="jp-message-card-header">
        <span className="jp-message-recipient">{msg.recipient_type.replace('_', ' ')}</span>
        <Badge variant={MSG_STATUS_VARIANT[msg.status]}>{msg.status}</Badge>
      </div>
      <input
        className="jp-message-subject"
        value={msg.subject || ''}
        onChange={(e) => onChange({ subject: e.target.value, edited_by_user: true })}
        placeholder="Subject"
      />
      <textarea
        className="jp-message-body"
        value={msg.body}
        onChange={(e) => onChange({ body: e.target.value, edited_by_user: true })}
        rows={6}
      />
      <div className="jp-message-actions">
        <button className="jp-btn-ghost jp-btn-sm" onClick={onCancel}><X size={14} /> Cancel</button>
        <button className="jp-btn-primary jp-btn-sm" onClick={onApprove}><Check size={14} /> Approve & Queue</button>
      </div>
    </div>
  );
}
