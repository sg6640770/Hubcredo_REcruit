import express, { Router } from 'express';
import type { Request, Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* ═══════════════════════════════════════════════════════════════════════
   JobPilot AI routes (Groq)
   Mounted at /api/jobpilot/ai  — see server/index.ts note in the instructions.

   Env (server only, never VITE_ prefixed):
     GROQ_API_KEY               required
     GROQ_MODEL                 optional, default openai/gpt-oss-120b
     SUPABASE_URL               required
     SUPABASE_SERVICE_ROLE_KEY  required
   ═══════════════════════════════════════════════════════════════════════ */

const router = Router();
router.use(express.json({ limit: '1mb' }));

/* ── Types ───────────────────────────────────────────────────────────── */

type Exp = { company: string; title: string; location: string; start: string; end: string; current: boolean; bullets: string[] };
type Edu = { school: string; degree: string; field: string; start: string; end: string };
type Proj = { name: string; description: string; url: string };
type ResumeContent = {
  basics: { name: string; email: string; phone: string; location: string; headline: string; links?: unknown[] };
  summary: string;
  experience: Exp[];
  education: Edu[];
  skills: string[];
  projects: Proj[];
  certifications: string[];
};
type Candidate = {
  id: string;
  full_name: string | null;
  current_job_title: string | null;
  target_role: string | null;
  target_industry: string | null;
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ── Supabase (service role, lazy) ───────────────────────────────────── */

let adminClient: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

/* ── Simple per-user rate limit (protects the Groq key) ──────────────── */

const hits = new Map<string, number[]>();
const LIMIT = 30;
const WINDOW_MS = 60_000;
function rateLimit(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) throw new HttpError(429, 'Too many AI requests. Please wait a minute and try again.');
  recent.push(now);
  hits.set(userId, recent);
}

/* ── Auth: Supabase JWT + must be a JobPilot candidate ───────────────── */

async function requireCandidate(req: Request): Promise<Candidate> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing auth token.');

  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Session expired. Please sign in again.');

  const { data: profile } = await admin
    .from('jp_profiles')
    .select('id, full_name, current_job_title, target_role, target_industry')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile) throw new HttpError(403, 'A JobPilot candidate account is required.');

  rateLimit(profile.id);
  return profile as Candidate;
}

/* ── Resume loading (ownership enforced) + normalising ───────────────── */

function normalise(raw: any): ResumeContent {
  const c = raw && typeof raw === 'object' ? raw : {};
  const b = c.basics && typeof c.basics === 'object' ? c.basics : {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    basics: { name: str(b.name), email: str(b.email), phone: str(b.phone), location: str(b.location), headline: str(b.headline), links: arr(b.links) },
    summary: str(c.summary),
    experience: arr<any>(c.experience).map((e) => ({
      company: str(e?.company), title: str(e?.title), location: str(e?.location), start: str(e?.start), end: str(e?.end),
      current: Boolean(e?.current), bullets: arr<unknown>(e?.bullets).map(str),
    })),
    education: arr<any>(c.education).map((e) => ({
      school: str(e?.school), degree: str(e?.degree), field: str(e?.field), start: str(e?.start), end: str(e?.end),
    })),
    skills: arr<unknown>(c.skills).map(str),
    projects: arr<any>(c.projects).map((p) => ({ name: str(p?.name), description: str(p?.description), url: str(p?.url) })),
    certifications: arr<unknown>(c.certifications).map(str),
  };
}

async function loadResume(userId: string, resumeId: unknown, clientContent: unknown) {
  if (typeof resumeId !== 'string' || !resumeId) throw new HttpError(400, 'resume_id is required.');
  const { data: resume } = await getAdmin()
    .from('jp_resumes')
    .select('id, user_id, name, content, target_role, target_industry')
    .eq('id', resumeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!resume) throw new HttpError(404, 'Resume not found.');

  // Prefer what the user is looking at right now (unsaved edits), fall back to the stored copy.
  let content = normalise(resume.content);
  if (clientContent && typeof clientContent === 'object' && JSON.stringify(clientContent).length < 80_000) {
    content = normalise(clientContent);
  }
  return { resume, content };
}

function resumeToText(c: ResumeContent): string {
  const lines: string[] = [];
  const b = c.basics;
  if (b.name) lines.push(`NAME: ${b.name}`);
  if (b.headline) lines.push(`HEADLINE: ${b.headline}`);
  if (b.location) lines.push(`LOCATION: ${b.location}`);
  if (c.summary.trim()) lines.push('', 'SUMMARY:', c.summary.trim());

  const exp = c.experience.filter((e) => e.title || e.company);
  if (exp.length) {
    lines.push('', 'EXPERIENCE:');
    for (const e of exp) {
      const dates = [e.start, e.current ? 'Present' : e.end].filter(Boolean).join(' – ');
      lines.push(`- ${[e.title, e.company].filter(Boolean).join(' at ')}${dates ? ` (${dates})` : ''}${e.location ? `, ${e.location}` : ''}`);
      for (const bl of e.bullets.filter((x) => x.trim())) lines.push(`    • ${bl.trim()}`);
    }
  }
  const edu = c.education.filter((e) => e.school || e.degree);
  if (edu.length) {
    lines.push('', 'EDUCATION:');
    for (const e of edu) lines.push(`- ${[e.degree, e.field].filter(Boolean).join(', ')}${e.school ? ` — ${e.school}` : ''}${e.end ? ` (${e.end})` : ''}`);
  }
  const skills = c.skills.filter((s) => s.trim());
  if (skills.length) lines.push('', `SKILLS: ${skills.join(', ')}`);
  const projs = c.projects.filter((p) => p.name);
  if (projs.length) {
    lines.push('', 'PROJECTS:');
    for (const p of projs) lines.push(`- ${p.name}${p.description ? `: ${p.description}` : ''}`);
  }
  const certs = c.certifications.filter((s) => s.trim());
  if (certs.length) lines.push('', `CERTIFICATIONS: ${certs.join(', ')}`);
  return lines.join('\n');
}

function isResumeEmpty(c: ResumeContent): boolean {
  return resumeToText(c).replace(/NAME:.*\n?/, '').trim().length < 30;
}

function cleanJd(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, 12_000) : '';
}

/* ── Groq ────────────────────────────────────────────────────────────── */

type Msg = { role: 'system' | 'user'; content: string };

async function groqChat(messages: Msg[], opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new HttpError(500, 'AI is not configured on the server (GROQ_API_KEY is missing).');
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_completion_tokens: opts.maxTokens ?? 2000,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  if (model.includes('gpt-oss')) body.reasoning_effort = 'low';

  let lastStatus = 500;
  let lastMsg = 'AI request failed.';
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: globalThis.Response;
    try {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpError(502, 'Could not reach the AI provider.');
    }

    if (res.ok) {
      const data: any = await res.json();
      const text: string = data?.choices?.[0]?.message?.content ?? '';
      if (!text.trim()) throw new HttpError(502, 'The AI returned an empty answer. Please try again.');
      return text;
    }

    const err: any = await res.json().catch(() => ({}));
    lastStatus = res.status;
    lastMsg = err?.error?.message || `AI request failed (${res.status}).`;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    break;
  }

  if (lastStatus === 401) throw new HttpError(500, 'The server\'s Groq API key is invalid.');
  if (lastStatus === 429) throw new HttpError(429, 'The AI is busy right now. Please try again in a moment.');
  throw new HttpError(502, lastMsg);
}

function parseJson(raw: string): any {
  const stripped = raw.replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch { /* fall through */ }
    }
    throw new HttpError(502, 'The AI returned an unreadable answer. Please try again.');
  }
}

function cleanText(raw: string): string {
  return raw
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim();
}

const RULES = `You are an expert career coach and resume writer.
HARD RULES:
- Use ONLY facts that appear in the candidate's resume. Never invent employers, job titles, dates, degrees, certifications, tools, metrics or achievements.
- If something is missing, write around it. Do not guess numbers.
- Plain, concrete, confident language. No buzzword filler ("results-driven", "passionate", "dynamic", "synergy").
- Do not use markdown, emojis or hashtags unless told otherwise.`;

/* ── Route wrapper ───────────────────────────────────────────────────── */

const route =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      console.error('[jobpilot-ai]', e);
      res.status(500).json({ error: 'Something went wrong on the server.' });
    }
  };

/* ═══════════════════════════════════════════════════════════════════════
   POST /summary — resume summary from the full resume
   body: { resume_id, content?, job_description?, target_role? }
   ═══════════════════════════════════════════════════════════════════════ */
router.post('/summary', route(async (req, res) => {
  const user = await requireCandidate(req);
  const { resume, content } = await loadResume(user.id, req.body?.resume_id, req.body?.content);
  if (isResumeEmpty(content)) throw new HttpError(400, 'Add some experience, education or skills first, then I can write your summary.');

  const jd = cleanJd(req.body?.job_description);
  const targetRole = (typeof req.body?.target_role === 'string' && req.body.target_role.trim()) || resume.target_role || user.target_role || '';

  const out = await groqChat([
    { role: 'system', content: RULES },
    {
      role: 'user',
      content: `Write the professional SUMMARY section for this resume.
Requirements: 3 to 4 sentences, maximum 80 words, no first-person pronouns ("I", "my"), start with the candidate's strongest professional identity, mention 2-3 concrete strengths or domains from the resume, and where it is true include the most impressive measurable result.
${targetRole ? `Target role: ${targetRole}\n` : ''}${jd ? `Align the emphasis to this job description (without adding facts that are not in the resume):\n"""${jd}"""\n` : ''}
RESUME:
${resumeToText(content)}

Return ONLY the summary text.`,
    },
  ], { maxTokens: 1200, temperature: 0.5 });

  res.json({ text: cleanText(out) });
}));

/* ═══════════════════════════════════════════════════════════════════════
   POST /linkedin-summary — LinkedIn "About" section
   body: { resume_id, content? }
   ═══════════════════════════════════════════════════════════════════════ */
router.post('/linkedin-summary', route(async (req, res) => {
  const user = await requireCandidate(req);
  const { resume, content } = await loadResume(user.id, req.body?.resume_id, req.body?.content);
  if (isResumeEmpty(content)) throw new HttpError(400, 'Add some experience, education or skills first.');
  const targetRole = resume.target_role || user.target_role || '';

  const out = await groqChat([
    { role: 'system', content: RULES },
    {
      role: 'user',
      content: `Write a LinkedIn "About" section for this person.
Requirements: first person, warm but professional, 120 to 200 words, 2-3 short paragraphs separated by a blank line, open with a hook about what they do and who they help, weave in key skills naturally, include one specific achievement from the resume if available, and end with a one-line invitation to connect${targetRole ? ` that reflects they are looking for ${targetRole} roles` : ''}. No emojis, no hashtags, no bullet points.

RESUME:
${resumeToText(content)}

Return ONLY the About text.`,
    },
  ], { maxTokens: 1500, temperature: 0.6 });

  res.json({ summary: cleanText(out) });
}));

/* ═══════════════════════════════════════════════════════════════════════
   POST /rewrite — improve a bullet / summary / letter
   body: { text, instruction?, context? }
   ═══════════════════════════════════════════════════════════════════════ */
router.post('/rewrite', route(async (req, res) => {
  await requireCandidate(req);
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 8000) : '';
  if (!text) throw new HttpError(400, 'There is no text to rewrite yet.');
  const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim().slice(0, 400) : '';
  const context = typeof req.body?.context === 'string' ? req.body.context.trim().slice(0, 400) : '';

  const out = await groqChat([
    { role: 'system', content: RULES },
    {
      role: 'user',
      content: `Rewrite the text below to be clearer, stronger and more specific. Keep every fact; do not add new facts or numbers. Keep roughly the same length and format (a single bullet stays a single bullet; paragraphs stay paragraphs). Start bullets with a strong past-tense verb unless the role is current.
${instruction ? `Extra instruction: ${instruction}\n` : ''}${context ? `Context: ${context}\n` : ''}
TEXT:
"""${text}"""

Return ONLY the rewritten text.`,
    },
  ], { maxTokens: 1500, temperature: 0.5 });

  res.json({ text: cleanText(out) });
}));

/* ═══════════════════════════════════════════════════════════════════════
   POST /match — keyword coverage + ATS check vs a job description
   body: { resume_id, content?, job_description }
   ═══════════════════════════════════════════════════════════════════════ */
router.post('/match', route(async (req, res) => {
  const user = await requireCandidate(req);
  const jd = cleanJd(req.body?.job_description);
  if (jd.length < 40) throw new HttpError(400, 'Paste a longer job description (at least a few lines).');
  const { content } = await loadResume(user.id, req.body?.resume_id, req.body?.content);
  if (isResumeEmpty(content)) throw new HttpError(400, 'Your resume is empty. Fill it in first.');

  const raw = await groqChat([
    { role: 'system', content: RULES },
    {
      role: 'user',
      content: `Compare the resume with the job description like an ATS plus a hiring manager.

Step 1: Extract the 12 to 25 most important hard requirements from the job description: skills, tools, technologies, certifications, domain knowledge, seniority/years. Use short terms (1-4 words). Skip generic soft-skill filler.
Step 2: For each term decide if the resume clearly evidences it (explicitly or by an obvious synonym). matched=true only with real evidence.
Step 3: Give 3 to 5 specific, honest tips to improve the match using only what the candidate genuinely has. Add a one-sentence verdict.

Respond with JSON only, exactly this shape:
{"keywords":[{"term":"string","matched":true}],"tips":["string"],"verdict":"string"}

JOB DESCRIPTION:
"""${jd}"""

RESUME:
${resumeToText(content)}`,
    },
  ], { json: true, maxTokens: 3000, temperature: 0.2 });

  const out = parseJson(raw);
  const kws: { term: string; matched: boolean }[] = (Array.isArray(out.keywords) ? out.keywords : [])
    .map((k: any) => ({ term: String(k?.term ?? '').trim(), matched: Boolean(k?.matched) }))
    .filter((k: { term: string }) => k.term)
    .slice(0, 30);

  const matched = kws.filter((k) => k.matched).map((k) => k.term);
  const missing = kws.filter((k) => !k.matched).map((k) => k.term);
  const score = kws.length ? Math.round((matched.length / kws.length) * 100) : 0;
  const tips = (Array.isArray(out.tips) ? out.tips : []).map(String).filter(Boolean).slice(0, 6);
  const verdict = typeof out.verdict === 'string' ? out.verdict.trim() : '';

  res.json({ score, matched, missing, tips, verdict });
}));

/* ═══════════════════════════════════════════════════════════════════════
   POST /tailor — tailor summary, skills order and bullets to a job
   body: { resume_id, content?, job_description }
   returns { suggestions:[{section,label,before,after}], tailored: ResumeContent, gaps: string[] }
   ═══════════════════════════════════════════════════════════════════════ */
router.post('/tailor', route(async (req, res) => {
  const user = await requireCandidate(req);
  const jd = cleanJd(req.body?.job_description);
  if (jd.length < 40) throw new HttpError(400, 'Paste a longer job description (at least a few lines).');
  const { content } = await loadResume(user.id, req.body?.resume_id, req.body?.content);
  if (isResumeEmpty(content)) throw new HttpError(400, 'Your resume is empty. Fill it in first.');

  const expForPrompt = content.experience
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => (e.title || e.company) && e.bullets.some((b) => b.trim()))
    .map(({ e, i }) => `[${i}] ${[e.title, e.company].filter(Boolean).join(' at ')}\n${e.bullets.filter((b) => b.trim()).map((b) => `- ${b.trim()}`).join('\n')}`)
    .join('\n\n');

  const raw = await groqChat([
    { role: 'system', content: RULES },
    {
      role: 'user',
      content: `Tailor this resume to the job description below.

What you may change:
1. "summary": rewrite it (3-4 sentences, max 80 words) so it speaks to this job, using only resume facts.
2. "skills": reorder so the skills most relevant to the job come first. Only use skills that already appear somewhere in the resume. Do not add new ones.
3. "experience": for each role that can be improved, rewrite its bullets to mirror the job's language and priorities. Keep every fact, number and tool exactly as is; you may reorder bullets, tighten wording and use the job's terminology only where it truthfully describes what was done. Refer to roles by the [index] shown.
4. "gaps": list up to 6 important job requirements that the resume does NOT evidence. These are for the candidate to know about; never try to cover them with invented claims.

Respond with JSON only, exactly this shape:
{"summary":"string","skills":["string"],"experience":[{"index":0,"bullets":["string"]}],"gaps":["string"]}

JOB DESCRIPTION:
"""${jd}"""

CURRENT SUMMARY:
${content.summary || '(none)'}

CURRENT SKILLS:
${content.skills.filter(Boolean).join(', ') || '(none)'}

EXPERIENCE (with [index]):
${expForPrompt || '(none)'}

FULL RESUME FOR REFERENCE:
${resumeToText(content)}`,
    },
  ], { json: true, maxTokens: 4000, temperature: 0.3 });

  const out = parseJson(raw);
  const tailored: ResumeContent = structuredClone(content);
  const haystack = resumeToText(content).toLowerCase();

  // Summary
  if (typeof out.summary === 'string' && out.summary.trim()) tailored.summary = cleanText(out.summary);

  // Skills: reorder only; drop anything not already evidenced in the resume; never lose originals
  if (Array.isArray(out.skills)) {
    const original = content.skills.filter((s) => s.trim());
    const seen = new Set<string>();
    const reordered: string[] = [];
    for (const s of out.skills.map((x: unknown) => String(x).trim()).filter(Boolean)) {
      const key = s.toLowerCase();
      if (seen.has(key) || !haystack.includes(key)) continue;
      seen.add(key);
      reordered.push(s);
    }
    for (const s of original) {
      if (!seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase());
        reordered.push(s);
      }
    }
    if (reordered.length) tailored.skills = reordered.slice(0, 40);
  }

  // Experience bullets
  if (Array.isArray(out.experience)) {
    for (const item of out.experience) {
      const i = Number(item?.index);
      if (!Number.isInteger(i) || !tailored.experience[i] || !Array.isArray(item?.bullets)) continue;
      const bullets = item.bullets.map((b: unknown) => String(b).trim()).filter(Boolean).slice(0, 8);
      if (bullets.length) tailored.experience[i].bullets = bullets;
    }
  }

  // Human-readable diff
  const suggestions: { section: string; label: string; before: string; after: string }[] = [];
  if (tailored.summary !== content.summary) {
    suggestions.push({ section: 'summary', label: 'Summary', before: content.summary || '(empty)', after: tailored.summary });
  }
  const beforeSkills = content.skills.filter(Boolean).join(' · ');
  const afterSkills = tailored.skills.filter(Boolean).join(' · ');
  if (beforeSkills !== afterSkills) {
    suggestions.push({ section: 'skills', label: 'Skills (reordered for this job)', before: beforeSkills || '(empty)', after: afterSkills });
  }
  tailored.experience.forEach((e, i) => {
    const before = content.experience[i].bullets.filter(Boolean).map((b) => `• ${b}`).join('\n');
    const after = e.bullets.filter(Boolean).map((b) => `• ${b}`).join('\n');
    if (before !== after) {
      suggestions.push({ section: 'experience', label: `Experience — ${[e.title, e.company].filter(Boolean).join(' at ')}`, before: before || '(empty)', after });
    }
  });

  const gaps = (Array.isArray(out.gaps) ? out.gaps : []).map(String).filter(Boolean).slice(0, 6);
  res.json({ suggestions, tailored, gaps });
}));

/* ═══════════════════════════════════════════════════════════════════════
   POST /cover-letter
   body: { resume_id, content?, job_description?, company?, title? }
   ═══════════════════════════════════════════════════════════════════════ */
router.post('/cover-letter', route(async (req, res) => {
  const user = await requireCandidate(req);
  const jd = cleanJd(req.body?.job_description);
  const company = typeof req.body?.company === 'string' ? req.body.company.trim().slice(0, 120) : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
  if (!jd && !title) throw new HttpError(400, 'Add a job title or paste the job description.');

  const { content } = await loadResume(user.id, req.body?.resume_id, req.body?.content);
  if (isResumeEmpty(content)) throw new HttpError(400, 'Your resume is empty. Fill it in first.');
  const name = content.basics.name || user.full_name || '';

  const out = await groqChat([
    { role: 'system', content: RULES },
    {
      role: 'user',
      content: `Write a cover letter for this candidate.
Requirements:
- 3 short paragraphs plus a closing line, 220 to 320 words total.
- Open with "Dear Hiring Manager," (or the company team if a company is given).
- Paragraph 1: the role${company ? ` at ${company}` : ''} and a specific reason this candidate fits, based on the strongest overlap between resume and job.
- Paragraph 2: two or three concrete achievements or experiences from the resume that match the job's priorities. Use real numbers only if they appear in the resume.
- Paragraph 3: motivation for the role${company ? ' and company' : ''} (do not invent facts about the company beyond what the job description says) and a confident call to action.
- Close with "Sincerely," and the candidate's name${name ? ` (${name})` : ''}.
- Natural human tone. No clichés like "I am writing to apply" or "team player".

${title ? `JOB TITLE: ${title}\n` : ''}${company ? `COMPANY: ${company}\n` : ''}${jd ? `JOB DESCRIPTION:\n"""${jd}"""\n` : ''}
RESUME:
${resumeToText(content)}

Return ONLY the letter text.`,
    },
  ], { maxTokens: 2000, temperature: 0.6 });

  res.json({ body: cleanText(out) });
}));

export default router;
