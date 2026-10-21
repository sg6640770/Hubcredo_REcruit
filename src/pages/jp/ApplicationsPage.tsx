import { useEffect, useState, useCallback } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { Search, Plus, Table as TableIcon, KanbanSquare, X, Calendar, Mail, FileText, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Badge, EmptyState, LoadingSkeleton, Modal } from '@/components/ui';
import { mockContacts } from '@/lib/api';
import type { JpApplication, ApplicationStage, JpContact, JpOutreachMessage, JpReminder } from '@/types/db';

const STAGES: ApplicationStage[] = ['identified', 'outreach_sent', 'reply_received', 'interview', 'offer', 'rejected'];
const STAGE_LABELS: Record<ApplicationStage, string> = {
  identified: 'Identified', outreach_sent: 'Outreach Sent', reply_received: 'Reply Received',
  interview: 'Interview', offer: 'Offer', rejected: 'Rejected',
};

export default function ApplicationsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [apps, setApps] = useState<JpApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState<ApplicationStage | 'all'>('all');
  const [selectedApp, setSelectedApp] = useState<JpApplication | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('jp_applications').select('*').eq('user_id', profile.id).order('stage_changed_at', { ascending: false });
    setApps((data as JpApplication[]) ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const filtered = apps.filter((a) => {
    const matchesSearch = !search || a.company_name.toLowerCase().includes(search.toLowerCase()) || a.job_title.toLowerCase().includes(search.toLowerCase());
    const matchesStage = filterStage === 'all' || a.stage === filterStage;
    return matchesSearch && matchesStage;
  });

  const moveStage = async (appId: string, newStage: ApplicationStage) => {
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, stage: newStage, stage_changed_at: new Date().toISOString() } : a)));
    await supabase.from('jp_applications').update({ stage: newStage, stage_changed_at: new Date().toISOString() }).eq('id', appId);
  };

  const onDragStart = (e: DragStartEvent) => setActiveDragId(e.active.id as string);
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const newStage = over.id as ApplicationStage;
    if (STAGES.includes(newStage)) {
      await moveStage(active.id as string, newStage);
    }
  };

  const activeApp = activeDragId ? apps.find((a) => a.id === activeDragId) : null;

  if (loading) return <div className="jp-page-header"><h1>Applications</h1><LoadingSkeleton className="jp-card-skel" /></div>;

  return (
    <div>
      <div className="jp-page-header">
        <div><h1>Applications</h1><p>Track and manage your job applications</p></div>
        <button className="jp-btn-primary" onClick={() => setShowAdd(true)}><Plus size={18} /> Add job</button>
      </div>

      <div className="jp-app-toolbar">
        <div className="jp-search-bar"><Search size={16} /><input placeholder="Search company or role…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select value={filterStage} onChange={(e) => setFilterStage(e.target.value as ApplicationStage | 'all')}>
          <option value="all">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        <div className="jp-view-toggle">
          <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}><KanbanSquare size={16} /></button>
          <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}><TableIcon size={16} /></button>
        </div>
      </div>

      {apps.length === 0 ? (
        <EmptyState icon={<KanbanSquare size={36} />} title="No applications yet"
          description="Applications will appear here once your campaigns find jobs, or add one manually."
          action={<button className="jp-btn-primary" onClick={() => setShowAdd(true)}><Plus size={18} /> Add a job manually</button>} />
      ) : view === 'kanban' ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="jp-kanban">
            {STAGES.map((stage) => {
              const stageApps = filtered.filter((a) => a.stage === stage);
              return <KanbanColumn key={stage} stage={stage} apps={stageApps} onSelect={setSelectedApp} />;
            })}
          </div>
          <DragOverlay>{activeApp ? <KanbanCard app={activeApp} /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <div className="jp-app-table">
          <div className="jp-app-table-header">
            <span>Company</span><span>Role</span><span>Stage</span><span>Match</span><span></span>
          </div>
          {filtered.map((a) => (
            <button key={a.id} className="jp-app-table-row" onClick={() => setSelectedApp(a)}>
              <span><strong>{a.company_name}</strong></span>
              <span>{a.job_title}</span>
              <span><Badge variant="info">{STAGE_LABELS[a.stage]}</Badge></span>
              <span>{a.match_score != null ? `${Math.round(a.match_score)}%` : '—'}</span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      )}

      {selectedApp && <ApplicationDrawer app={selectedApp} onClose={() => setSelectedApp(null)} onMove={moveStage} />}
      <AddJobModal open={showAdd} onClose={() => setShowAdd(false)} onAdded={load} />
    </div>
  );
}

function KanbanColumn({ stage, apps, onSelect }: { stage: ApplicationStage; apps: JpApplication[]; onSelect: (a: JpApplication) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className={`jp-kanban-col ${isOver ? 'drag-over' : ''}`} ref={setNodeRef}>
      <div className="jp-kanban-col-header">
        <h3>{STAGE_LABELS[stage]}</h3>
        <span className="jp-kanban-count">{apps.length}</span>
      </div>
      <div className="jp-kanban-cards">
        {apps.map((app) => (
          <DraggableCard key={app.id} app={app} onSelect={() => onSelect(app)} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ app, onSelect }: { app: JpApplication; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`jp-kanban-card ${isDragging ? 'dragging' : ''}`} onClick={onSelect}>
      <KanbanCard app={app} />
    </div>
  );
}

function KanbanCard({ app }: { app: JpApplication }) {
  return (
    <>
      <div className="jp-kanban-card-title">{app.job_title}</div>
      <div className="jp-kanban-card-company">{app.company_name}</div>
      <div className="jp-kanban-card-meta">
        {app.match_score != null && <Badge variant={app.match_score >= 85 ? 'success' : 'info'}>{Math.round(app.match_score)}%</Badge>}
        {app.location && <span>{app.location}</span>}
      </div>
    </>
  );
}

function ApplicationDrawer({ app, onClose, onMove }: { app: JpApplication; onClose: () => void; onMove: (id: string, stage: ApplicationStage) => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [contacts, setContacts] = useState<JpContact[]>([]);
  const [messages, setMessages] = useState<JpOutreachMessage[]>([]);
  const [reminders, setReminders] = useState<JpReminder[]>([]);
  const [notes, setNotes] = useState(app.notes ?? '');

  useEffect(() => {
    (async () => {
      const [c, m, r] = await Promise.all([
        supabase.from('jp_contacts').select('*').eq('application_id', app.id),
        supabase.from('jp_outreach_messages').select('*').eq('application_id', app.id),
        supabase.from('jp_reminders').select('*').eq('application_id', app.id).eq('done', false).order('due_at', { ascending: true }),
      ]);
      let realContacts = (c.data as JpContact[]) ?? [];
      if (realContacts.length === 0) realContacts = mockContacts(app.id);
      setContacts(realContacts);
      setMessages((m.data as JpOutreachMessage[]) ?? []);
      setReminders((r.data as JpReminder[]) ?? []);
    })();
  }, [app.id]);

  const saveNotes = async () => {
    await supabase.from('jp_applications').update({ notes }).eq('id', app.id);
    toast.show('Notes saved.', 'success');
  };

  const addReminder = async () => {
    if (!profile) return;
    const { data } = await supabase.from('jp_reminders').insert({
      user_id: profile.id, application_id: app.id, kind: 'follow_up',
      title: `Follow up on ${app.job_title} at ${app.company_name}`,
      due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    }).select().single();
    if (data) setReminders((prev) => [...prev, data as JpReminder]);
    toast.show('Reminder added.', 'success');
  };

  return (
    <div className="jp-drawer-backdrop" onClick={onClose}>
      <div className="jp-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="jp-drawer-header">
          <div>
            <h2>{app.job_title}</h2>
            <p>{app.company_name} {app.location ? `· ${app.location}` : ''}</p>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="jp-drawer-body">
          <div className="jp-drawer-section">
            <h3>Stage</h3>
            <div className="jp-stage-mover">
              {STAGES.map((s) => (
                <button key={s} className={app.stage === s ? 'active' : ''} onClick={() => onMove(app.id, s)}>
                  {STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {app.match_score != null && (
            <div className="jp-drawer-section">
              <h3>Match Analysis</h3>
              <div className="jp-match-score"><span>{Math.round(app.match_score)}%</span> match</div>
              {app.ats_missing_keywords.length > 0 && (
                <div className="jp-ats-missing">
                  <small>Missing keywords:</small>
                  {app.ats_missing_keywords.map((k) => <Badge key={k} variant="warning">{k}</Badge>)}
                </div>
              )}
            </div>
          )}

          {app.job_description && (
            <div className="jp-drawer-section">
              <h3>Job Description</h3>
              <p className="jp-job-desc">{app.job_description}</p>
            </div>
          )}

          <div className="jp-drawer-section">
            <h3>Contacts</h3>
            <div className="jp-contacts-list">
              {contacts.map((c) => (
                <div key={c.id} className="jp-contact-row">
                  <div><strong>{c.first_name} {c.last_name}</strong><span>{c.job_title}</span></div>
                  {c.email && <a href={`mailto:${c.email}`}><Mail size={14} /> {c.email}</a>}
                </div>
              ))}
              {contacts.length === 0 && <p className="jp-muted">No contacts found yet.</p>}
            </div>
          </div>

          <div className="jp-drawer-section">
            <h3>Messages Sent</h3>
            <div className="jp-contacts-list">
              {messages.filter((m) => m.status === 'sent').map((m) => (
                <div key={m.id} className="jp-contact-row">
                  <div><strong>{m.subject || '(no subject)'}</strong><span>{m.recipient_type.replace('_', ' ')} · {m.channel}</span></div>
                </div>
              ))}
              {messages.filter((m) => m.status === 'sent').length === 0 && <p className="jp-muted">No messages sent yet.</p>}
            </div>
          </div>

          <div className="jp-drawer-section">
            <h3>Notes</h3>
            <textarea className="jp-notes-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            <button className="jp-btn-ghost jp-btn-sm" onClick={saveNotes}>Save notes</button>
          </div>

          <div className="jp-drawer-section">
            <div className="jp-drawer-section-header">
              <h3><Calendar size={16} /> Reminders</h3>
              <button className="jp-btn-ghost jp-btn-sm" onClick={addReminder}><Plus size={14} /> Add</button>
            </div>
            <div className="jp-reminder-list">
              {reminders.map((r) => (
                <div key={r.id} className="jp-reminder-item">
                  <strong>{r.title}</strong>
                  <span>{new Date(r.due_at).toLocaleDateString()}</span>
                </div>
              ))}
              {reminders.length === 0 && <p className="jp-muted">No reminders.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddJobModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from('jp_applications').insert({
      user_id: profile.id,
      company_name: company,
      job_title: jobTitle,
      job_url: jobUrl || null,
      location: location || null,
      job_description: description || null,
      source: 'manual',
      stage: 'identified',
    });
    setBusy(false);
    if (error) { toast.show('Could not add job.', 'error'); return; }
    toast.show('Job added.', 'success');
    onAdded(); onClose();
    setCompany(''); setJobTitle(''); setJobUrl(''); setLocation(''); setDescription('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Add job manually" size="md">
      <form onSubmit={submit} className="jp-form">
        <div className="jp-form-row">
          <label><span>Company</span><input value={company} onChange={(e) => setCompany(e.target.value)} required /></label>
          <label><span>Job title</span><input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required /></label>
        </div>
        <div className="jp-form-row">
          <label><span>Job URL (optional)</span><input value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} /></label>
          <label><span>Location (optional)</span><input value={location} onChange={(e) => setLocation(e.target.value)} /></label>
        </div>
        <label><span>Job description (optional)</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} /></label>
        <div className="jp-form-actions">
          <button type="button" className="jp-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="jp-btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add job'}</button>
        </div>
      </form>
    </Modal>
  );
}
