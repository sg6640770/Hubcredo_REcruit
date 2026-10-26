import { useCallback, useEffect, useState } from 'react';
import {
  Play,
  ExternalLink,
  Loader2,
  ChevronDown,
  Linkedin,
  Mail,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import './TriggerSpacePage.css';

// Highest number of jobs one search may request (frontend limit — change if your backend allows more)
const MAX_JOBS = 50;

type Run = {
  id: string;
  keyword: string;
  location: string | null;
  source: string;
  status: 'running' | 'completed' | 'failed';
  jobs_found: number;
  contacts_found: number;
  created_at: string;
};

type Job = {
  id: string;
  title: string;
  company_name: string;
  company_slug: string | null;
  location: string | null;
  job_url: string;
  description: string | null;
  posted_at: string | null;
  applicants_count: number | null;
  employment_type: string | null;
};

type Contact = {
  id: string;
  company_slug: string | null;
  first_name: string;
  last_name: string;
  headline: string | null;
  linkedin_url: string;
  email: string | null;
  location: string | null;
};

async function triggerSearch(body: Record<string, unknown>) {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  const token = data.session?.access_token;

  if (!token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const res = await fetch('/api/recruit/job-signals/trigger', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json.error ?? 'Could not start search');
  }

  return json as { run_id: string };
}

export default function TriggerSpacePage() {
  const [form, setForm] = useState({
    source: 'linkedin',
    keyword: '',
    location: 'India',
    experience: 'Mid-Senior',
    industry: '',
    max_jobs: '20', // kept as text so the field can be cleared while typing
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<string | null>(
    new URLSearchParams(window.location.search).get('run')
  );
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  // Delete flow
  const [pendingDelete, setPendingDelete] = useState<Run | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadRuns = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('job_search_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (loadError) {
      console.error('Failed to load searches:', loadError.message);
      return;
    }

    const loadedRuns = (data as Run[]) ?? [];
    setRuns(loadedRuns);

    setActiveRun((current) => {
      if (current && loadedRuns.some((run) => run.id === current)) {
        return current;
      }

      return loadedRuns[0]?.id ?? null;
    });
  }, []);

  const loadRun = useCallback(async (id: string) => {
    const [jobsResult, contactsResult] = await Promise.all([
      supabase
        .from('job_search_jobs')
        .select('*')
        .eq('run_id', id)
        .order('posted_at', { ascending: false }),

      supabase
        .from('job_search_contacts')
        .select('*')
        .eq('run_id', id),
    ]);

    if (jobsResult.error) {
      console.error('Failed to load jobs:', jobsResult.error.message);
    }

    if (contactsResult.error) {
      console.error(
        'Failed to load contacts:',
        contactsResult.error.message
      );
    }

    setJobs((jobsResult.data as Job[]) ?? []);
    setContacts((contactsResult.data as Contact[]) ?? []);
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (activeRun) {
      void loadRun(activeRun);
    } else {
      setJobs([]);
      setContacts([]);
    }
  }, [activeRun, loadRun]);

  const current = runs.find((run) => run.id === activeRun);

  useEffect(() => {
    if (current?.status !== 'running') return;

    const interval = window.setInterval(() => {
      void loadRuns();
      if (activeRun) {
        void loadRun(activeRun);
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [current?.status, activeRun, loadRuns, loadRun]);

  // Esc closes the delete dialog
  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) setPendingDelete(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete, deleting]);

  const submit = async () => {
    if (!form.keyword.trim()) {
      setError('Please enter a job title or keyword.');
      return;
    }

    const maxJobs = Math.floor(Number(form.max_jobs));
    if (!Number.isFinite(maxJobs) || maxJobs < 1) {
      setError('Enter how many jobs you want (at least 1).');
      return;
    }
    if (maxJobs > MAX_JOBS) {
      setError(`You can fetch up to ${MAX_JOBS} jobs per search.`);
      return;
    }

    if (submitting) return;

    setError('');
    setSubmitting(true);

    try {
      const { run_id } = await triggerSearch({
        ...form,
        keyword: form.keyword.trim(),
        location: form.location.trim(),
        max_jobs: maxJobs,
      });

      await loadRuns();
      setActiveRun(run_id);
      setOpen(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to start search.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openDelete = (run: Run) => {
    setDeleteError('');
    setPendingDelete(run);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    const target = pendingDelete;

    setDeleting(true);
    setDeleteError('');

    // Removes the search, its jobs and its contacts in one go (see delete_job_search_run.sql)
    const { error: rpcError } = await supabase.rpc('delete_job_search_run', {
      p_run_id: target.id,
    });

    setDeleting(false);

    if (rpcError) {
      setDeleteError(rpcError.message || 'Could not delete this search.');
      return;
    }

    setPendingDelete(null);
    setOpen(null);

    if (activeRun === target.id) {
      setJobs([]);
      setContacts([]);
    }

    // Reloads the list; if the deleted search was open, the next one is selected
    await loadRuns();
  };

  const inputCls = 'trigger-space__input';

  return (
    <div className="trigger-space">
      {/* Page header */}
      <header className="trigger-space__header">
        <h1>Trigger Space</h1>
        <p>
          Search jobs, discover hiring companies, and find the right
          people to contact.
        </p>
      </header>

      {/* Search form */}
      <form
        className="trigger-space__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <select
          aria-label="Job source"
          className={inputCls}
          value={form.source}
          onChange={(event) =>
            setForm({ ...form, source: event.target.value })
          }
        >
          <option value="linkedin">LinkedIn</option>
          <option value="indeed">Indeed</option>
          <option value="both">Both sources</option>
        </select>

        <input
          className={inputCls}
          placeholder="Keyword e.g. Backend Engineer"
          aria-label="Job keyword"
          value={form.keyword}
          onChange={(event) =>
            setForm({ ...form, keyword: event.target.value })
          }
        />

        <input
          className={inputCls}
          placeholder="Location"
          aria-label="Job location"
          value={form.location}
          onChange={(event) =>
            setForm({ ...form, location: event.target.value })
          }
        />

        <select
          aria-label="Experience level"
          className={inputCls}
          value={form.experience}
          onChange={(event) =>
            setForm({ ...form, experience: event.target.value })
          }
        >
          <option>Entry Level</option>
          <option>Mid-Senior</option>
          <option>Senior</option>
        </select>

        <div className="trigger-space__count">
          <input
            type="number"
            min={1}
            max={MAX_JOBS}
            step={1}
            inputMode="numeric"
            className={inputCls}
            placeholder="20"
            aria-label={`Number of jobs to fetch (1 to ${MAX_JOBS})`}
            title={`How many jobs to fetch (1–${MAX_JOBS})`}
            value={form.max_jobs}
            onChange={(event) =>
              setForm({ ...form, max_jobs: event.target.value.replace(/[^\d]/g, '') })
            }
          />
          <span>jobs</span>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="trigger-space__button"
        >
          {submitting ? (
            <Loader2
              size={17}
              className="trigger-space__spinner"
            />
          ) : (
            <Play size={17} />
          )}
          {submitting ? 'Starting...' : 'Trigger'}
        </button>

        {error && (
          <p className="trigger-space__error" role="alert">
            {error}
          </p>
        )}
      </form>

      {/* Search history */}
      <section className="trigger-space__section">
        <h2 className="trigger-space__section-title">
          Your recent jobs
        </h2>

        <div className="trigger-space__runs">
          {runs.map((run) => (
            <div key={run.id} className="trigger-space__run-wrap">
              <button
                type="button"
                onClick={() => {
                  setActiveRun(run.id);
                  setOpen(null);
                }}
                className={`trigger-space__run ${
                  run.id === activeRun
                    ? 'trigger-space__run--active'
                    : ''
                }`}
              >
                <span>{run.keyword}</span>
                {run.location && <span>· {run.location}</span>}
                <span>
                  ·{' '}
                  {run.status === 'running'
                    ? 'Running…'
                    : `${run.jobs_found} jobs`}
                </span>
                {run.status === 'failed' && <span>⚠</span>}
              </button>

              <button
                type="button"
                className="trigger-space__delete"
                aria-label={`Delete search ${run.keyword}`}
                title="Delete this search"
                onClick={() => openDelete(run)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {runs.length === 0 && (
            <div className="trigger-space__empty">
              <Play size={26} />
              <p>No searches yet</p>
              <span>
                Enter a job title above and trigger your first search.
              </span>
            </div>
          )}
        </div>

        {current?.status === 'running' && (
          <p className="trigger-space__status">
            <Loader2
              size={16}
              className="trigger-space__spinner"
            />
            Searching for jobs. Results will appear here as they arrive.
          </p>
        )}

        {current?.status === 'failed' && (
          <p className="trigger-space__error">
            This search failed. Try starting a new search.
          </p>
        )}

        {/* Job cards */}
        <div className="trigger-space__jobs">
          {jobs.map((job) => {
            const people = contacts.filter(
              (contact) =>
                contact.company_slug &&
                contact.company_slug === job.company_slug
            );

            const isOpen = open === job.id;

            return (
              <article
                key={job.id}
                className="trigger-space__job"
              >
                <div className="trigger-space__job-header">
                  <div className="trigger-space__job-info">
                    <h3 className="trigger-space__job-title">
                      {job.title}
                    </h3>

                    <p className="trigger-space__job-meta">
                      <span className="trigger-space__company">
                        {job.company_name}
                      </span>

                      {job.location && (
                        <span>· {job.location}</span>
                      )}

                      {job.posted_at && (
                        <span>· Posted {job.posted_at}</span>
                      )}

                      {job.applicants_count != null && (
                        <span>
                          · {job.applicants_count} applicants
                        </span>
                      )}

                      {job.employment_type && (
                        <span>· {job.employment_type}</span>
                      )}
                    </p>
                  </div>

                  <a
                    href={job.job_url}
                    target="_blank"
                    rel="noreferrer"
                    className="trigger-space__job-link"
                  >
                    View job
                    <ExternalLink size={14} />
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setOpen(isOpen ? null : job.id)
                  }
                  aria-expanded={isOpen}
                  className="trigger-space__expand"
                >
                  <ChevronDown
                    size={15}
                    className={`trigger-space__expand-icon ${
                      isOpen
                        ? 'trigger-space__expand-icon--open'
                        : ''
                    }`}
                  />
                  Description & {people.length} people to contact
                </button>

                {isOpen && (
                  <div className="trigger-space__details">
                    {/* Job description */}
                    <div>
                      <h4 className="trigger-space__details-title">
                        Job description
                      </h4>

                      <p className="trigger-space__description">
                        {job.description ||
                          'No job description available.'}
                      </p>
                    </div>

                    {/* Contacts */}
                    <div>
                      <h4 className="trigger-space__details-title">
                        People to contact
                      </h4>

                      <div className="trigger-space__contacts">
                        {people.length === 0 && (
                          <p className="trigger-space__muted">
                            No contacts found for this company yet.
                          </p>
                        )}

                        {people.map((person) => (
                          <div
                            key={person.id}
                            className="trigger-space__contact"
                          >
                            <div className="trigger-space__contact-name">
                              {person.first_name} {person.last_name}
                            </div>

                            <div className="trigger-space__contact-headline">
                              {person.headline ||
                                'No headline available'}
                            </div>

                            {person.location && (
                              <div className="trigger-space__contact-headline">
                                {person.location}
                              </div>
                            )}

                            <div className="trigger-space__contact-links">
                              {person.linkedin_url && (
                                <a
                                  href={person.linkedin_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Linkedin size={14} />
                                  Profile
                                </a>
                              )}

                              {person.email && (
                                <a href={`mailto:${person.email}`}>
                                  <Mail size={14} />
                                  {person.email}
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {activeRun &&
            current?.status !== 'running' &&
            jobs.length === 0 &&
            current?.status !== 'failed' && (
              <div className="trigger-space__empty">
                <p>No jobs found for this search.</p>
                <span>
                  Try another keyword or location.
                </span>
              </div>
            )}
        </div>
      </section>

      {/* Delete confirmation */}
      {pendingDelete && (
        <div
          className="trigger-space__modal-backdrop"
          onClick={() => {
            if (!deleting) setPendingDelete(null);
          }}
        >
          <div
            className="trigger-space__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trigger-space-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="trigger-space-delete-title">Delete this search?</h3>

            <p>
              <strong>
                {pendingDelete.keyword}
                {pendingDelete.location ? ` · ${pendingDelete.location}` : ''}
              </strong>{' '}
              and its {pendingDelete.jobs_found} job
              {pendingDelete.jobs_found === 1 ? '' : 's'} and contacts will be
              permanently removed. Your “Jobs Identified” count on the dashboard
              will go down by {pendingDelete.jobs_found}.
            </p>

            {pendingDelete.status === 'running' && (
              <p className="trigger-space__modal-warning">
                This search is still running. Any results that arrive later will be
                discarded.
              </p>
            )}

            {deleteError && (
              <p className="trigger-space__error" role="alert">
                {deleteError}
              </p>
            )}

            <div className="trigger-space__modal-actions">
              <button
                type="button"
                className="trigger-space__modal-cancel"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="trigger-space__modal-delete"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 size={15} className="trigger-space__spinner" />
                ) : (
                  <Trash2 size={15} />
                )}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
