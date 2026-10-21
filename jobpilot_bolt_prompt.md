# Bolt Build Prompt — JobPilot (standalone jobseeker app)

Paste the prompt below into a **brand-new Bolt project** (do NOT add this to the existing HubCredo recruiter project). The database schema is already applied to the shared Supabase project (all tables prefixed `jp_`, RLS-protected, storage buckets `jp-resumes` and `jp-photos` created). Do not run any SQL migration — just build the frontend against the existing schema.

---

## Paste into Bolt:

Build JobPilot, a standalone web app for individual jobseekers that automates job discovery and personalized outreach. It is a brand-new, self-contained project. It shares exactly two things with an existing product (HubCredo recruiter app at hr.hubcredo.com): the Supabase project (same URL + anon key) and the root domain. Do NOT create, modify, or reference any HubCredo files, components, routes, or tables.

### 0. HARD RULES

- New project from scratch. No code from, or edits to, the existing HubCredo app.
- Only read/write tables whose names start with `jp_`, plus the storage buckets `jp-resumes` and `jp-photos`. Never query `profiles`, `leads`, `lead_lists`, `email_campaigns`, `credit_*`, `roles`, `applications`, `resumes`, or any other non-`jp_` table. Never create or alter tables — the schema already exists (see section 3).
- Stack: React 18 + TypeScript + Vite + Tailwind CSS + React Router + `@supabase/supabase-js`. Also: `lucide-react`, `@dnd-kit/core` (Kanban), `react-hook-form` + `zod`, `html2pdf.js` or print-to-PDF for PDF export, `docx` for DOCX export, `recharts` for charts, `@tanstack/react-query` for data fetching/caching, `dompurify` for sanitizing reply HTML.
- Env vars (use `.env`, never hardcode):
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same values as the existing app)
  - `VITE_RECRUITER_APP_URL` = `https://hr.hubcredo.com`
  - `VITE_API_BASE_URL` = base URL for backend/Edge Functions (see section 8)
  - `VITE_USE_MOCKS` = `true` (frontend calls return mock data until the backend exists)
  - `VITE_BASE_PATH` = `/` (default; used as the Vite `base` so the app can be deployed under a path rewrite)
- Routes are mounted at the app root (`/`). The app will be deployed on its own address (e.g. `jobpilot.hubcredo.com`) or behind a path rewrite. Make the Vite base configurable via `VITE_BASE_PATH` (default `/`).
- Never put secrets in the frontend. Email/LinkedIn tokens are never read by the browser.
- Never expose the Supabase service-role key. Use only the anon key; rely on RLS.

### 1. ENTRY PAGE — "Are you a recruiter or a candidate?"

Route `/` (public). A centered, clean page with the JobPilot logo and the question:

**Are you a recruiter or a candidate?**

Two large selectable cards:

- **I'm a Recruiter** — "Manage clients, candidates and campaigns" → clicking redirects (full page navigation, `window.location.href`) to `${VITE_RECRUITER_APP_URL}/login`. Secondary link: "New recruiter? Create account" → `${VITE_RECRUITER_APP_URL}/signup`.
- **I'm a Candidate** — "Build your resume and land interviews on autopilot" → goes to `/login` (with a toggle link to `/signup`).

Remember the choice in `localStorage` (`jp_role_choice`) only to pre-select the card on return visits. Authenticated candidates visiting `/` go straight to `/dashboard`.

### 2. AUTH (candidates only)

Use Supabase Auth (email + password, plus "Continue with Google" button). Pages: `/login`, `/signup`, `/forgot-password`, `/reset-password`. Each auth page shows a small "Not a candidate? I'm a recruiter" link back to the entry page.

Signup call — must be exactly this shape so the DB trigger creates the candidate profile:

```ts
await supabase.auth.signUp({
  email, password,
  options: {
    data: { app: 'jobpilot', full_name },
    emailRedirectTo: `${window.location.origin}/onboarding`
  }
});
```

For Google OAuth pass `queryParams`/redirect to `/onboarding` and, after the first session, if no `jp_profiles` row exists yet, call `supabase.auth.updateUser({ data: { app: 'jobpilot' } })` and re-check (show a friendly error if still missing).

**Candidate guard (critical):** build a `CandidateRoute` wrapper. After login, load `select * from jp_profiles where id = auth.uid()`.

- Row exists → allow in.
- No row (this is a recruiter account) → call `supabase.auth.signOut()` and show a full-page notice: "This account is a HubCredo recruiter account. Please sign in to the recruiter app." with a button to `${VITE_RECRUITER_APP_URL}/login`.
- Not logged in → redirect to `/login`.

After login: if `onboarding_complete = false` → `/onboarding`, else `/dashboard`.

### 3. DATABASE (already created — do not create tables)

Use these tables exactly as named (all RLS-protected to `user_id = auth.uid()`):

- `jp_profiles` (id = auth user id, email, full_name, phone, photo_url, headline, location, current_job_title, target_role, target_industry, target_locations jsonb, dealbreakers jsonb, daily_send_cap int default 15, onboarding_step, onboarding_complete, plan_tier, plan_status, credit_balance)
- `jp_resumes` (id, user_id, name, template, is_primary, target_role, target_industry, source 'form'|'upload', original_file_url, content jsonb, photo_url, linkedin_summary, parse_status, parse_error)
- `jp_cover_letters` (id, user_id, resume_id, application_id, company_name, job_title, body)
- `jp_campaigns` (id, user_id, resume_id, name, current_job_title, target_role, industry, locations jsonb, dealbreakers jsonb, channel_email, channel_linkedin, daily_cap, status 'draft'|'discovering'|'active'|'paused'|'completed'|'stopped'|'failed', error_message, started_at)
- `jp_applications` (id, user_id, campaign_id, resume_id, company_name, company_domain, job_title, job_url, location, work_model, salary_min, salary_max, job_description, source, match_score, ats_missing_keywords jsonb, stage 'identified'|'outreach_sent'|'reply_received'|'interview'|'offer'|'rejected', stage_changed_at, notes)
- `jp_contacts` (id, user_id, application_id, recipient_type 'hiring_manager'|'department_head'|'recruiter'|'other', first_name, last_name, job_title, email, email_status, linkedin_url)
- `jp_outreach_messages` (id, user_id, campaign_id, application_id, contact_id, channel 'email'|'linkedin', recipient_type, subject, body, edited_by_user, status 'draft'|'queued'|'sending'|'sent'|'failed'|'cancelled'|'bounced', scheduled_for, sent_at, replied, replied_at, error_message)
- `jp_replies` (id, user_id, message_id, application_id, channel, from_name, from_address, subject, body, received_at, is_read)
- `jp_reminders` (id, user_id, application_id, kind 'follow_up'|'deadline'|'interview'|'custom', title, due_at, done, done_at)
- `jp_connected_accounts` (id, user_id, provider 'gmail'|'outlook'|'linkedin', account_email, display_name, status 'connected'|'disconnected'|'error'|'paused', daily_limit, sends_today, connected_at) — read + update only from the browser; connecting is done by the backend.
- `jp_credit_transactions` (read-only), `jp_credit_action_costs` (read-only)

Views (read-only): `jp_funnel_counts` (user_id, campaign_id, stage, total), `jp_daily_send_counts` (user_id, day, sent), `jp_reply_stats` (user_id, channel, recipient_type, sent, replied)

Storage: bucket `jp-resumes` (private) and `jp-photos` (public read). Upload paths MUST be `<user_id>/<filename>`.

`jp_resumes.content` JSON shape:

```json
{
  "basics": {"name":"","email":"","phone":"","location":"","headline":"","links":[{"label":"LinkedIn","url":""}]},
  "summary": "",
  "experience": [{"company":"","title":"","location":"","start":"","end":"","current":false,"bullets":[""]}],
  "education": [{"school":"","degree":"","field":"","start":"","end":""}],
  "skills": [""],
  "projects": [{"name":"","description":"","url":""}],
  "certifications": [""]
}
```

### 4. LAYOUT & BRANDING

Authenticated shell: left sidebar + top bar. Sidebar items: Dashboard, Campaigns, Applications, Inbox, Resume Builder, Cover Letters, Connected Accounts, Settings & Billing. Top bar: credit balance chip, user avatar menu (profile, sign out). Branding (distinct from the recruiter app): primary purple `#5B4FE8`, navy `#1a1a2e`, gray `#6B7280`, light backgrounds, rounded-xl cards, subtle shadows. Logo text "JobPilot". Fully responsive (mobile sidebar becomes a drawer). Friendly jobseeker wording throughout.

### 5. PAGES (MVP)

#### 5.1 `/onboarding` (4-step wizard; save progress to `jp_profiles.onboarding_step`)
1. **Resume:** choose "Upload my resume" (PDF/DOCX → upload to `jp-resumes`, create `jp_resumes` row with `source='upload'`, `parse_status='pending'`, call parse API, poll until complete, then open the editor prefilled) or "Build with guided form" (goes to the Resume Builder form).
2. **Photo:** upload a profile photo to `jp-photos` (with crop/preview), save to `jp_profiles.photo_url` and the resume.
3. **Target:** current role, target role, optional industry, preferred locations, dealbreakers (tag input, e.g. "no agencies", "no relocation").
4. **Done:** set `onboarding_complete = true` → `/dashboard`.

#### 5.2 `/dashboard`
- KPI cards: Jobs identified, Outreach sent, Replies, Interviews, Offers (from `jp_funnel_counts` + `jp_reply_stats`).
- Funnel chart: Identified → Outreach Sent → Reply Received → Interview → Offer/Rejected.
- "Today's sending": sent today (from `jp_daily_send_counts`) vs daily cap with a progress bar and remaining headroom.
- Reply rate by channel and by recipient type (bar chart).
- Upcoming reminders list (next 7 days) with a checkbox to mark done.
- Empty state with a clear "Create your first campaign" CTA.

#### 5.3 `/campaigns`
- List with status badges, sent/reply counts, and actions: Pause / Resume / Stop (updates status).
- New campaign modal/wizard: name, current role (prefilled), target role, optional industry, locations, dealbreakers, resume to use (dropdown of `jp_resumes`), channels (email on; LinkedIn shown but disabled with "Coming soon"), daily cap (slider, recommended 15, max 30, with a safe-sending explanation).
- Launch button: inserts a `jp_campaigns` row (`status='discovering'`) then calls `POST ${VITE_API_BASE_URL}/jobpilot/campaigns/:id/launch`.
- Campaign detail `/campaigns/:id`: tabs — Jobs found, Messages (review/edit queue), Activity. In Messages, show the two generated messages per company (hiring manager + department head) side by side; allow editing subject/body (set `edited_by_user=true`), approve, or cancel before sending; status chips for queued/sent/failed/replied.

#### 5.4 `/applications` (tracker that works like a CRM)
- Kanban view with columns = the six stage values; drag a card to change stage (also set `stage_changed_at = now()`). Table view toggle with search, filter by campaign/stage, sort by match score or date.
- Card: company, job title, match score badge, stage, next reminder.
- Detail drawer: job description, match score + missing ATS keywords, contacts (hiring manager / department head with email status), the messages sent, which resume version was used, free-text notes, reminders (add follow-up/deadline), a "Generate cover letter" button, and an "Add job manually" form (creates a `jp_applications` row, `source='manual'`).

#### 5.5 `/inbox`
- Unified list of `jp_replies` (email now, LinkedIn later), unread indicator, filter by channel/company, thread view showing the original sent message above the reply, "Mark read", and "Move application to Interview / Rejected" quick actions. Subscribe with Supabase Realtime on `jp_replies` for the current user.

#### 5.6 `/resume-builder` (works fully on its own)
- List of the user's resumes (name, target role, primary badge, last edited) with Duplicate, Set primary, Delete, Export.
- Editor: left = guided form sections (Basics, Summary, Experience, Education, Skills, Projects, Certifications) with add/remove/reorder; right = live preview. Autosave (debounced) to `jp_resumes.content`.
- Photo toggle and upload, 3 modern templates (Modern, Classic, Minimal) switchable instantly, accent color picker.
- Tailor to job: paste a job description → call `POST /jobpilot/resume/tailor` → returns suggested rewrites per section shown as accept/reject diffs → "Save as new version".
- Match score + ATS check: paste a job description → `POST /jobpilot/resume/match` → show score ring, matched keywords, missing keywords.
- AI rewrite button on any bullet/summary (`POST /jobpilot/resume/rewrite`).
- LinkedIn summary generator button (`POST /jobpilot/resume/linkedin-summary`) saved to `linkedin_summary`.
- Export: PDF and DOCX buttons (client-side generation from the chosen template).

#### 5.7 `/cover-letters`
- List + editor. "Generate" form: pick resume + paste job description (or choose an application) → `POST /jobpilot/cover-letter/generate` → editable text → save to `jp_cover_letters`; copy and download as DOCX/PDF.

#### 5.8 `/connected-accounts`
- Cards for Gmail, Outlook, LinkedIn (LinkedIn marked "Coming soon", button disabled). Gmail/Outlook "Connect" calls `POST /jobpilot/accounts/connect` with `{provider}` and redirects to the returned `auth_url` (OAuth handled by the backend). Show status, connected email, sends today / daily limit, and a Disconnect button (sets `status='disconnected'`). A safe-sending tips box below.

#### 5.9 `/settings`
- Tabs: Profile (name, phone, photo, headline, location, current/target role, industry), Preferences (daily send cap, dealbreakers, target locations), Billing & Credits (balance, plan tier, `jp_credit_transactions` table, cost table from `jp_credit_action_costs`, "Top up" button that calls `POST /jobpilot/billing/checkout` and redirects to the returned URL), Account (change password, sign out, delete account request).

### 6. DATA-LAYER RULES

- Create a typed Supabase client in `src/lib/supabase.ts` and typed helpers per table in `src/lib/db/*.ts`. Every query filters by `user_id` explicitly even though RLS enforces it.
- React Query (`@tanstack/react-query`) for fetching/caching; optimistic updates for Kanban moves.
- All write payloads validated with `zod`.
- Global error boundary + toast notifications. Loading skeletons on every list. Friendly empty states.
- Insufficient credits: when an API returns HTTP 402, show an "Out of credits" modal linking to Billing.

### 7. SECURITY CHECKLIST (implement, don't just mention)

- `CandidateRoute` guard on every authenticated route (section 2).
- Never trust localStorage role choice for access control.
- Sanitize any rendered HTML from replies (use `dompurify`).
- Resume/file uploads: allow only PDF/DOCX ≤ 5 MB, photos PNG/JPG/WebP ≤ 3 MB; upload under `<user_id>/`.
- No tokens, cookies, or API keys in browser storage or code.

### 8. BACKEND CONTRACT (build the frontend against these; implement as Supabase Edge Functions or a small Express/TypeScript service — NOT inside any existing HubCredo codebase)

All endpoints require `Authorization: Bearer <supabase access token>`; the backend verifies it, and uses the service-role key server-side only.

| Method + path | Body | Returns |
| --- | --- | --- |
| `POST /jobpilot/resume/parse` | `{resume_id}` | `{ok}` (fills content, sets parse_status) |
| `POST /jobpilot/resume/tailor` | `{resume_id, job_description}` | `{suggestions:[{section, before, after}]}` |
| `POST /jobpilot/resume/match` | `{resume_id, job_description}` | `{score, matched:[], missing:[]}` |
| `POST /jobpilot/resume/rewrite` | `{text, instruction?}` | `{text}` |
| `POST /jobpilot/resume/linkedin-summary` | `{resume_id}` | `{summary}` |
| `POST /jobpilot/cover-letter/generate` | `{resume_id, job_description, company?, title?}` | `{body}` |
| `POST /jobpilot/campaigns/:id/launch` | — | `{ok}` (kicks off discovery → contact finding → message generation → queueing, respecting daily cap) |
| `POST /jobpilot/accounts/connect` | `{provider}` | `{auth_url}` |
| `POST /jobpilot/billing/checkout` | `{pack_id}` | `{url}` |

Until the backend exists, put these calls behind a single `src/lib/api.ts` with a `VITE_USE_MOCKS=true` mode returning realistic mock data, so every screen is fully demo-able now and switches to the real API by flipping the env var.

### 9. DELIVERABLES

- Complete, runnable Vite + React + TypeScript project with all routes above, the entry page, candidate-only auth, and mock mode.
- `.env.example` with all env vars.
- `README.md` explaining: env setup, that the DB schema is already applied to the shared Supabase project (all `jp_*` tables, views, RLS policies, and storage buckets), how to deploy on `jobpilot.hubcredo.com`, and the backend contract in section 8.
- Clean folder structure: `src/pages`, `src/components`, `src/lib`, `src/hooks`, `src/types`.
