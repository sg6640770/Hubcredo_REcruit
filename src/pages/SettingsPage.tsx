import { useEffect, useState } from 'react';
import { Mail, Linkedin, Zap, Check, X, Loader2, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function authFetch(path: string, opts?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

// IMPORTANT: these keys must match the `service` value your backend looks
// up (e.g. server/routes/replyioLinkedin.ts does .eq("service", "replyio"))
// — no underscore, matching that exactly.
type ProviderKey = 'replyio' | 'linkedin' | 'email';

interface UserIntegration {
  id: string;
  user_id: string;
  service: string;
  api_key: string | null;
  workspace_id?: string | null;
  account_label?: string | null;
  is_connected: boolean;
  last_checked_at?: string | null;
  created_at: string;
  updated_at: string;
}

const providers: {
  key: ProviderKey;
  label: string;
  desc: string;
  icon: typeof Mail;
  placeholder: string;
  fieldLabel: string;
  liveVerified: boolean; // true = we actually call the provider's API to confirm the key works
}[] = [
  { key: 'replyio', label: 'Reply.io', desc: 'Connect your Reply.io account to send and track email campaigns automatically.', icon: Zap, placeholder: 'sk-...', fieldLabel: 'API Key', liveVerified: true },
  { key: 'linkedin', label: 'LinkedIn', desc: 'Connect LinkedIn to automate connection requests and InMail outreach.', icon: Linkedin, placeholder: 'LinkedIn session cookie / API token', fieldLabel: 'Access Token', liveVerified: false },
  { key: 'email', label: 'Email (SMTP)', desc: 'Connect a custom email mailbox to send outreach from your own domain.', icon: Mail, placeholder: 'smtp://user:pass@smtp.example.com:587', fieldLabel: 'SMTP Connection String', liveVerified: false },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<UserIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ProviderKey | null>(null);
  const [forms, setForms] = useState<Record<string, { api_key: string; account_label: string }>>({});
  const [messages, setMessages] = useState<Record<string, string | null>>({});

  const load = async () => {
    // Reading is fine straight from Supabase (RLS should already scope this
    // to the logged-in user) — it's WRITES that need to go through the
    // backend so the Reply.io key gets verified before is_connected is set.
    const { data, error } = await supabase.from('user_integrations').select('*');
    if (error) {
      console.error('Failed to load integrations:', error.message);
    }
    const rows = (data as UserIntegration[]) ?? [];
    setIntegrations(rows);
    const formState: Record<string, { api_key: string; account_label: string }> = {};
    rows.forEach((r) => {
      formState[r.service] = { api_key: r.api_key ?? '', account_label: r.account_label ?? '' };
    });
    setForms(formState);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const getIntegration = (service: ProviderKey) => integrations.find((i) => i.service === service);

  const save = async (service: ProviderKey) => {
    if (!user) return;
    setSavingKey(service);
    setMessages((m) => ({ ...m, [service]: null }));
    const formData = forms[service] ?? { api_key: '', account_label: '' };

    if (!formData.api_key.trim()) {
      setMessages((m) => ({ ...m, [service]: 'Enter a key before saving.' }));
      setSavingKey(null);
      return;
    }

    try {
      // FIX: goes through the backend now, which — for replyio — makes a
      // real call to Reply.io's API and only marks is_connected: true if
      // that call succeeds. This is what makes this page agree with the
      // LinkedIn page, which does the same live check.
      const r = await authFetch('/api/integrations/save', {
        method: 'POST',
        body: JSON.stringify({
          service,
          api_key: formData.api_key,
          account_label: formData.account_label,
        }),
      });
      const d = await r.json();

      if (!r.ok) {
        setMessages((m) => ({ ...m, [service]: d.error ?? 'Could not save. Please try again.' }));
        return;
      }

      setMessages((m) => ({
        ...m,
        [service]: d.connected ? 'Connected successfully.' : 'Saved, but not yet verified.',
      }));
      await load();
    } catch (err) {
      console.error(`Failed to save ${service} integration:`, err instanceof Error ? err.message : err);
      setMessages((m) => ({ ...m, [service]: 'Could not save. Please try again.' }));
    } finally {
      setSavingKey(null);
    }
  };

  const disconnect = async (service: ProviderKey) => {
    const existing = getIntegration(service);
    if (!existing) return;
    await authFetch('/api/integrations/disconnect', {
      method: 'POST',
      body: JSON.stringify({ service }),
    });
    setForms((f) => ({ ...f, [service]: { api_key: '', account_label: f[service]?.account_label ?? '' } }));
    await load();
  };

  if (loading) return <div className="dash-loading">Loading settings…</div>;

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Connect your outreach channels and integrations.</p>
        </div>
      </div>

      <div className="integration-list">
        {providers.map((p) => {
          const integration = getIntegration(p.key);
          const isConnected = !!integration?.is_connected;
          const formData = forms[p.key] ?? { api_key: '', account_label: '' };
          const msg = messages[p.key];

          return (
            <div key={p.key} className={`integration-card ${isConnected ? 'connected' : ''}`}>
              <div className="integration-header">
                <div className="integration-icon-wrap">
                  <p.icon size={22} />
                </div>
                <div className="integration-title-block">
                  <h3>{p.label}</h3>
                  <p>{p.desc}</p>
                  {!p.liveVerified && (
                    <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '2px 0 0' }}>
                      Saved as entered — we can't verify this key automatically yet.
                    </p>
                  )}
                </div>
                <span className={`connection-badge ${isConnected ? 'is-connected' : 'is-disconnected'}`}>
                  {isConnected ? <><Check size={13} /> Connected</> : <><X size={13} /> Disconnected</>}
                </span>
              </div>

              <div className="integration-form">
                <label className="integration-field">
                  <span><KeyRound size={13} /> {p.fieldLabel}</span>
                  <input
                    type="password"
                    placeholder={p.placeholder}
                    value={formData.api_key}
                    onChange={(e) => setForms((f) => ({ ...f, [p.key]: { ...formData, api_key: e.target.value } }))}
                  />
                </label>
                <label className="integration-field">
                  <span>Account label (optional)</span>
                  <input
                    type="text"
                    placeholder="e.g. Work inbox"
                    value={formData.account_label}
                    onChange={(e) => setForms((f) => ({ ...f, [p.key]: { ...formData, account_label: e.target.value } }))}
                  />
                </label>

                {msg && <div className={`integration-msg ${/could|not saved|error/i.test(msg) ? 'error' : 'success'}`}>{msg}</div>}

                <div className="integration-actions">
                  <button className="dash-primary-btn" onClick={() => save(p.key)} disabled={savingKey === p.key}>
                    {savingKey === p.key ? <><Loader2 size={15} className="spin" /> {p.liveVerified ? 'Verifying…' : 'Saving…'}</> : <>Save connection</>}
                  </button>
                  {isConnected && (
                    <button className="dash-secondary-btn" onClick={() => disconnect(p.key)}>Disconnect</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}