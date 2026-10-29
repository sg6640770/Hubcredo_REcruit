import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

/**
 * recent_jobs.posted_age is free text ("today", "1 day ago", "6 days ago", "2 weeks ago").
 * Turns it into a number of days so we can filter / sort on it.
 * Returns null when the text can't be understood.
 */
function parsePostedDays(text?: string | null): number | null {
  const t = (text ?? "").toLowerCase().trim();
  if (!t) return null;
  if (/today|just now|moment|second|minute|hour/.test(t)) return 0;
  if (/yesterday/.test(t)) return 1;

  const m = t.match(/(\d+)\s*\+?\s*(day|week|month|year)/);
  if (!m) return null;

  const n = Number(m[1]);
  const unit = m[2];
  if (unit === "day") return n;
  if (unit === "week") return n * 7;
  if (unit === "month") return n * 30;
  return n * 365;
}

// GET /api/live-jobs?days=7
// Returns jobs from recent_jobs that were posted within the last N days (default 7, max 30).
router.get("/live-jobs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const requested = Number(req.query.days);
  const days = Number.isFinite(requested) && requested >= 1 ? Math.min(Math.floor(requested), 30) : 7;

  const { data, error } = await supabase
    .from("recent_jobs")
    .select("id, job_title, company, location, employment_type, category, remote, salary, posted_age, application_url, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    req.log.error({ error }, "Failed to load live jobs");
    res.status(500).json({ error: "Failed to load live jobs" });
    return;
  }

  const rows = data ?? [];

  const jobs = rows
    .map((row) => ({ ...row, posted_days: parsePostedDays(row.posted_age) }))
    .filter((row) => row.posted_days !== null && row.posted_days <= days)
    // freshest first, then newest insert
    .sort((a, b) => (a.posted_days! - b.posted_days!) || (b.id - a.id));

  const lastUpdated = rows.reduce<string | null>(
    (latest, row) => (!latest || row.created_at > latest ? row.created_at : latest),
    null
  );

  res.json({ jobs, total: jobs.length, days, last_updated: lastUpdated });
});

export default router;
