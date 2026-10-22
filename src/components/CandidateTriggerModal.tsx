import { useState } from 'react';
import { Play, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

type Source = 'linkedin' | 'indeed';

type FormState = {
  keyword: string;
  location: string;
  experience: string;
  industry: string;
  maxJobs: string;
};

const initialForm: FormState = {
  keyword: '',
  location: '',
  experience: 'Mid-Senior',
  industry: '',
  maxJobs: '100',
};

export default function CandidateTriggerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [source, setSource] = useState<Source>('linkedin');
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    if (!form.keyword.trim()) {
      toast.show('Keyword is required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch('/api/recruit/job-signals/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          source,
          keyword: form.keyword.trim(),
          location: form.location.trim() || undefined,
          experience: form.experience || undefined,
          industry: form.industry.trim() || undefined,
          max_jobs: form.maxJobs ? Number(form.maxJobs) : undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : 'Could not start the search.');
      }

      toast.show(`${source === 'linkedin' ? 'LinkedIn' : 'Indeed'} search started.`, 'success');
      setForm(initialForm);
      setSource('linkedin');
      onClose();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not reach the search service.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="jp-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="jp-trigger-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-trigger-title">
        <div className="jp-trigger-header">
          <h2 id="candidate-trigger-title">Trigger scrape</h2>
          <button className="jp-icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="jp-trigger-sources" role="tablist" aria-label="Job board">
          {(['linkedin', 'indeed'] as const).map((item) => (
            <button key={item} className={source === item ? 'active' : ''} onClick={() => setSource(item)} role="tab" aria-selected={source === item}>
              {item === 'linkedin' ? 'LinkedIn' : 'Indeed'}
            </button>
          ))}
        </div>

        <div className="jp-trigger-grid">
          <label><span>Keyword *</span><input value={form.keyword} onChange={(event) => update('keyword', event.target.value)} placeholder="e.g. Backend Engineer" autoFocus /></label>
          <label><span>Location</span><input value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="e.g. San Francisco" /></label>
          <label><span>Experience</span><select value={form.experience} onChange={(event) => update('experience', event.target.value)}><option>Entry Level</option><option>Mid-Senior</option><option>Director</option><option>Executive</option></select></label>
          <label><span>Industry (optional)</span><input value={form.industry} onChange={(event) => update('industry', event.target.value)} placeholder="e.g. FinTech" /></label>
          <label><span>Max jobs</span><input type="number" min="1" max="500" value={form.maxJobs} onChange={(event) => update('maxJobs', event.target.value)} /></label>
        </div>

        <div className="jp-trigger-actions">
          <button className="jp-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="jp-btn-primary" onClick={submit} disabled={submitting}><Play size={15} />{submitting ? 'Starting…' : `Trigger ${source === 'linkedin' ? 'LinkedIn' : 'Indeed'} scrape`}</button>
        </div>
      </div>
    </div>
  );
}
