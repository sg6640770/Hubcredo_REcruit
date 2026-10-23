import { supabase } from '@/lib/supabase';
import type { ResumeContent } from '@/types/db';

/**
 * Client for the JobPilot AI endpoints (server/routes/jobpilotAi.ts).
 * In dev the Vite proxy forwards /api → http://localhost:3000, so the base is empty.
 * For production set VITE_AI_API_URL (e.g. https://api.yourdomain.com) if the API lives elsewhere.
 */
const API_BASE = ((import.meta.env.VITE_AI_API_URL as string | undefined) ?? '').replace(/\/+$/, '');

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

export function aiErrorMessage(e: unknown, fallback = 'AI request failed. Please try again.'): string {
  return e instanceof AiError ? e.message : fallback;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError('Please sign in again.', 401);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/jobpilot/ai/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError('Cannot reach the AI server. Make sure the backend is running.', 0);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const serverDown = !json && res.status >= 500;
    throw new AiError(
      json?.error || (serverDown ? 'The AI server is not responding. Make sure the backend is running.' : `AI request failed (${res.status}).`),
      res.status,
    );
  }
  return json as T;
}

export type MatchResult = { score: number; matched: string[]; missing: string[]; tips: string[]; verdict: string };
export type TailorSuggestion = { section: string; label: string; before: string; after: string };
export type TailorResult = { suggestions: TailorSuggestion[]; tailored: ResumeContent; gaps: string[] };

export const ai = {
  /** Resume summary written from the whole resume (optionally aimed at a job). */
  summary: (resumeId: string, content: ResumeContent, opts: { jobDescription?: string; targetRole?: string } = {}) =>
    call<{ text: string }>('summary', {
      resume_id: resumeId,
      content,
      job_description: opts.jobDescription,
      target_role: opts.targetRole,
    }),

  /** LinkedIn "About" section from the whole resume. */
  linkedinSummary: (resumeId: string, content: ResumeContent) =>
    call<{ summary: string }>('linkedin-summary', { resume_id: resumeId, content }),

  /** Improve one bullet / paragraph / letter without changing facts. */
  rewrite: (text: string, opts: { instruction?: string; context?: string } = {}) =>
    call<{ text: string }>('rewrite', { text, instruction: opts.instruction, context: opts.context }),

  /** Keyword coverage + ATS tips against a job description. */
  match: (resumeId: string, content: ResumeContent, jobDescription: string) =>
    call<MatchResult>('match', { resume_id: resumeId, content, job_description: jobDescription }),

  /** Tailored summary, skills order and bullets for a job (nothing invented). */
  tailor: (resumeId: string, content: ResumeContent, jobDescription: string) =>
    call<TailorResult>('tailor', { resume_id: resumeId, content, job_description: jobDescription }),

  /** Cover letter grounded in the resume stored for resumeId. */
  coverLetter: (resumeId: string, jobDescription: string, company?: string, title?: string) =>
    call<{ body: string }>('cover-letter', { resume_id: resumeId, job_description: jobDescription, company, title }),
};
