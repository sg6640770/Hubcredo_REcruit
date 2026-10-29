// lib/n8nTrigger.ts
//
// Fires n8n workflows for (1) job-signal scraping and (2) candidate sourcing.
//
// IMPORTANT: "webhook-test" URLs only respond while the workflow is open in
// the n8n editor with "Execute workflow" (listening) turned on. Swap both
// URLs below to their Production URL (or activate the workflows) before
// relying on this outside manual testing.
//
// IMPORTANT #2: these calls have a 15s timeout, but n8n workflows that
// scrape + score + store can easily run longer than that (especially
// "Full + email search" mode). Set the Webhook node's "Respond" option to
// "Immediately" (or add a Respond to Webhook node right after validation)
// so n8n acks the request fast and keeps processing in the background —
// otherwise every trigger call here will time out even when the workflow
// eventually succeeds.

// ── Work mode ───────────────────────────────────────────────────────────────

export type WorkMode = "remote" | "hybrid" | "onsite";

const VALID_WORK_MODES: readonly WorkMode[] = ["remote", "hybrid", "onsite"];

// LinkedIn "f_WT" work-type filter codes: 1 = On-site, 2 = Remote, 3 = Hybrid
const LINKEDIN_WORK_TYPE_CODE: Record<WorkMode, string> = {
  onsite: "1",
  remote: "2",
  hybrid: "3",
};

/**
 * Cleans whatever the frontend sent into a de-duplicated list of valid modes.
 * Accepts an array (["remote","hybrid"]) or a comma-separated string ("remote,hybrid").
 * Anything unknown is dropped; an empty result means "any work mode".
 */
export function normalizeWorkModes(input: unknown): WorkMode[] {
  const raw: unknown[] = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];

  const cleaned = raw
    .map((v) => String(v).trim().toLowerCase().replace(/[\s_-]/g, ""))
    .map((v) => (v === "on-site" || v === "onsite" ? "onsite" : v))
    .filter((v): v is WorkMode => (VALID_WORK_MODES as readonly string[]).includes(v));

  return Array.from(new Set(cleaned));
}

// ── Types ───────────────────────────────────────────────────────────────────

interface TriggerScrapeParams {
  runId: string;
  userId: string;
  source: "linkedin" | "indeed" | "both";
  keyword: string;
  location?: string;
  experience?: string;
  industry?: string;
  country?: string;
  maxJobs?: number;
  workMode?: WorkMode[]; // empty / undefined = any work mode
}

interface TriggerCandidateSearchParams {
  userId: string;
  role: string;
  location?: string;
  experience?: string;
  maxItems?: number;
}

const JOB_SIGNAL_WEBHOOKS: Partial<Record<"linkedin" | "indeed", string>> = {
  linkedin: process.env.N8N_LINKEDIN_WEBHOOK_URL
    ?? "https://shreyahubcredo.app.n8n.cloud/webhook/fetch-job-post",
  indeed: process.env.N8N_INDEED_WEBHOOK_URL, // TODO: set once the Indeed workflow exists
};

const CANDIDATE_SOURCING_WEBHOOK =
  process.env.N8N_CANDIDATE_WEBHOOK_URL
  ?? "https://shreyahubcredo.app.n8n.cloud/webhook/candidate";

async function postJson(url: string, body: unknown, timeoutMs = 15_000): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(`n8n webhook unreachable (${url}): ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    throw new Error(`n8n webhook returned ${res.status} (${url}): ${responseBody.slice(0, 300)}`);
  }
}

// ── Job signals (LinkedIn / Indeed job postings) ────────────────────────────

async function callJobSignalWebhook(
  source: "linkedin" | "indeed",
  payload: Omit<TriggerScrapeParams, "source">
): Promise<void> {
  const url = JOB_SIGNAL_WEBHOOKS[source];
  if (!url) {
    throw new Error(`No n8n webhook configured for source "${source}"`);
  }

  const workModes = normalizeWorkModes(payload.workMode);

  await postJson(url, {
    run_id: payload.runId,
    source,
    user_id: payload.userId,
    keyword: payload.keyword,
    location: payload.location ?? null,
    experience: payload.experience ?? null,
    industry: payload.industry ?? null,
    country: payload.country ?? "IN",
    max_jobs: payload.maxJobs ?? 100,

    // Work mode — three shapes so n8n can use whichever is easiest:
    //   work_mode       → ["remote","hybrid"]  ([] = any)
    //   work_mode_text  → "remote,hybrid"      ("" = any)
    //   work_type_codes → "2,3"                (LinkedIn f_WT filter, "" = any)
    work_mode: workModes,
    work_mode_text: workModes.join(","),
    work_type_codes: workModes.map((m) => LINKEDIN_WORK_TYPE_CODE[m]).join(","),
  });
}

export async function triggerScrape(params: TriggerScrapeParams): Promise<void> {
  const { source, ...rest } = params;

  if (source === "both") {
    await Promise.all([
      callJobSignalWebhook("linkedin", rest),
      callJobSignalWebhook("indeed", rest),
    ]);
    return;
  }

  await callJobSignalWebhook(source, rest);
}

// ── Candidate sourcing (LinkedIn profile search) ────────────────────────────

export async function triggerCandidateSearch(params: TriggerCandidateSearchParams): Promise<void> {
  if (!params.role?.trim()) {
    throw new Error("role is required to trigger candidate search");
  }
  await postJson(CANDIDATE_SOURCING_WEBHOOK, {
    user_id: params.userId,
    role: params.role,
    location: params.location ?? "India",
    experience: params.experience ?? null,
    max_items: params.maxItems ?? 10,
  });
}
