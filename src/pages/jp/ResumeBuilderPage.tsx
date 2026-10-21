import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Copy, Trash2, Star, Download, FileText,
  ArrowUp, ArrowDown, Sparkles, Target, Wand2, Linkedin,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Badge, EmptyState, LoadingSkeleton, Modal } from '@/components/ui';
import { api, InsufficientCreditsError } from '@/lib/api';
import type { JpResume, ResumeContent, ResumeExperience, ResumeEducation, ResumeProject } from '@/types/db';

export default function ResumeBuilderPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [resumes, setResumes] = useState<JpResume[]>([]);
  const [active, setActive] = useState<JpResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMatch, setShowMatch] = useState(false);
  const [showTailor, setShowTailor] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('jp_resumes').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
    const list = (data as JpResume[]) ?? [];
    setResumes(list);
    if (list.length > 0 && !active) setActive(list.find((r) => r.is_primary) ?? list[0]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const createResume = async () => {
    if (!profile) return;
    const { data } = await supabase.from('jp_resumes').insert({
      user_id: profile.id,
      name: 'Untitled Resume',
      template: 'modern',
      is_primary: resumes.length === 0,
      source: 'form',
      content: emptyContent(profile.full_name || ''),
    }).select().single();
    if (data) { setResumes((prev) => [data as JpResume, ...prev]); setActive(data as JpResume); }
  };

  const duplicate = async (r: JpResume) => {
    const { data } = await supabase.from('jp_resumes').insert({
      user_id: r.user_id, name: `${r.name} (copy)`, template: r.template, is_primary: false,
      source: 'form', content: r.content, target_role: r.target_role, target_industry: r.target_industry,
    }).select().single();
    if (data) { setResumes((prev) => [...prev, data as JpResume]); toast.show('Resume duplicated.', 'success'); }
  };

  const setPrimary = async (r: JpResume) => {
    await supabase.from('jp_resumes').update({ is_primary: false }).eq('user_id', r.user_id).neq('id', r.id);
    await supabase.from('jp_resumes').update({ is_primary: true }).eq('id', r.id);
    setResumes((prev) => prev.map((x) => ({ ...x, is_primary: x.id === r.id })));
    toast.show('Primary resume updated.', 'success');
  };

  const del = async (r: JpResume) => {
    await supabase.from('jp_resumes').delete().eq('id', r.id);
    setResumes((prev) => prev.filter((x) => x.id !== r.id));
    if (active?.id === r.id) setActive(resumes.find((x) => x.id !== r.id) ?? null);
    toast.show('Resume deleted.', 'info');
  };

  const updateContent = async (content: ResumeContent) => {
    if (!active) return;
    setActive({ ...active, content });
    const debounced = setTimeout(async () => {
      await supabase.from('jp_resumes').update({ content }).eq('id', active.id);
    }, 800);
    return () => clearTimeout(debounced);
  };

  if (loading) return <div className="jp-page-header"><h1>Resume Builder</h1><LoadingSkeleton className="jp-card-skel" /></div>;

  if (!active) {
    return (
      <div>
        <div className="jp-page-header"><div><h1>Resume Builder</h1><p>Create tailored resumes for every application</p></div></div>
        <EmptyState icon={<FileText size={36} />} title="No resumes yet"
          description="Create your first resume to start applying. You can tailor it for each job."
          action={<button className="jp-btn-primary" onClick={createResume}><Plus size={18} /> Create resume</button>} />
      </div>
    );
  }

  return (
    <div>
      <div className="jp-page-header">
        <div><h1>Resume Builder</h1><p>Edit your resume with a live preview</p></div>
        <div className="jp-resume-actions-top">
          <button className="jp-btn-ghost jp-btn-sm" onClick={() => setShowTailor(true)}><Wand2 size={16} /> Tailor to job</button>
          <button className="jp-btn-ghost jp-btn-sm" onClick={() => setShowMatch(true)}><Target size={16} /> Match score</button>
          <button className="jp-btn-primary jp-btn-sm" onClick={() => exportPdf(active)}><Download size={16} /> PDF</button>
          <button className="jp-btn-primary jp-btn-sm" onClick={() => exportDocx(active)}><Download size={16} /> DOCX</button>
        </div>
      </div>

      <div className="jp-resume-layout">
        <div className="jp-resume-list">
          {resumes.map((r) => (
            <div key={r.id} className={`jp-resume-list-item ${active.id === r.id ? 'active' : ''}`} onClick={() => setActive(r)}>
              <div className="jp-resume-list-info">
                <strong>{r.name}</strong>
                <span>{r.target_role || 'No target role'}</span>
                {r.is_primary && <Badge variant="primary">Primary</Badge>}
              </div>
              <div className="jp-resume-list-actions">
                <button onClick={(e) => { e.stopPropagation(); duplicate(r); }} title="Duplicate"><Copy size={14} /></button>
                <button onClick={(e) => { e.stopPropagation(); setPrimary(r); }} title="Set primary"><Star size={14} /></button>
                <button onClick={(e) => { e.stopPropagation(); del(r); }} title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          <button className="jp-btn-ghost jp-btn-sm jp-resume-add" onClick={createResume}><Plus size={14} /> New resume</button>
        </div>

        <ResumeEditor resume={active} onChange={updateContent} onUpdateResume={(u) => setActive({ ...active, ...u })} />
      </div>

      {showMatch && <MatchModal resume={active} onClose={() => setShowMatch(false)} />}
      {showTailor && <TailorModal resume={active} onClose={() => setShowTailor(false)} />}
    </div>
  );
}

function ResumeEditor({ resume, onChange, onUpdateResume }: {
  resume: JpResume;
  onChange: (c: ResumeContent) => void;
  onUpdateResume: (u: Partial<JpResume>) => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const c = resume.content;

  const set = (updates: Partial<ResumeContent>) => onChange({ ...c, ...updates });

  const aiRewrite = async (text: string, field: string) => {
    try {
      const { text: rewritten } = await api.rewriteText(text);
      toast.show(`${field} rewritten.`, 'success');
      return rewritten;
    } catch (e) {
      if (e instanceof InsufficientCreditsError) toast.show('Out of credits.', 'error');
      else toast.show('Rewrite failed.', 'error');
      return text;
    }
  };

  const genLinkedin = async () => {
    try {
      const { summary } = await api.linkedinSummary(resume.id);
      await supabase.from('jp_resumes').update({ linkedin_summary: summary }).eq('id', resume.id);
      onUpdateResume({ linkedin_summary: summary });
      toast.show('LinkedIn summary generated!', 'success');
    } catch (e) {
      if (e instanceof InsufficientCreditsError) toast.show('Out of credits.', 'error');
      else toast.show('Generation failed.', 'error');
    }
  };

  return (
    <div className="jp-resume-editor">
      <div className="jp-resume-form">
        <div className="jp-resume-form-header">
          <input className="jp-resume-name-input" value={resume.name} onChange={async (e) => {
            onUpdateResume({ name: e.target.value });
            await supabase.from('jp_resumes').update({ name: e.target.value }).eq('id', resume.id);
          }} />
          <select value={resume.template} onChange={async (e) => {
            onUpdateResume({ template: e.target.value });
            await supabase.from('jp_resumes').update({ template: e.target.value }).eq('id', resume.id);
          }}>
            <option value="modern">Modern</option>
            <option value="classic">Classic</option>
            <option value="minimal">Minimal</option>
          </select>
        </div>

        <Section title="Basics">
          <div className="jp-form-row">
            <input placeholder="Full name" value={c.basics.name} onChange={(e) => set({ basics: { ...c.basics, name: e.target.value } })} />
            <input placeholder="Email" value={c.basics.email} onChange={(e) => set({ basics: { ...c.basics, email: e.target.value } })} />
          </div>
          <div className="jp-form-row">
            <input placeholder="Phone" value={c.basics.phone} onChange={(e) => set({ basics: { ...c.basics, phone: e.target.value } })} />
            <input placeholder="Location" value={c.basics.location} onChange={(e) => set({ basics: { ...c.basics, location: e.target.value } })} />
          </div>
          <input placeholder="Headline" value={c.basics.headline} onChange={(e) => set({ basics: { ...c.basics, headline: e.target.value } })} />
        </Section>

        <Section title="Summary" action={<button className="jp-icon-btn" onClick={async () => { const r = await aiRewrite(c.summary, 'Summary'); set({ summary: r }); }}><Sparkles size={14} /> Rewrite</button>}>
          <textarea value={c.summary} onChange={(e) => set({ summary: e.target.value })} rows={3} />
        </Section>

        <Section title="Experience" action={<button className="jp-icon-btn" onClick={() => set({ experience: [...c.experience, emptyExp()] })}><Plus size={14} /> Add</button>}>
          {c.experience.map((exp, i) => (
            <div key={i} className="jp-exp-item">
              <div className="jp-exp-header">
                <input placeholder="Title" value={exp.title} onChange={(e) => updateExp(set, c, i, { title: e.target.value })} />
                <input placeholder="Company" value={exp.company} onChange={(e) => updateExp(set, c, i, { company: e.target.value })} />
                <div className="jp-exp-controls">
                  <button disabled={i === 0} onClick={() => moveItem(c.experience, i, -1, (arr) => set({ experience: arr }))}><ArrowUp size={14} /></button>
                  <button disabled={i === c.experience.length - 1} onClick={() => moveItem(c.experience, i, 1, (arr) => set({ experience: arr }))}><ArrowDown size={14} /></button>
                  <button onClick={() => set({ experience: c.experience.filter((_, idx) => idx !== i) })}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="jp-form-row">
                <input placeholder="Location" value={exp.location} onChange={(e) => updateExp(set, c, i, { location: e.target.value })} />
                <input placeholder="Start (e.g. 2021-01)" value={exp.start} onChange={(e) => updateExp(set, c, i, { start: e.target.value })} />
                <input placeholder="End" value={exp.end} disabled={exp.current} onChange={(e) => updateExp(set, c, i, { end: e.target.value })} />
              </div>
              <label className="jp-checkbox-inline"><input type="checkbox" checked={exp.current} onChange={(e) => updateExp(set, c, i, { current: e.target.checked, end: e.target.checked ? '' : exp.end })} /> Current role</label>
              {exp.bullets.map((b, bi) => (
                <div key={bi} className="jp-bullet-row">
                  <input placeholder="Achievement bullet" value={b} onChange={(e) => updateExp(set, c, i, { bullets: exp.bullets.map((x, xi) => xi === bi ? e.target.value : x) })} />
                  <button className="jp-icon-btn" onClick={async () => { const r = await aiRewrite(b, 'Bullet'); updateExp(set, c, i, { bullets: exp.bullets.map((x, xi) => xi === bi ? r : x) }); }}><Sparkles size={14} /></button>
                  <button onClick={() => updateExp(set, c, i, { bullets: exp.bullets.filter((_, xi) => xi !== bi) })}><Trash2 size={14} /></button>
                </div>
              ))}
              <button className="jp-icon-btn jp-add-bullet" onClick={() => updateExp(set, c, i, { bullets: [...exp.bullets, ''] })}><Plus size={14} /> Add bullet</button>
            </div>
          ))}
        </Section>

        <Section title="Education" action={<button className="jp-icon-btn" onClick={() => set({ education: [...c.education, emptyEdu()] })}><Plus size={14} /> Add</button>}>
          {c.education.map((edu, i) => (
            <div key={i} className="jp-exp-item">
              <div className="jp-form-row">
                <input placeholder="School" value={edu.school} onChange={(e) => updateEdu(set, c, i, { school: e.target.value })} />
                <input placeholder="Degree" value={edu.degree} onChange={(e) => updateEdu(set, c, i, { degree: e.target.value })} />
              </div>
              <div className="jp-form-row">
                <input placeholder="Field" value={edu.field} onChange={(e) => updateEdu(set, c, i, { field: e.target.value })} />
                <input placeholder="Start" value={edu.start} onChange={(e) => updateEdu(set, c, i, { start: e.target.value })} />
                <input placeholder="End" value={edu.end} onChange={(e) => updateEdu(set, c, i, { end: e.target.value })} />
              </div>
              <button onClick={() => set({ education: c.education.filter((_, idx) => idx !== i) })}><Trash2 size={14} /></button>
            </div>
          ))}
        </Section>

        <Section title="Skills" action={<button className="jp-icon-btn" onClick={() => set({ skills: [...c.skills, ''] })}><Plus size={14} /></button>}>
          <div className="jp-skills-tags">
            {c.skills.map((s, i) => (
              <span key={i} className="jp-skill-tag">{s || '—'}<button onClick={() => set({ skills: c.skills.filter((_, idx) => idx !== i) })}><Trash2 size={12} /></button></span>
            ))}
          </div>
        </Section>

        <Section title="Projects" action={<button className="jp-icon-btn" onClick={() => set({ projects: [...c.projects, emptyProj()] })}><Plus size={14} /> Add</button>}>
          {c.projects.map((p, i) => (
            <div key={i} className="jp-exp-item">
              <input placeholder="Project name" value={p.name} onChange={(e) => updateProj(set, c, i, { name: e.target.value })} />
              <input placeholder="Description" value={p.description} onChange={(e) => updateProj(set, c, i, { description: e.target.value })} />
              <input placeholder="URL" value={p.url} onChange={(e) => updateProj(set, c, i, { url: e.target.value })} />
              <button onClick={() => set({ projects: c.projects.filter((_, idx) => idx !== i) })}><Trash2 size={14} /></button>
            </div>
          ))}
        </Section>

        <Section title="Certifications" action={<button className="jp-icon-btn" onClick={() => set({ certifications: [...c.certifications, ''] })}><Plus size={14} /></button>}>
          <div className="jp-skills-tags">
            {c.certifications.map((s, i) => (
              <span key={i} className="jp-skill-tag">{s || '—'}<button onClick={() => set({ certifications: c.certifications.filter((_, idx) => idx !== i) })}><Trash2 size={12} /></button></span>
            ))}
          </div>
        </Section>

        <Section title="LinkedIn Summary" action={<button className="jp-icon-btn" onClick={genLinkedin}><Linkedin size={14} /> Generate</button>}>
          <textarea value={resume.linkedin_summary || ''} readOnly rows={3} placeholder="Click Generate to create a LinkedIn summary from your resume." />
        </Section>
      </div>

      <ResumePreview content={c} template={resume.template} />
    </div>
  );
}

function ResumePreview({ content, template }: { content: ResumeContent; template: string }) {
  return (
    <div className={`jp-resume-preview jp-template-${template}`}>
      <div className="jp-preview-paper">
        <h1>{content.basics.name || 'Your Name'}</h1>
        <p className="jp-preview-headline">{content.basics.headline || 'Your Headline'}</p>
        <p className="jp-preview-contact">
          {content.basics.email && <span>{content.basics.email}</span>}
          {content.basics.phone && <span> · {content.basics.phone}</span>}
          {content.basics.location && <span> · {content.basics.location}</span>}
        </p>
        {content.summary && (
          <section><h2>Summary</h2><p>{content.summary}</p></section>
        )}
        {content.experience.filter((e) => e.company || e.title).length > 0 && (
          <section><h2>Experience</h2>
            {content.experience.filter((e) => e.company || e.title).map((e, i) => (
              <div key={i} className="jp-preview-exp">
                <div className="jp-preview-exp-header">
                  <strong>{e.title} — {e.company}</strong>
                  <span>{e.start}{e.current ? ' — Present' : e.end ? ` — ${e.end}` : ''}</span>
                </div>
                {e.location && <small>{e.location}</small>}
                <ul>{e.bullets.filter((b) => b).map((b, bi) => <li key={bi}>{b}</li>)}</ul>
              </div>
            ))}
          </section>
        )}
        {content.education.filter((e) => e.school).length > 0 && (
          <section><h2>Education</h2>
            {content.education.filter((e) => e.school).map((e, i) => (
              <div key={i} className="jp-preview-exp">
                <div className="jp-preview-exp-header">
                  <strong>{e.degree}{e.field ? `, ${e.field}` : ''} — {e.school}</strong>
                  <span>{e.start}{e.end ? ` — ${e.end}` : ''}</span>
                </div>
              </div>
            ))}
          </section>
        )}
        {content.skills.filter((s) => s).length > 0 && (
          <section><h2>Skills</h2><p>{content.skills.filter((s) => s).join(' · ')}</p></section>
        )}
        {content.projects.filter((p) => p.name).length > 0 && (
          <section><h2>Projects</h2>
            {content.projects.filter((p) => p.name).map((p, i) => (
              <div key={i}><strong>{p.name}</strong>{p.description && <p>{p.description}</p>}{p.url && <small>{p.url}</small>}</div>
            ))}
          </section>
        )}
        {content.certifications.filter((s) => s).length > 0 && (
          <section><h2>Certifications</h2><p>{content.certifications.filter((s) => s).join(' · ')}</p></section>
        )}
      </div>
    </div>
  );
}

function MatchModal({ resume, onClose }: { resume: JpResume; onClose: () => void }) {
  const toast = useToast();
  const [jd, setJd] = useState('');
  const [result, setResult] = useState<{ score: number; matched: string[]; missing: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.matchResume(resume.id, jd);
      setResult(r);
    } catch (e) {
      if (e instanceof InsufficientCreditsError) toast.show('Out of credits.', 'error');
      else toast.show('Match failed.', 'error');
    }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title="Match Score & ATS Check" size="md">
      <p className="jp-muted">Paste a job description to see how well your resume matches.</p>
      <textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={5} placeholder="Paste job description…" />
      <button className="jp-btn-primary" onClick={run} disabled={busy || !jd}>{busy ? 'Analyzing…' : 'Run match'}</button>
      {result && (
        <div className="jp-match-result">
          <div className="jp-match-ring"><span>{result.score}%</span></div>
          <div className="jp-match-keywords">
            <div><h4>Matched</h4>{result.matched.map((k) => <Badge key={k} variant="success">{k}</Badge>)}</div>
            <div><h4>Missing</h4>{result.missing.map((k) => <Badge key={k} variant="warning">{k}</Badge>)}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TailorModal({ resume, onClose }: { resume: JpResume; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [jd, setJd] = useState('');
  const [suggestions, setSuggestions] = useState<{ section: string; before: string; after: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.tailorResume(resume.id, jd);
      setSuggestions(r.suggestions);
    } catch (e) {
      if (e instanceof InsufficientCreditsError) toast.show('Out of credits.', 'error');
      else toast.show('Tailoring failed.', 'error');
    }
    setBusy(false);
  };

  const saveAsNew = async () => {
    if (!profile) return;
    const newContent = { ...resume.content };
    suggestions?.forEach((s) => {
      if (s.section === 'summary') newContent.summary = s.after;
    });
    const { data } = await supabase.from('jp_resumes').insert({
      user_id: profile.id, name: `${resume.name} (tailored)`, template: resume.template, is_primary: false,
      source: 'form', content: newContent,
    }).select().single();
    if (data) toast.show('Saved as new resume version.', 'success');
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Tailor Resume to Job" size="md">
      <p className="jp-muted">Paste a job description to get suggested rewrites.</p>
      <textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={5} placeholder="Paste job description…" />
      <button className="jp-btn-primary" onClick={run} disabled={busy || !jd}>{busy ? 'Tailoring…' : 'Tailor resume'}</button>
      {suggestions && (
        <div className="jp-tailor-suggestions">
          {suggestions.map((s, i) => (
            <div key={i} className="jp-tailor-diff">
              <small>{s.section}</small>
              <div className="jp-diff-before">{s.before}</div>
              <div className="jp-diff-after">{s.after}</div>
            </div>
          ))}
          <button className="jp-btn-primary" onClick={saveAsNew}>Save as new version</button>
        </div>
      )}
    </Modal>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="jp-resume-section">
      <div className="jp-resume-section-header"><h3>{title}</h3>{action}</div>
      {children}
    </div>
  );
}

function emptyContent(name: string): ResumeContent {
  return { basics: { name, email: '', phone: '', location: '', headline: '', links: [] }, summary: '', experience: [emptyExp()], education: [emptyEdu()], skills: [], projects: [], certifications: [] };
}
function emptyExp(): ResumeExperience { return { company: '', title: '', location: '', start: '', end: '', current: false, bullets: [''] }; }
function emptyEdu(): ResumeEducation { return { school: '', degree: '', field: '', start: '', end: '' }; }
function emptyProj(): ResumeProject { return { name: '', description: '', url: '' }; }

function updateExp(set: (u: Partial<ResumeContent>) => void, c: ResumeContent, i: number, u: Partial<ResumeExperience>) {
  set({ experience: c.experience.map((e, idx) => idx === i ? { ...e, ...u } : e) });
}
function updateEdu(set: (u: Partial<ResumeContent>) => void, c: ResumeContent, i: number, u: Partial<ResumeEducation>) {
  set({ education: c.education.map((e, idx) => idx === i ? { ...e, ...u } : e) });
}
function updateProj(set: (u: Partial<ResumeContent>) => void, c: ResumeContent, i: number, u: Partial<ResumeProject>) {
  set({ projects: c.projects.map((p, idx) => idx === i ? { ...p, ...u } : p) });
}
function moveItem<T>(arr: T[], i: number, dir: number, cb: (arr: T[]) => void) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  cb(copy);
}

async function exportPdf(resume: JpResume) {
  const { default: html2pdf } = await import('html2pdf.js');
  const el = document.querySelector('.jp-preview-paper') as HTMLElement;
  if (!el) return;
  html2pdf().set({ filename: `${resume.name}.pdf`, margin: [10, 10, 10, 10] }).from(el).save();
}

async function exportDocx(resume: JpResume) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
  const c = resume.content;
  const children = [
    new Paragraph({ children: [new TextRun({ text: c.basics.name, bold: true, size: 32 })] }),
    new Paragraph({ children: [new TextRun({ text: `${c.basics.email} ${c.basics.phone} ${c.basics.location}`.trim(), size: 18 })] }),
  ];
  if (c.summary) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Summary')] })); children.push(new Paragraph({ children: [new TextRun(c.summary)] })); }
  c.experience.filter((e) => e.company || e.title).forEach((e) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`${e.title} — ${e.company}`)] }));
    e.bullets.filter((b) => b).forEach((b) => children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b)] })));
  });
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${resume.name}.docx`;
  a.click();
}
