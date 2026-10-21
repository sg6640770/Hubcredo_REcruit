/*
# Create JobPilot candidate schema (jp_* tables)

## Purpose
JobPilot is a standalone jobseeker app sharing this Supabase project with
the HubCredo recruiter app. This migration creates the entire candidate-side
data layer as brand-new tables, all prefixed jp_. Nothing existing is altered,
dropped, or re-pointed.

## Isolation
- Every new table is prefixed jp_.
- No existing public.* table is touched.
- Signup trigger on auth.users fires ONLY when signup metadata has app='jobpilot'.
- RLS on every jp_ table requires auth.uid() = user_id AND public.jp_is_candidate().

## New tables
jp_profiles, jp_resumes, jp_cover_letters, jp_campaigns, jp_applications,
jp_contacts, jp_outreach_messages, jp_replies, jp_reminders,
jp_connected_accounts, jp_account_secrets, jp_credit_transactions,
jp_credit_action_costs.

## Views (read-only, security_invoker)
jp_funnel_counts, jp_daily_send_counts, jp_reply_stats.

## Security
- RLS on all new tables with 4 CRUD policies each on owner-scoped tables.
- jp_account_secrets: RLS on, no policies => service-role only.
- jp_credit_transactions / jp_credit_action_costs: SELECT only.
- Storage buckets jp-resumes (private), jp-photos (public read); uploads
  enforced under <user_id>/<filename>.

## Idempotent
Uses IF NOT EXISTS and drop-before-create for policies/triggers. Safe to re-run.
*/

create extension if not exists pgcrypto;

create or replace function public.jp_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.jp_profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  full_name           text,
  phone               text,
  photo_url           text,
  headline            text,
  location            text,
  current_job_title   text,
  target_role         text,
  target_industry     text,
  target_locations    jsonb not null default '[]',
  dealbreakers        jsonb not null default '[]',
  daily_send_cap      integer not null default 15,
  onboarding_step     text not null default 'not_started',
  onboarding_complete boolean not null default false,
  plan_tier           text not null default 'free',
  plan_status         text not null default 'active',
  credit_balance      integer not null default 100,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.jp_profiles enable row level security;
drop policy if exists "jp users read own profile" on public.jp_profiles;
create policy "jp users read own profile" on public.jp_profiles
  for select using (auth.uid() = id);
drop policy if exists "jp users update own profile" on public.jp_profiles;
create policy "jp users update own profile" on public.jp_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop trigger if exists trg_jp_profiles_updated_at on public.jp_profiles;
create trigger trg_jp_profiles_updated_at before update on public.jp_profiles
  for each row execute function public.jp_set_updated_at();

create or replace function public.jp_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'app', '') = 'jobpilot' then
    insert into public.jp_profiles (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data->>'full_name')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_jp_on_auth_user_created on auth.users;
create trigger trg_jp_on_auth_user_created
  after insert on auth.users
  for each row execute function public.jp_handle_new_user();

create or replace function public.jp_is_candidate()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.jp_profiles where id = auth.uid());
$$;

create table if not exists public.jp_resumes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.jp_profiles(id) on delete cascade,
  name              text not null default 'My Resume',
  template          text not null default 'modern',
  is_primary        boolean not null default false,
  target_role       text,
  target_industry   text,
  source            text not null default 'form' check (source in ('form','upload')),
  original_file_url text,
  content           jsonb not null default '{}',
  photo_url         text,
  linkedin_summary  text,
  parse_status      text not null default 'complete'
    check (parse_status in ('pending','parsing','complete','failed')),
  parse_error       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_jp_resumes_user on public.jp_resumes(user_id);

create table if not exists public.jp_cover_letters (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.jp_profiles(id) on delete cascade,
  resume_id       uuid references public.jp_resumes(id) on delete set null,
  application_id  uuid,
  company_name    text,
  job_title       text,
  body            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_jp_cover_letters_user on public.jp_cover_letters(user_id);

create table if not exists public.jp_campaigns (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.jp_profiles(id) on delete cascade,
  resume_id         uuid references public.jp_resumes(id) on delete set null,
  name              text not null,
  current_job_title text not null,
  target_role       text not null,
  industry          text,
  locations         jsonb not null default '[]',
  dealbreakers      jsonb not null default '[]',
  channel_email     boolean not null default true,
  channel_linkedin  boolean not null default false,
  daily_cap         integer not null default 15,
  status            text not null default 'draft'
    check (status in ('draft','discovering','active','paused','completed','stopped','failed')),
  error_message     text,
  n8n_execution_id  text,
  started_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_jp_campaigns_user on public.jp_campaigns(user_id);
create index if not exists idx_jp_campaigns_status on public.jp_campaigns(status);

create table if not exists public.jp_applications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.jp_profiles(id) on delete cascade,
  campaign_id           uuid references public.jp_campaigns(id) on delete set null,
  resume_id             uuid references public.jp_resumes(id) on delete set null,
  company_name          text not null,
  company_domain        text,
  job_title             text not null,
  job_url               text,
  location              text,
  work_model            text,
  salary_min            numeric,
  salary_max            numeric,
  job_description       text,
  source                text,
  match_score           numeric,
  ats_missing_keywords  jsonb not null default '[]',
  stage                 text not null default 'identified'
    check (stage in ('identified','outreach_sent','reply_received','interview','offer','rejected')),
  stage_changed_at      timestamptz not null default now(),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, company_domain, job_title)
);
create index if not exists idx_jp_applications_user on public.jp_applications(user_id);
create index if not exists idx_jp_applications_campaign on public.jp_applications(campaign_id);
create index if not exists idx_jp_applications_stage on public.jp_applications(user_id, stage);

alter table public.jp_cover_letters
  drop constraint if exists jp_cover_letters_application_fk;
alter table public.jp_cover_letters
  add constraint jp_cover_letters_application_fk
  foreign key (application_id) references public.jp_applications(id) on delete set null;

create table if not exists public.jp_contacts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.jp_profiles(id) on delete cascade,
  application_id   uuid not null references public.jp_applications(id) on delete cascade,
  recipient_type   text not null check (recipient_type in ('hiring_manager','department_head','recruiter','other')),
  first_name       text,
  last_name        text,
  job_title        text,
  email            text,
  email_status     text,
  linkedin_url     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (application_id, recipient_type)
);
create index if not exists idx_jp_contacts_user on public.jp_contacts(user_id);
create index if not exists idx_jp_contacts_application on public.jp_contacts(application_id);

create table if not exists public.jp_outreach_messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.jp_profiles(id) on delete cascade,
  campaign_id      uuid references public.jp_campaigns(id) on delete cascade,
  application_id   uuid not null references public.jp_applications(id) on delete cascade,
  contact_id       uuid references public.jp_contacts(id) on delete set null,
  channel          text not null check (channel in ('email','linkedin')),
  recipient_type   text not null check (recipient_type in ('hiring_manager','department_head','recruiter','other')),
  subject          text,
  body             text not null default '',
  edited_by_user   boolean not null default false,
  status           text not null default 'draft'
    check (status in ('draft','queued','sending','sent','failed','cancelled','bounced')),
  scheduled_for    timestamptz,
  sent_at          timestamptz,
  error_message    text,
  thread_id        text,
  opened_count     integer not null default 0,
  replied          boolean not null default false,
  replied_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_jp_msgs_user on public.jp_outreach_messages(user_id);
create index if not exists idx_jp_msgs_campaign on public.jp_outreach_messages(campaign_id);
create index if not exists idx_jp_msgs_application on public.jp_outreach_messages(application_id);
create index if not exists idx_jp_msgs_queue on public.jp_outreach_messages(scheduled_for) where status = 'queued';

create table if not exists public.jp_replies (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.jp_profiles(id) on delete cascade,
  message_id       uuid references public.jp_outreach_messages(id) on delete set null,
  application_id   uuid references public.jp_applications(id) on delete set null,
  channel          text not null check (channel in ('email','linkedin')),
  from_name        text,
  from_address     text,
  subject          text,
  body             text,
  received_at      timestamptz not null default now(),
  is_read          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists idx_jp_replies_user on public.jp_replies(user_id, received_at desc);

create table if not exists public.jp_reminders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.jp_profiles(id) on delete cascade,
  application_id   uuid references public.jp_applications(id) on delete cascade,
  kind             text not null default 'follow_up' check (kind in ('follow_up','deadline','interview','custom')),
  title            text not null,
  due_at           timestamptz not null,
  done             boolean not null default false,
  done_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists idx_jp_reminders_user_due on public.jp_reminders(user_id, due_at) where done = false;

create table if not exists public.jp_connected_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.jp_profiles(id) on delete cascade,
  provider            text not null check (provider in ('gmail','outlook','linkedin')),
  account_email       text,
  display_name        text,
  unipile_account_id  text,
  status              text not null default 'disconnected'
    check (status in ('connected','disconnected','error','paused')),
  daily_limit         integer not null default 15,
  sends_today         integer not null default 0,
  sends_reset_at      date,
  connected_at        timestamptz,
  last_used_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, provider)
);
create index if not exists idx_jp_connected_user on public.jp_connected_accounts(user_id);

create table if not exists public.jp_account_secrets (
  account_id     uuid primary key references public.jp_connected_accounts(id) on delete cascade,
  access_token   text,
  refresh_token  text,
  session_cookie text,
  expires_at     timestamptz,
  updated_at     timestamptz not null default now()
);

create table if not exists public.jp_credit_action_costs (
  action_type   text primary key,
  credits_cost  integer not null,
  description   text
);

insert into public.jp_credit_action_costs (action_type, credits_cost, description) values
  ('resume_parse',          5,  'Parse an uploaded resume into structured fields'),
  ('resume_tailor',         5,  'Tailor a resume to a job description'),
  ('match_score',           1,  'Resume vs job match score + ATS keyword check'),
  ('cover_letter',          5,  'Generate a cover letter'),
  ('job_discovery',         2,  'Discover and match one job'),
  ('contact_find',          10, 'Find a hiring contact email'),
  ('message_generation',    3,  'Generate a personalized outreach message'),
  ('email_sent',            1,  'Outreach email sent'),
  ('followup_draft',        2,  'Generate a follow-up draft')
on conflict (action_type) do nothing;

create table if not exists public.jp_credit_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.jp_profiles(id) on delete cascade,
  type           text not null check (type in ('plan_grant','topup_purchase','action_spend','refund','expiry_deduct')),
  amount         integer not null,
  balance_after  integer not null,
  action_type    text,
  description    text,
  reference_id   text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_jp_credit_tx_user on public.jp_credit_transactions(user_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array[
    'jp_resumes','jp_cover_letters','jp_campaigns','jp_applications',
    'jp_contacts','jp_outreach_messages','jp_connected_accounts'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.jp_set_updated_at()', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'jp_resumes','jp_cover_letters','jp_campaigns','jp_applications',
    'jp_contacts','jp_outreach_messages','jp_replies','jp_reminders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "jp own rows" on public.%I', t);
    execute format(
      'create policy "jp own rows" on public.%I for all
         using (auth.uid() = user_id and public.jp_is_candidate())
         with check (auth.uid() = user_id and public.jp_is_candidate())', t);
  end loop;
end $$;

alter table public.jp_connected_accounts enable row level security;
drop policy if exists "jp own accounts read" on public.jp_connected_accounts;
create policy "jp own accounts read" on public.jp_connected_accounts
  for select using (auth.uid() = user_id and public.jp_is_candidate());
drop policy if exists "jp own accounts update" on public.jp_connected_accounts;
create policy "jp own accounts update" on public.jp_connected_accounts
  for update using (auth.uid() = user_id and public.jp_is_candidate())
  with check (auth.uid() = user_id and public.jp_is_candidate());

alter table public.jp_account_secrets enable row level security;

alter table public.jp_credit_transactions enable row level security;
drop policy if exists "jp own credit tx read" on public.jp_credit_transactions;
create policy "jp own credit tx read" on public.jp_credit_transactions
  for select using (auth.uid() = user_id and public.jp_is_candidate());

alter table public.jp_credit_action_costs enable row level security;
drop policy if exists "jp read action costs" on public.jp_credit_action_costs;
create policy "jp read action costs" on public.jp_credit_action_costs
  for select using (auth.role() = 'authenticated');

create or replace view public.jp_funnel_counts
with (security_invoker = true) as
select user_id, campaign_id, stage, count(*)::int as total
from public.jp_applications
group by user_id, campaign_id, stage;

create or replace view public.jp_daily_send_counts
with (security_invoker = true) as
select user_id, (sent_at at time zone 'utc')::date as day, count(*)::int as sent
from public.jp_outreach_messages
where status = 'sent' and sent_at is not null
group by user_id, (sent_at at time zone 'utc')::date;

create or replace view public.jp_reply_stats
with (security_invoker = true) as
select user_id, channel, recipient_type,
       count(*) filter (where status = 'sent')::int as sent,
       count(*) filter (where replied)::int as replied
from public.jp_outreach_messages
group by user_id, channel, recipient_type;

insert into storage.buckets (id, name, public)
values ('jp-resumes', 'jp-resumes', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('jp-photos', 'jp-photos', true)
on conflict (id) do nothing;

drop policy if exists "jp resumes own files" on storage.objects;
create policy "jp resumes own files" on storage.objects
  for all to authenticated
  using (bucket_id = 'jp-resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'jp-resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "jp photos own write" on storage.objects;
create policy "jp photos own write" on storage.objects
  for all to authenticated
  using (bucket_id = 'jp-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'jp-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "jp photos public read" on storage.objects;
create policy "jp photos public read" on storage.objects
  for select using (bucket_id = 'jp-photos');
