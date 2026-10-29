import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  MapPin,
  Briefcase,
  Home,
  ExternalLink,
  RefreshCw,
  Radio,
  Building2,
  Wallet,
  Clock,
  Info,
  AlertCircle,
  SearchX,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import './LiveJobsPage.css';

type LiveJob = {
  id: number;
  job_title: string;
  company: string;
  location: string | null;
  employment_type: string | null;
  category: string | null;
  remote: boolean;
  salary: string | null;
  posted_age: string | null;
  application_url: string | null;
  created_at: string;
  posted_days: number | null;
};

type LiveJobsResponse = {
  jobs: LiveJob[];
  total: number;
  days: number;
  last_updated: string | null;
};

type PostedFilter = 'all' | 'today' | '3d';
type SortBy = 'newest' | 'company' | 'salary';

const PAGE_SIZE = 18;

const cleanLocation = (value: string | null) =>
  (value ?? '').replace(/^[·\s]+/, '').trim();

const hasSalary = (value: string | null) =>
  !!value && !/not\s+(listed|posted)|pay not posted/i.test(value);

const cleanSalary = (value: string | null) =>
  (value ?? '').replace(/^[^\w$€£]+/, '').trim();

function postedLabel(job: LiveJob) {
  if (job.posted_days === 0) return 'Today';
  if (job.posted_days === 1) return '1 day ago';
  if (job.posted_days != null) return `${job.posted_days} days ago`;
  return job.posted_age ?? '';
}

function timeAgo(iso: string | null) {
  if (!iso) return '—';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Some rows have no application URL — give the user a working search link instead.
function jobLink(job: LiveJob) {
  if (job.application_url) return { href: job.application_url, label: 'Apply now' };
  const q = encodeURIComponent(`${job.job_title} ${job.company}`);
  return { href: `https://www.linkedin.com/jobs/search/?keywords=${q}`, label: 'Find on LinkedIn' };
}

async function fetchLiveJobs(): Promise<LiveJobsResponse> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);

  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  const res = await fetch('/api/live-jobs?days=7', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(json.error ?? 'Could not load live jobs');
  return json as LiveJobsResponse;
}

export default function LiveJobsPage() {
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [posted, setPosted] = useState<PostedFilter>('all');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const result = await fetchLiveJobs();
      setJobs(result.jobs);
      setLastUpdated(result.last_updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load live jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Refresh when the user returns to this tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Reset pagination whenever filters change
  useEffect(() => { setVisible(PAGE_SIZE); }, [query, posted, remoteOnly, category, sortBy]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => { if (j.category?.trim()) set.add(j.category.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = jobs.filter((job) => {
      if (remoteOnly && !job.remote) return false;
      if (category !== 'all' && (job.category ?? '').trim() !== category) return false;
      if (posted === 'today' && job.posted_days !== 0) return false;
      if (posted === '3d' && (job.posted_days ?? 99) > 3) return false;
      if (q) {
        const hay = `${job.job_title} ${job.company} ${cleanLocation(job.location)} ${job.category ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'company') {
      list.sort((a, b) => a.company.localeCompare(b.company));
    } else if (sortBy === 'salary') {
      list.sort((a, b) => Number(hasSalary(b.salary)) - Number(hasSalary(a.salary)));
    }
    return list; // 'newest' keeps the order from the API
  }, [jobs, query, posted, remoteOnly, category, sortBy]);

  const stats = useMemo(() => ({
    total: jobs.length,
    today: jobs.filter((j) => j.posted_days === 0).length,
    remote: jobs.filter((j) => j.remote).length,
    companies: new Set(jobs.map((j) => j.company)).size,
  }), [jobs]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="lj">
      {/* Header */}
      <header className="lj-header">
        <div>
          <span className="lj-badge"><span className="lj-pulse" /> Live</span>
          <h1>Live Jobs</h1>
          <p>Fresh openings picked up automatically every day — apply before everyone else does.</p>
        </div>

        <div className="lj-header-side">
          <span className="lj-info-chip" title="This list refreshes automatically once a day">
            <Info size={14} /> Runs daily · last 7 days
          </span>
          <button className="lj-refresh" onClick={() => void load(true)} disabled={refreshing || loading}>
            <RefreshCw size={15} className={refreshing ? 'lj-spin' : ''} />
            {refreshing ? 'Refreshing…' : `Updated ${timeAgo(lastUpdated)}`}
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="lj-stats">
        <div className="lj-stat"><Briefcase size={18} /><div><strong>{stats.total}</strong><span>Open jobs</span></div></div>
        <div className="lj-stat lj-stat--green"><Radio size={18} /><div><strong>{stats.today}</strong><span>Posted today</span></div></div>
        <div className="lj-stat lj-stat--blue"><Home size={18} /><div><strong>{stats.remote}</strong><span>Remote friendly</span></div></div>
        <div className="lj-stat lj-stat--pink"><Building2 size={18} /><div><strong>{stats.companies}</strong><span>Companies hiring</span></div></div>
      </div>

      {/* Toolbar */}
      <div className="lj-toolbar">
        <div className="lj-search">
          <Search size={16} />
          <input
            placeholder="Search title, company or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search live jobs"
          />
        </div>

        <div className="lj-pills" role="group" aria-label="Posted within">
          {([['all', 'Any time'], ['today', 'Today'], ['3d', '3 days']] as [PostedFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`lj-pill ${posted === value ? 'lj-pill--active' : ''}`}
              onClick={() => setPosted(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={remoteOnly}
          className={`lj-pill lj-pill--icon ${remoteOnly ? 'lj-pill--active' : ''}`}
          onClick={() => setRemoteOnly((v) => !v)}
        >
          <Home size={14} /> Remote only
        </button>

        <select className="lj-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="lj-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} aria-label="Sort by">
          <option value="newest">Newest first</option>
          <option value="salary">Salary listed first</option>
          <option value="company">Company A–Z</option>
        </select>
      </div>

      {/* Body */}
      {loading ? (
        <div className="lj-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="lj-skel" />)}
        </div>
      ) : error ? (
        <div className="lj-state lj-state--error">
          <AlertCircle size={30} />
          <h3>Couldn’t load live jobs</h3>
          <p>{error}</p>
          <button className="lj-btn" onClick={() => void load()}>Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="lj-state">
          <SearchX size={30} />
          <h3>{jobs.length === 0 ? 'No jobs yet' : 'No jobs match your filters'}</h3>
          <p>
            {jobs.length === 0
              ? 'New jobs are added every day. Check back soon.'
              : 'Try removing a filter or searching for something broader.'}
          </p>
        </div>
      ) : (
        <>
          <p className="lj-count">
            Showing <strong>{shown.length}</strong> of <strong>{filtered.length}</strong> jobs
          </p>

          <div className="lj-grid">
            {shown.map((job) => {
              const link = jobLink(job);
              const location = cleanLocation(job.location);
              const salaryListed = hasSalary(job.salary);

              return (
                <article key={`${job.id}-${job.company}-${job.job_title}`} className="lj-card">
                  <div className="lj-card-top">
                    <div className="lj-avatar" aria-hidden="true">
                      {job.company?.trim().charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="lj-card-head">
                      <h3 title={job.job_title}>{job.job_title}</h3>
                      <p><Building2 size={13} /> {job.company}</p>
                    </div>
                    <span className={`lj-posted ${job.posted_days === 0 ? 'lj-posted--new' : ''}`}>
                      <Clock size={12} /> {postedLabel(job)}
                    </span>
                  </div>

                  <div className="lj-meta">
                    {location && <span className="lj-chip"><MapPin size={13} /> {location}</span>}
                    {job.remote && <span className="lj-chip lj-chip--remote"><Home size={13} /> Remote</span>}
                    {job.employment_type && <span className="lj-chip"><Briefcase size={13} /> {job.employment_type}</span>}
                    {job.category && <span className="lj-chip lj-chip--cat">{job.category}</span>}
                  </div>

                  <div className="lj-card-foot">
                    <span className={`lj-salary ${salaryListed ? '' : 'lj-salary--muted'}`}>
                      <Wallet size={14} /> {salaryListed ? cleanSalary(job.salary) : 'Salary not listed'}
                    </span>
                    <a href={link.href} target="_blank" rel="noreferrer" className="lj-apply">
                      {link.label} <ExternalLink size={14} />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>

          {visible < filtered.length && (
            <div className="lj-more">
              <button className="lj-btn lj-btn--ghost" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Load more jobs ({filtered.length - visible} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
