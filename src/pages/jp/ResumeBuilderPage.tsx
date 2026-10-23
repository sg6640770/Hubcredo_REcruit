import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus, Copy, Trash2, Star, Download, FileText,
  ArrowUp, ArrowDown, Sparkles, Target, Wand2, Linkedin, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Badge, EmptyState, LoadingSkeleton, Modal } from '@/components/ui';
import { ai, aiErrorMessage, type MatchResult, type TailorResult } from '@/lib/jpAi';
import type { JpResume, ResumeContent, ResumeExperience, ResumeEducation, ResumeProject } from '@/types/db';

export default function ResumeBuilderPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [resumes, setResumes] = useState<JpResume[]>([]);
  const [active, setActive] = useState<JpResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMatch, setShowMatch] = useState(false);
  const [showTailor, setShowTailor] = useState(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('jp_resumes').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
    const list = (data as JpResume[]) ?? [];
    setResumes(list);
    if (list.length > 0 && !active) setActive(list.find((r) => r.is_primary) ?? list[0]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // Keep the list and the active resume in sync so switching tabs never shows stale content
  const patchResume = (id: string, patch: Partial<JpResume>) => {
    setResumes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setActive((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };

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
    setActive((prev) => (prev ? { ...prev, is_primary: prev.id === r.id } : prev));
    toast.show('Primary resume updated.', 'success');
  };

  const del = async (r: JpResume) => {
    await supabase.from('jp_resumes').delete().eq('id', r.id);
    const remaining = resumes.filter((x) => x.id !== r.id);
    setResumes(remaining);
    if (active?.id === r.id) setActive(remaining[0] ?? null);
    toast.show('Resume deleted.', 'info');
  };

  // Debounced autosave (800 ms after the last keystroke, per resume)
  const updateContent = (content: ResumeContent) => {
    if (!active) return;
    const id = active.id;
    patchResume(id, { content });
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(async () => {
      await supabase.from('jp_resumes').update({ content }).eq('id', id);
    }, 800);
  };

  const onTailoredSaved = (created: JpResume) => {
    setResumes((prev) => [created, ...prev]);
    setActive(created);
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

        <ResumeEditor key={active.id} resume={active} onChange={updateContent} onUpdateResume={(u) => patchResume(active.id, u)} />
      </div>

      {showMatch && <MatchModal resume={active} onClose={() => setShowMatch(false)} />}
      {showTailor && <TailorModal resume={active} onClose={() => setShowTailor(false)} onSaved={onTailoredSaved} />}
    </div>
  );
}

function ResumeEditor({ resume, onChange, onUpdateResume }: {
  resume: JpResume;
  onChange: (c: ResumeContent) => void;
  onUpdateResume: (u: Partial<JpResume>) => void;
}) {
  const toast = useToast();
  const c = resume.content;
  const [busy, setBusy] = useState<string | null>(null);

  const set = (updates: Partial<ResumeContent>) => onChange({ ...c, ...updates });

  const aiRewrite = async (text: string, field: string, context?: string, key = field) => {
    if (!text.trim()) { toast.show(`Write something in ${field.toLowerCase()} first.`, 'info'); return text; }
    setBusy(key);
    try {
      const { text: rewritten } = await ai.rewrite(text, { context });
      toast.show(`${field} rewritten.`, 'success');
      return rewritten;
    } catch (e) {
      toast.show(aiErrorMessage(e, 'Rewrite failed.'), 'error');
      return text;
    } finally {
      setBusy(null);
    }
  };

  const generateSummary = async () => {
    setBusy('summary-gen');
    try {
      const { text } = await ai.summary(resume.id, c, { targetRole: resume.target_role || undefined });
      set({ summary: text });
      toast.show('Summary generated from your resume.', 'success');
    } catch (e) {
      toast.show(aiErrorMessage(e, 'Summary generation failed.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const genLinkedin = async () => {
    setBusy('linkedin');
    try {
      const { summary } = await ai.linkedinSummary(resume.id, c);
      await supabase.from('jp_resumes').update({ linkedin_summary: summary }).eq('id', resume.id);
      onUpdateResume({ linkedin_summary: summary });
      toast.show('LinkedIn summary generated!', 'success');
    } catch (e) {
      toast.show(aiErrorMessage(e, 'Generation failed.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const spin = <Loader2 size={14} className="spin" />;

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

        <Section
          title="Summary"
          action={
            <div className="jp-resume-actions-top">
              <button className="jp-icon-btn" disabled={busy !== null} onClick={generateSummary} title="Write a summary from your whole resume">
                {busy === 'summary-gen' ? spin : <Sparkles size={14} />} Generate with AI
              </button>
              <button className="jp-icon-btn" disabled={busy !== null || !c.summary.trim()} onClick={async () => { const r = await aiRewrite(c.summary, 'Summary', undefined, 'summary-rw'); set({ summary: r }); }}>
                {busy === 'summary-rw' ? spin : <Wand2 size={14} />} Rewrite
              </button>
            </div>
          }
        >
          <textarea value={c.summary} onChange={(e) => set({ summary: e.target.value })} rows={4} placeholder="Click “Generate with AI” to write this from your experience, skills and education." />
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
                  <button
                    className="jp-icon-btn"
                    title="Improve this bullet with AI"
                    disabled={busy !== null}
                    onClick={async () => {
                      const r = await aiRewrite(b, 'Bullet', `${exp.title} at ${exp.company}`, `bullet-${i}-${bi}`);
                      updateExp(set, c, i, { bullets: exp.bullets.map((x, xi) => xi === bi ? r : x) });
                    }}
                  >
                    {busy === `bullet-${i}-${bi}` ? spin : <Sparkles size={14} />}
                  </button>
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
              <span key={i} className="jp-skill-tag">
                <input
                  value={s}
                  placeholder="Skill"
                  size={Math.max(6, s.length + 1)}
                  onChange={(e) => set({ skills: c.skills.map((x, xi) => (xi === i ? e.target.value : x)) })}
                  style={{ border: 0, background: 'transparent', outline: 0, color: 'inherit', font: 'inherit', padding: 0 }}
                />
                <button onClick={() => set({ skills: c.skills.filter((_, idx) => idx !== i) })}><Trash2 size={12} /></button>
              </span>
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
              <span key={i} className="jp-skill-tag">
                <input
                  value={s}
                  placeholder="Certification"
                  size={Math.max(8, s.length + 1)}
                  onChange={(e) => set({ certifications: c.certifications.map((x, xi) => (xi === i ? e.target.value : x)) })}
                  style={{ border: 0, background: 'transparent', outline: 0, color: 'inherit', font: 'inherit', padding: 0 }}
                />
                <button onClick={() => set({ certifications: c.certifications.filter((_, idx) => idx !== i) })}><Trash2 size={12} /></button>
              </span>
            ))}
          </div>
        </Section>

        <Section
          title="LinkedIn Summary"
          action={
            <div className="jp-resume-actions-top">
              <button className="jp-icon-btn" disabled={busy !== null} onClick={genLinkedin} title="Write your LinkedIn About section from your whole resume">
                {busy === 'linkedin' ? spin : <Linkedin size={14} />} Generate with AI
              </button>
              <button
                className="jp-icon-btn"
                disabled={!resume.linkedin_summary}
                onClick={() => { navigator.clipboard.writeText(resume.linkedin_summary || ''); toast.show('Copied to clipboard.', 'success'); }}
              >
                <Copy size={14} /> Copy
              </button>
            </div>
          }
        >
          <textarea
            value={resume.linkedin_summary || ''}
            rows={6}
            placeholder="Click “Generate with AI” to create a LinkedIn About section from your resume. You can edit it here."
            onChange={(e) => onUpdateResume({ linkedin_summary: e.target.value })}
            onBlur={async () => { await supabase.from('jp_resumes').update({ linkedin_summary: resume.linkedin_summary || null }).eq('id', resume.id); }}
          />
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
  const [result, setResult] = useState<MatchResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await ai.match(resume.id, resume.content, jd));
    } catch (e) {
      toast.show(aiErrorMessage(e, 'Match failed.'), 'error');
    }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title="Match Score & ATS Check" size="md">
      <p className="jp-muted">Paste a job description. AI compares it with your full resume and shows which requirements you cover and which you don't.</p>
      <textarea className="jp-cover-textarea" value={jd} onChange={(e) => setJd(e.target.value)} rows={6} placeholder="Paste job description…" />
      <button className="jp-btn-primary" onClick={run} disabled={busy || jd.trim().length < 40}>
        {busy ? 'Analyzing…' : <><Sparkles size={16} /> Run match with AI</>}
      </button>
      {result && (
        <div className="jp-match-result">
          <div className="jp-match-ring"><span>{result.score}%</span></div>
          <p className="jp-muted" style={{ textAlign: 'center', marginBottom: 16 }}>Keyword coverage of the job's key requirements</p>
          {result.verdict && <p style={{ marginBottom: 16 }}>{result.verdict}</p>}
          <div className="jp-match-keywords">
            <div><h4>Matched ({result.matched.length})</h4><div>{result.matched.length ? result.matched.map((k) => <Badge key={k} variant="success">{k}</Badge>) : <span className="jp-muted">None found</span>}</div></div>
            <div><h4>Missing ({result.missing.length})</h4><div>{result.missing.length ? result.missing.map((k) => <Badge key={k} variant="warning">{k}</Badge>) : <span className="jp-muted">Nothing missing</span>}</div></div>
            {result.tips.length > 0 && (
              <div>
                <h4>How to improve</h4>
                <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
                  {result.tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function TailorModal({ resume, onClose, onSaved }: { resume: JpResume; onClose: () => void; onSaved: (r: JpResume) => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [jd, setJd] = useState('');
  const [result, setResult] = useState<TailorResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await ai.tailor(resume.id, resume.content, jd));
    } catch (e) {
      toast.show(aiErrorMessage(e, 'Tailoring failed.'), 'error');
    }
    setBusy(false);
  };

  const saveAsNew = async () => {
    if (!profile || !result) return;
    const { data, error } = await supabase.from('jp_resumes').insert({
      user_id: profile.id,
      name: `${resume.name} (tailored)`,
      template: resume.template,
      is_primary: false,
      source: 'form',
      content: result.tailored,
      target_role: resume.target_role,
      target_industry: resume.target_industry,
    }).select().single();
    if (error || !data) { toast.show('Could not save the tailored version.', 'error'); return; }
    toast.show('Saved as a new resume version.', 'success');
    onSaved(data as JpResume);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Tailor Resume to Job" size="lg">
      <p className="jp-muted">AI rewrites your summary, reorders skills and sharpens bullets for this job, using only what is already in your resume. Your original stays untouched; the result is saved as a new version.</p>
      <textarea className="jp-cover-textarea" value={jd} onChange={(e) => setJd(e.target.value)} rows={6} placeholder="Paste job description…" />
      <button className="jp-btn-primary" onClick={run} disabled={busy || jd.trim().length < 40}>
        {busy ? 'Tailoring…' : <><Sparkles size={16} /> Tailor with AI</>}
      </button>
      {result && (
        <div className="jp-tailor-suggestions">
          {result.suggestions.length === 0 && <p className="jp-muted">Your resume already fits this job well. No changes suggested.</p>}
          {result.suggestions.map((s, i) => (
            <div key={i} className="jp-tailor-diff">
              <small>{s.label}</small>
              <div className="jp-diff-before" style={{ whiteSpace: 'pre-wrap' }}>{s.before}</div>
              <div className="jp-diff-after" style={{ whiteSpace: 'pre-wrap' }}>{s.after}</div>
            </div>
          ))}
          {result.gaps.length > 0 && (
            <div className="jp-tailor-diff">
              <small>Not shown in your resume (add these only if they are true)</small>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.6, marginTop: 6 }}>
                {result.gaps.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          )}
          {result.suggestions.length > 0 && (
            <button className="jp-btn-primary" onClick={saveAsNew}>Save as new version</button>
          )}
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
  const skills = c.skills.filter((s) => s);
  if (skills.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Skills')] }));
    children.push(new Paragraph({ children: [new TextRun(skills.join(' · '))] }));
  }
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${resume.name}.docx`;
  a.click();
}
