import { API_BASE_URL, USE_MOCKS, supabase } from '@/lib/supabase';
import type {
  ResumeContent,
  JpApplication,
  JpOutreachMessage,
  JpContact,
} from '@/types/db';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (res.status === 402) {
    throw new InsufficientCreditsError();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super('You are out of credits.');
    this.name = 'InsufficientCreditsError';
  }
}

// ── Mock implementations ──

function mockResumeContent(name: string): ResumeContent {
  return {
    basics: {
      name,
      email: 'candidate@example.com',
      phone: '(555) 123-4567',
      location: 'San Francisco, CA',
      headline: 'Senior Product Manager',
      links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/example' }],
    },
    summary:
      'Product manager with 8 years building B2B SaaS products. Led cross-functional teams to ship features used by 2M+ users.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'Senior Product Manager',
        location: 'San Francisco, CA',
        start: '2021-03',
        end: '',
        current: true,
        bullets: [
          'Led product roadmap for a $20M ARR SaaS platform.',
          'Launched self-serve onboarding, reducing time-to-value by 45%.',
        ],
      },
      {
        company: 'Globex Inc',
        title: 'Product Manager',
        location: 'Remote',
        start: '2017-06',
        end: '2021-02',
        current: false,
        bullets: [
          'Drove growth of analytics product from 0 to 1M users.',
          'Built experimentation framework adopted across 4 squads.',
        ],
      },
    ],
    education: [
      {
        school: 'Stanford University',
        degree: 'B.S.',
        field: 'Computer Science',
        start: '2013',
        end: '2017',
      },
    ],
    skills: ['Product Strategy', 'Roadmapping', 'SQL', 'User Research', 'A/B Testing', 'Figma'],
    projects: [
      { name: 'OpenAnalytics', description: 'Open-source analytics dashboard for small teams.', url: 'https://github.com/example' },
    ],
    certifications: ['Certified Scrum Product Owner'],
  };
}

const mockJobs: Array<Partial<JpApplication> & { company_name: string; job_title: string }> = [
  { company_name: 'Stripe', job_title: 'Senior Product Manager', location: 'Remote', work_model: 'Remote', match_score: 92, salary_min: 160000, salary_max: 210000, source: 'campaign', company_domain: 'stripe.com' },
  { company_name: 'Notion', job_title: 'Product Manager, Growth', location: 'San Francisco, CA', work_model: 'Hybrid', match_score: 88, salary_min: 150000, salary_max: 195000, source: 'campaign', company_domain: 'notion.so' },
  { company_name: 'Linear', job_title: 'Group PM, Platform', location: 'Remote', work_model: 'Remote', match_score: 85, salary_min: 170000, salary_max: 220000, source: 'campaign', company_domain: 'linear.app' },
];

export const api = {
  // Resume
  parseResume: async (resumeId: string): Promise<{ ok: boolean }> => {
    if (USE_MOCKS) {
      await delay(1200);
      return { ok: true };
    }
    return call<{ ok: boolean }>('/resume/parse', { resume_id: resumeId });
  },

  tailorResume: async (resumeId: string, jobDescription: string): Promise<{ suggestions: { section: string; before: string; after: string }[] }> => {
    if (USE_MOCKS) {
      await delay(800);
      return {
        suggestions: [
          {
            section: 'summary',
            before: 'Product manager with 8 years building B2B SaaS products.',
            after:
              'Product manager with 8 years scaling B2B SaaS products from $5M to $50M ARR, specializing in growth and self-serve onboarding.',
          },
          {
            section: 'experience[0].bullets[0]',
            before: 'Led product roadmap for a $20M ARR SaaS platform.',
            after:
              'Led product roadmap for a $20M ARR SaaS platform, driving 3x growth in self-serve signups.',
          },
        ],
      };
    }
    return call<{ suggestions: { section: string; before: string; after: string }[] }>('/resume/tailor', { resume_id: resumeId, job_description: jobDescription });
  },

  matchResume: async (resumeId: string, jobDescription: string): Promise<{ score: number; matched: string[]; missing: string[] }> => {
    if (USE_MOCKS) {
      await delay(700);
      return {
        score: 82,
        matched: ['Product Strategy', 'Roadmapping', 'SQL', 'A/B Testing', 'SaaS'],
        missing: ['Go-to-Market Strategy', 'Enterprise Sales Alignment'],
      };
    }
    return call<{ score: number; matched: string[]; missing: string[] }>('/resume/match', { resume_id: resumeId, job_description: jobDescription });
  },

  rewriteText: async (text: string, instruction?: string): Promise<{ text: string }> => {
    if (USE_MOCKS) {
      await delay(600);
      const rewritten = instruction
        ? `${text} — refined with a focus on ${instruction}.`
        : `${text} (strengthened with measurable impact and clearer narrative.)`;
      return { text: rewritten };
    }
    return call<{ text: string }>('/resume/rewrite', { text, instruction });
  },

  linkedinSummary: async (resumeId: string): Promise<{ summary: string }> => {
    if (USE_MOCKS) {
      await delay(900);
      return {
        summary:
          'Senior Product Manager | 8+ years building B2B SaaS products used by millions. I turn ambiguous problems into shipped features that move ARR. Currently exploring growth-stage opportunities.',
      };
    }
    return call<{ summary: string }>('/resume/linkedin-summary', { resume_id: resumeId });
  },

  // Cover letter
  generateCoverLetter: async (resumeId: string, jobDescription: string, company?: string, title?: string): Promise<{ body: string }> => {
    if (USE_MOCKS) {
      await delay(1100);
      const comp = company || 'your company';
      return {
        body: `Dear Hiring Team at ${comp},\n\nI am excited to apply for the ${title || 'Product Manager'} role. With 8 years building B2B SaaS products and a track record of driving self-serve growth, I am confident I can make an immediate impact.\n\nAt Acme Corp, I led the roadmap for a $20M ARR platform and launched a self-serve onboarding flow that reduced time-to-value by 45%. I bring deep expertise in product strategy, experimentation, and cross-functional leadership.\n\nI would welcome the chance to discuss how my experience aligns with your team's goals.\n\nBest regards,\nCandidate`,
      };
    }
    return call<{ body: string }>('/cover-letter/generate', { resume_id: resumeId, job_description: jobDescription, company, title });
  },

  // Campaign
  launchCampaign: async (campaignId: string): Promise<{ ok: boolean; jobsFound?: number }> => {
    if (USE_MOCKS) {
      await delay(1500);
      return { ok: true, jobsFound: 3 };
    }
    return call<{ ok: boolean; jobsFound?: number }>(`/campaigns/${campaignId}/launch`, {});
  },

  // Connected accounts
  connectAccount: async (provider: string): Promise<{ auth_url: string }> => {
    if (USE_MOCKS) {
      await delay(500);
      return { auth_url: `${window.location.origin}/connected-accounts?mock_oauth=${provider}` };
    }
    return call<{ auth_url: string }>('/accounts/connect', { provider });
  },

  // Billing
  checkout: async (packId: string): Promise<{ url: string }> => {
    if (USE_MOCKS) {
      await delay(600);
      return { url: `${window.location.origin}/settings?mock_checkout=${packId}` };
    }
    return call<{ url: string }>('/billing/checkout', { pack_id: packId });
  },
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Mock data helpers for campaigns ──

export function mockCampaignJobs(campaignId: string): JpApplication[] {
  void campaignId;
  return mockJobs.map((j, i) => ({
    id: `mock-job-${i}`,
    user_id: '',
    campaign_id: campaignId,
    resume_id: null,
    company_name: j.company_name,
    company_domain: j.company_domain ?? null,
    job_title: j.job_title,
    job_url: `https://example.com/job/${i}`,
    location: j.location ?? null,
    work_model: j.work_model ?? null,
    salary_min: j.salary_min ?? null,
    salary_max: j.salary_max ?? null,
    job_description: 'Mock job description text for demonstration purposes.',
    source: j.source ?? 'campaign',
    match_score: j.match_score ?? null,
    ats_missing_keywords: ['Leadership', 'Stakeholder Management'],
    stage: 'identified' as const,
    stage_changed_at: new Date().toISOString(),
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

export function mockCampaignMessages(applications: JpApplication[]): JpOutreachMessage[] {
  const messages: JpOutreachMessage[] = [];
  applications.forEach((app, i) => {
    (['hiring_manager', 'department_head'] as const).forEach((recipient_type, j) => {
      messages.push({
        id: `mock-msg-${i}-${j}`,
        user_id: '',
        campaign_id: app.campaign_id,
        application_id: app.id,
        contact_id: null,
        channel: 'email',
        recipient_type,
        subject: `Interested in the ${app.job_title} role at ${app.company_name}`,
        body: `Hi ${recipient_type === 'hiring_manager' ? 'Hiring Manager' : 'Team Lead'},\n\nI saw the ${app.job_title} role at ${app.company_name} and wanted to reach out directly. My background in B2B SaaS product management aligns well with what you're building.\n\nWould love to chat if the role is still open.\n\nBest,\nCandidate`,
        edited_by_user: false,
        status: 'queued' as const,
        scheduled_for: null,
        sent_at: null,
        error_message: null,
        thread_id: null,
        opened_count: 0,
        replied: false,
        replied_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
  });
  return messages;
}

export function mockContacts(applicationId: string): JpContact[] {
  return [
    {
      id: `mock-contact-hm-${applicationId}`,
      user_id: '',
      application_id: applicationId,
      recipient_type: 'hiring_manager',
      first_name: 'Sarah',
      last_name: 'Chen',
      job_title: 'VP of Product',
      email: 'sarah.chen@example.com',
      email_status: 'verified',
      linkedin_url: 'https://linkedin.com/in/sarahchen',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: `mock-contact-dh-${applicationId}`,
      user_id: '',
      application_id: applicationId,
      recipient_type: 'department_head',
      first_name: 'Michael',
      last_name: 'Torres',
      job_title: 'Head of Engineering',
      email: 'm.torres@example.com',
      email_status: 'verified',
      linkedin_url: 'https://linkedin.com/in/mtorres',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
}
