import { Router, Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router = Router();
const REPLY_BASE = "https://api.reply.io/v3";

async function getUserReplyApiKey(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_integrations")
    .select("api_key, is_connected")
    .eq("user_id", userId)
    .eq("service", "replyio")
    .maybeSingle();

  if (error) {
    logger.warn(`[replyio] lookup error for user ${userId}: ${error.message}`);
    return null;
  }
  if (!data?.api_key || data.is_connected === false) return null;
  return data.api_key;
}

async function replyFetch<T>(method: string, path: string, apiKey: string, body?: unknown): Promise<T> {
  const res = await fetch(`${REPLY_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reply.io ${res.status}: ${text}`);
  }
  if (res.status === 204) return {} as T;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return {} as T;
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────
//  GET /api/replyio/validate
//  Confirms the stored key actually works against Reply.io, not
//  just that a row exists — a stale/revoked key should show as
//  disconnected in the UI, not falsely "connected".
//
//  FIX: now returns `reason` on failure so the frontend (and you,
//  while debugging) can see WHY it failed instead of a bare false.
// ─────────────────────────────────────────────────────────────
router.get("/replyio/validate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const apiKey = await getUserReplyApiKey(req.userId!);
    if (!apiKey) {
      res.json({ valid: false, reason: "no_key_configured" });
      return;
    }
    // Cheapest possible authenticated call to confirm the key works
    await replyFetch("GET", "/sequences?top=1", apiKey);
    res.json({ valid: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[replyio] validate failed for user ${req.userId}: ${msg}`);
    res.json({ valid: false, reason: msg });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/replyio/save
//  Saves/updates the Reply.io API key for this user.
//
//  FIX: uses upsert on (user_id, service) so reconnecting never
//  creates a second row for the same user — this is almost
//  certainly why you have two `replyio` rows with different
//  user_ids in the screenshot. Also re-validates the key against
//  Reply.io BEFORE writing is_connected=true, so a bad key never
//  gets stored as "connected".
// ─────────────────────────────────────────────────────────────
router.post("/replyio/save", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { apiKey, accountLabel } = req.body as { apiKey?: string; accountLabel?: string };

  if (!apiKey?.trim()) {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  const trimmedKey = apiKey.trim();

  // Verify the key works BEFORE persisting it as connected
  try {
    await replyFetch("GET", "/sequences?top=1", trimmedKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[replyio] save: key validation failed for user ${req.userId}: ${msg}`);
    res.status(400).json({ error: "This API key was rejected by Reply.io. Double check it and try again.", reason: msg });
    return;
  }

  try {
    const { error } = await supabase
      .from("user_integrations")
      .upsert(
        {
          user_id: req.userId!,
          service: "replyio",
          api_key: trimmedKey,
          is_connected: true,
          ...(accountLabel ? { account_label: accountLabel } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,service" } // requires a unique constraint on (user_id, service) — see note below
      );

    if (error) {
      logger.error(`[replyio] save upsert error for user ${req.userId}: ${error.message}`);
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ success: true, connected: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[replyio] save error for user ${req.userId}: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/replyio/disconnect
// ─────────────────────────────────────────────────────────────
router.post("/replyio/disconnect", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { error } = await supabase
      .from("user_integrations")
      .update({ is_connected: false, updated_at: new Date().toISOString() })
      .eq("user_id", req.userId!)
      .eq("service", "replyio");

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[replyio] disconnect error for user ${req.userId}: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/replyio/linkedin-account
// ─────────────────────────────────────────────────────────────
router.get("/replyio/linkedin-account", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.json({ connected: false, reason: "No Reply.io API key configured" }); return; }

  try {
    const accounts = await replyFetch<Array<{
      id: number; name: string; status: string; profileUrl: string | null; photoUrl: string | null;
      accountType?: string | null;
    }>>("GET", "/linkedin-accounts", apiKey);

    if (!Array.isArray(accounts) || accounts.length === 0) {
      res.json({ connected: false });
      return;
    }
    const healthy = accounts.find((a) => a.status === "enabled") ?? accounts[0];
    res.json({
      connected: true,
      profile_name: healthy.name,
      profile_url: healthy.profileUrl,
      photo_url: healthy.photoUrl,
      status: healthy.status,
      subscription: healthy.accountType ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[replyio] linkedin-account error for user ${req.userId}: ${msg}`);
    res.json({ connected: false, reason: msg });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/replyio/sequences
// ─────────────────────────────────────────────────────────────
router.get("/replyio/sequences", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

  try {
    const data = await replyFetch<{ items: Array<{ id: number; name: string; status: string; isArchived: boolean }>; hasMore: boolean }>(
      "GET", "/sequences?top=1000", apiKey
    );
    res.json({ sequences: data.items ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[replyio] sequences error for user ${req.userId}: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/replyio/sequences/:id/contacts
// ─────────────────────────────────────────────────────────────
router.get("/replyio/sequences/:id/contacts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

  const seqId = req.params.id;
  try {
    const data = await replyFetch<{
      items: Array<{
        email: string; firstName: string; lastName: string;
        status: { status: string; replied: boolean; delivered: boolean; opened: boolean; clicked: boolean; bounced: boolean };
      }>;
      hasMore: boolean;
    }>("GET", `/sequences/${seqId}/contacts?top=500`, apiKey);
    res.json({ contacts: data.items ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[replyio] contacts error for seq ${seqId}: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/replyio/enroll
// ─────────────────────────────────────────────────────────────
router.post("/replyio/enroll", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }

  const { contact, sequenceId } = req.body as {
    contact: { email: string; firstName?: string; lastName?: string };
    sequenceId: number;
  };

  if (!contact?.email || !sequenceId) {
    res.status(400).json({ error: "contact.email and sequenceId are required" });
    return;
  }

  try {
    const importResult = await replyFetch<{
      items: Array<{ id: number | null; status: string; error: string | null }>;
      added: number; updated: number; skipped: number; failed: number;
    }>("POST", "/contacts/import", apiKey, {
      items: [{
        email: contact.email,
        ...(contact.firstName ? { firstName: contact.firstName } : {}),
        ...(contact.lastName ? { lastName: contact.lastName } : {}),
      }],
      options: { overwriteExisting: true, skipExisting: false, skipWithoutEmails: true },
    });

    const contactId = importResult.items.find((i) => i.id != null)?.id;
    if (!contactId) {
      res.status(400).json({ error: "Reply.io could not import this contact (invalid email or account issue)." });
      return;
    }

    const bulkResult = await replyFetch<{ added: number[]; notProcessed: Record<string, { error: number; errorDetails: string | null }> }>(
      "POST", `/sequences/${sequenceId}/contact-links/bulk`, apiKey, { contactIds: [contactId] }
    );

    if (!bulkResult.added || bulkResult.added.length === 0) {
      const detail = Object.values(bulkResult.notProcessed ?? {})[0]?.errorDetails;
      res.status(400).json({ error: detail ?? "Contact could not be enrolled — they may already be in this sequence." });
      return;
    }

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[replyio] enroll error for user ${req.userId}: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/replyio/sequences/:id/pause-seq
//  DELETE /api/replyio/sequences/:id
// ─────────────────────────────────────────────────────────────
router.post("/replyio/sequences/:id/pause-seq", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  const seqId = req.params.id;
  try {
    await replyFetch("POST", `/sequences/${seqId}/pause`, apiKey);
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[replyio] pause error for seq ${seqId}: ${msg}`);
    res.status(400).json({ error: msg });
  }
});

router.delete("/replyio/sequences/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = await getUserReplyApiKey(req.userId!);
  if (!apiKey) { res.status(401).json({ error: "No Reply.io API key configured" }); return; }
  const seqId = req.params.id;
  try {
    await replyFetch("DELETE", `/sequences/${seqId}`, apiKey);
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[replyio] delete error for seq ${seqId}: ${msg}`);
    res.status(400).json({ error: msg });
  }
});

export default router;