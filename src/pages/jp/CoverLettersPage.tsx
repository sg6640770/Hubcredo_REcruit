import { useEffect, useState } from 'react';
import { Plus, Download, FileText, Wand2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { EmptyState, LoadingSkeleton, Modal } from '@/components/ui';
import { api, InsufficientCreditsError } from '@/lib/api';
import type { JpCoverLetter, JpResume, JpApplication } from '@/types/db';

export default function CoverLettersPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [letters, setLetters] = useState<JpCoverLetter[]>([]);
  const [resumes, setResumes] = useState<JpResume[]>([]);
  const [apps, setApps] = useState<JpApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<JpCoverLetter | null>(null);
  const [showGen, setShowGen] = useState(false);

  const load = async () => {
    if (!profile) return;
    const [l, r, a] = await Promise.all([
      supabase.from('jp_cover_letters').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('jp_resumes').select('*').eq('user_id', profile.id),
      supabase.from('jp_applications').select('*').eq('user_id', profile.id),
    ]);
    setLetters((l.data as JpCoverLetter[]) ?? []);
    setResumes((r.data as JpResume[]) ?? []);
    setApps((a.data as JpApplication[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile]);

  const save = async (id: string, body: string) => {
    await supabase.from('jp_cover_letters').update({ body }).eq('id', id);
    setLetters((prev) => prev.map((l) => (l.id === id ? { ...l, body } : l)));
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.show('Copied to clipboard.', 'success');
  };

  const download = async (letter: JpCoverLetter) => {
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const doc = new Document({ sections: [{ children: letter.body.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] })) }] });
    const blob = await Packer.toBlob(doc);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${letter.company_name || 'cover-letter'}.docx`;
    a.click();
  };

  if (loading) return <div className="jp-page-header"><h1>Cover Letters</h1><LoadingSkeleton className="jp-card-skel" /></div>;

  return (
    <div>
      <div className="jp-page-header">
        <div><h1>Cover Letters</h1><p>Generate and manage tailored cover letters</p></div>
        <button className="jp-btn-primary" onClick={() => setShowGen(true)}><Plus size={18} /> Generate</button>
      </div>

      {letters.length === 0 && !active ? (
        <EmptyState icon={<FileText size={36} />} title="No cover letters yet"
          description="Generate a cover letter from your resume and a job description."
          action={<button className="jp-btn-primary" onClick={() => setShowGen(true)}><Wand2 size={18} /> Generate cover letter</button>} />
      ) : active ? (
        <div className="jp-cover-editor">
          <button className="jp-back-link" onClick={() => setActive(null)}>← All cover letters</button>
          <h2>{active.company_name} — {active.job_title}</h2>
          <textarea className="jp-cover-textarea" value={active.body} onChange={(e) => { setActive({ ...active, body: e.target.value }); }} onBlur={() => save(active.id, active.body)} rows={16} />
          <div className="jp-cover-actions">
            <button className="jp-btn-ghost jp-btn-sm" onClick={() => copyText(active.body)}>Copy</button>
            <button className="jp-btn-primary jp-btn-sm" onClick={() => download(active)}><Download size={14} /> DOCX</button>
          </div>
        </div>
      ) : (
        <div className="jp-cover-list">
          {letters.map((l) => (
            <div key={l.id} className="jp-cover-card" onClick={() => setActive(l)}>
              <div><strong>{l.company_name || 'Unknown company'}</strong><span>{l.job_title || '—'}</span></div>
              <p>{l.body.slice(0, 100)}…</p>
              <small>{new Date(l.created_at).toLocaleDateString()}</small>
            </div>
          ))}
        </div>
      )}

      <GenerateModal open={showGen} onClose={() => setShowGen(false)} resumes={resumes} apps={apps} onCreated={load} />
    </div>
  );
}

function GenerateModal({ open, onClose, resumes, apps, onCreated }: {
  open: boolean; onClose: () => void; resumes: JpResume[]; apps: JpApplication[]; onCreated: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const [resumeId, setResumeId] = useState(resumes.find((r) => r.is_primary)?.id ?? resumes[0]?.id ?? '');
  const [jd, setJd] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [appType, setAppType] = useState(false);
  const [appId, setAppId] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const selectedApp = appType ? apps.find((a) => a.id === appId) : null;
      const { body } = await api.generateCoverLetter(
        resumeId,
        jd || selectedApp?.job_description || '',
        company || selectedApp?.company_name,
        title || selectedApp?.job_title,
      );
      const { data } = await supabase.from('jp_cover_letters').insert({
        user_id: profile.id, resume_id: resumeId || null,
        application_id: appId || null,
        company_name: company || selectedApp?.company_name || null,
        job_title: title || selectedApp?.job_title || null,
        body,
      }).select().single();
      if (data) { toast.show('Cover letter generated!', 'success'); onCreated(); onClose(); }
    } catch (e) {
      if (e instanceof InsufficientCreditsError) toast.show('Out of credits.', 'error');
      else toast.show('Generation failed.', 'error');
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Generate Cover Letter" size="md">
      <div className="jp-form">
        <label><span>Resume</span>
          <select value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
            {resumes.length === 0 && <option value="">No resumes yet</option>}
            {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="jp-checkbox-inline"><input type="checkbox" checked={appType} onChange={(e) => setAppType(e.target.checked)} /> Use an existing application</label>
        {appType ? (
          <label><span>Application</span>
            <select value={appId} onChange={(e) => { setAppId(e.target.value); const a = apps.find((x) => x.id === e.target.value); if (a) { setCompany(a.company_name); setTitle(a.job_title); } }}>
              <option value="">Select…</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.company_name} — {a.job_title}</option>)}
            </select>
          </label>
        ) : (
          <>
            <div className="jp-form-row">
              <label><span>Company</span><input value={company} onChange={(e) => setCompany(e.target.value)} /></label>
              <label><span>Job title</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            </div>
            <label><span>Job description</span><textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={5} /></label>
          </>
        )}
        <div className="jp-form-actions">
          <button className="jp-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="jp-btn-primary" onClick={submit} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button>
        </div>
      </div>
    </Modal>
  );
}
