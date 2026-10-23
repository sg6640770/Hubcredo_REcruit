import { useEffect, useState } from 'react';
import { Plus, Download, FileText, Wand2, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { EmptyState, LoadingSkeleton, Modal } from '@/components/ui';
import { ai, aiErrorMessage } from '@/lib/jpAi';
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
  const [polishing, setPolishing] = useState(false);

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

  const polish = async (letter: JpCoverLetter) => {
    if (!letter.body.trim()) return;
    setPolishing(true);
    try {
      const { text } = await ai.rewrite(letter.body, {
        instruction: 'Polish this cover letter: tighter sentences, confident natural tone, keep the same structure, greeting and sign-off.',
        context: [letter.job_title, letter.company_name].filter(Boolean).join(' at '),
      });
      setActive({ ...letter, body: text });
      await save(letter.id, text);
      toast.show('Cover letter polished.', 'success');
    } catch (e) {
      toast.show(aiErrorMessage(e, 'Polish failed.'), 'error');
    }
    setPolishing(false);
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
          description="AI writes a cover letter from your whole resume and the job you're targeting."
          action={<button className="jp-btn-primary" onClick={() => setShowGen(true)}><Wand2 size={18} /> Generate with AI</button>} />
      ) : active ? (
        <div className="jp-cover-editor">
          <button className="jp-back-link" onClick={() => setActive(null)}>← All cover letters</button>
          <h2>{active.company_name} — {active.job_title}</h2>
          <textarea className="jp-cover-textarea" value={active.body} onChange={(e) => { setActive({ ...active, body: e.target.value }); }} onBlur={() => save(active.id, active.body)} rows={16} />
          <div className="jp-cover-actions">
            <button className="jp-btn-ghost jp-btn-sm" onClick={() => polish(active)} disabled={polishing}>
              {polishing ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} Polish with AI
            </button>
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

      <GenerateModal
        open={showGen}
        onClose={() => setShowGen(false)}
        resumes={resumes}
        apps={apps}
        onCreated={async (created) => { await load(); if (created) setActive(created); }}
      />
    </div>
  );
}

function GenerateModal({ open, onClose, resumes, apps, onCreated }: {
  open: boolean; onClose: () => void; resumes: JpResume[]; apps: JpApplication[]; onCreated: (created?: JpCoverLetter) => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const [resumeId, setResumeId] = useState('');
  const [jd, setJd] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [useApp, setUseApp] = useState(false);
  const [appId, setAppId] = useState('');
  const [busy, setBusy] = useState(false);

  // Pick the primary resume as soon as resumes are available
  useEffect(() => {
    if (!resumeId && resumes.length > 0) setResumeId((resumes.find((r) => r.is_primary) ?? resumes[0]).id);
  }, [resumes, resumeId]);

  const submit = async () => {
    if (!profile) return;
    if (!resumeId) { toast.show('Create a resume first, then I can write from it.', 'info'); return; }

    const selectedApp = useApp ? apps.find((a) => a.id === appId) : null;
    const jobDescription = (jd || selectedApp?.job_description || '').trim();
    const finalCompany = (company || selectedApp?.company_name || '').trim();
    const finalTitle = (title || selectedApp?.job_title || '').trim();
    if (!jobDescription && !finalTitle) { toast.show('Add a job title or paste the job description.', 'info'); return; }

    setBusy(true);
    try {
      const { body } = await ai.coverLetter(resumeId, jobDescription, finalCompany || undefined, finalTitle || undefined);
      const { data } = await supabase.from('jp_cover_letters').insert({
        user_id: profile.id,
        resume_id: resumeId,
        application_id: selectedApp ? selectedApp.id : null,
        company_name: finalCompany || null,
        job_title: finalTitle || null,
        body,
      }).select().single();
      if (data) {
        toast.show('Cover letter generated!', 'success');
        onCreated(data as JpCoverLetter);
        onClose();
        setJd('');
      }
    } catch (e) {
      toast.show(aiErrorMessage(e, 'Generation failed.'), 'error');
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
          <small>AI reads this whole resume (experience, skills, education, projects) to write the letter.</small>
        </label>
        <label className="jp-checkbox-inline"><input type="checkbox" checked={useApp} onChange={(e) => setUseApp(e.target.checked)} /> Use an existing application</label>
        {useApp ? (
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
            <label><span>Job description</span><textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={6} placeholder="Paste the job description for the best result" /></label>
          </>
        )}
        <div className="jp-form-actions">
          <button className="jp-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="jp-btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Writing…' : <><Sparkles size={16} /> Generate with AI</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
