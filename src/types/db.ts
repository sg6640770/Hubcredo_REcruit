export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type JpProfile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  photo_url: string | null;
  headline: string | null;
  location: string | null;
  current_job_title: string | null;
  target_role: string | null;
  target_industry: string | null;
  target_locations: string[];
  dealbreakers: string[];
  daily_send_cap: number;
  onboarding_step: string;
  onboarding_complete: boolean;
  plan_tier: string;
  plan_status: string;
  credit_balance: number;
  created_at: string;
  updated_at: string;
};

export type ResumeBasics = {
  name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  links: { label: string; url: string }[];
};

export type ResumeExperience = {
  company: string;
  title: string;
  location: string;
  start: string;
  end: string;
  current: boolean;
  bullets: string[];
};

export type ResumeEducation = {
  school: string;
  degree: string;
  field: string;
  start: string;
  end: string;
};

export type ResumeProject = {
  name: string;
  description: string;
  url: string;
};

export type ResumeContent = {
  basics: ResumeBasics;
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  projects: ResumeProject[];
  certifications: string[];
};

export type JpResume = {
  id: string;
  user_id: string;
  name: string;
  template: string;
  is_primary: boolean;
  target_role: string | null;
  target_industry: string | null;
  source: 'form' | 'upload';
  original_file_url: string | null;
  content: ResumeContent;
  photo_url: string | null;
  linkedin_summary: string | null;
  parse_status: 'pending' | 'parsing' | 'complete' | 'failed';
  parse_error: string | null;
  created_at: string;
  updated_at: string;
};

export type JpCoverLetter = {
  id: string;
  user_id: string;
  resume_id: string | null;
  application_id: string | null;
  company_name: string | null;
  job_title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type CampaignStatus =
  | 'draft'
  | 'discovering'
  | 'active'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'failed';

export type JpCampaign = {
  id: string;
  user_id: string;
  resume_id: string | null;
  name: string;
  current_job_title: string;
  target_role: string;
  industry: string | null;
  locations: string[];
  dealbreakers: string[];
  channel_email: boolean;
  channel_linkedin: boolean;
  daily_cap: number;
  status: CampaignStatus;
  error_message: string | null;
  n8n_execution_id: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationStage =
  | 'identified'
  | 'outreach_sent'
  | 'reply_received'
  | 'interview'
  | 'offer'
  | 'rejected';

export type JpApplication = {
  id: string;
  user_id: string;
  campaign_id: string | null;
  resume_id: string | null;
  company_name: string;
  company_domain: string | null;
  job_title: string;
  job_url: string | null;
  location: string | null;
  work_model: string | null;
  salary_min: number | null;
  salary_max: number | null;
  job_description: string | null;
  source: string | null;
  match_score: number | null;
  ats_missing_keywords: string[];
  stage: ApplicationStage;
  stage_changed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipientType = 'hiring_manager' | 'department_head' | 'recruiter' | 'other';

export type JpContact = {
  id: string;
  user_id: string;
  application_id: string;
  recipient_type: RecipientType;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  email_status: string | null;
  linkedin_url: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageStatus =
  | 'draft'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled'
  | 'bounced';

export type JpOutreachMessage = {
  id: string;
  user_id: string;
  campaign_id: string | null;
  application_id: string;
  contact_id: string | null;
  channel: 'email' | 'linkedin';
  recipient_type: RecipientType;
  subject: string | null;
  body: string;
  edited_by_user: boolean;
  status: MessageStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  error_message: string | null;
  thread_id: string | null;
  opened_count: number;
  replied: boolean;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JpReply = {
  id: string;
  user_id: string;
  message_id: string | null;
  application_id: string | null;
  channel: 'email' | 'linkedin';
  from_name: string | null;
  from_address: string | null;
  subject: string | null;
  body: string | null;
  received_at: string;
  is_read: boolean;
  created_at: string;
};

export type ReminderKind = 'follow_up' | 'deadline' | 'interview' | 'custom';

export type JpReminder = {
  id: string;
  user_id: string;
  application_id: string | null;
  kind: ReminderKind;
  title: string;
  due_at: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
};

export type AccountProvider = 'gmail' | 'outlook' | 'linkedin';

export type AccountStatus = 'connected' | 'disconnected' | 'error' | 'paused';

export type JpConnectedAccount = {
  id: string;
  user_id: string;
  provider: AccountProvider;
  account_email: string | null;
  display_name: string | null;
  unipile_account_id: string | null;
  status: AccountStatus;
  daily_limit: number;
  sends_today: number;
  sends_reset_at: string | null;
  connected_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JpCreditTransaction = {
  id: string;
  user_id: string;
  type: 'plan_grant' | 'topup_purchase' | 'action_spend' | 'refund' | 'expiry_deduct';
  amount: number;
  balance_after: number;
  action_type: string | null;
  description: string | null;
  reference_id: string | null;
  created_at: string;
};

export type JpCreditActionCost = {
  action_type: string;
  credits_cost: number;
  description: string;
};

export type JpFunnelCount = {
  user_id: string;
  campaign_id: string | null;
  stage: ApplicationStage;
  total: number;
};

export type JpDailySendCount = {
  user_id: string;
  day: string;
  sent: number;
};

export type JpReplyStat = {
  user_id: string;
  channel: 'email' | 'linkedin';
  recipient_type: RecipientType;
  sent: number;
  replied: number;
};
