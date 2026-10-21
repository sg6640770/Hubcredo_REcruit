import { useEffect, useState } from 'react';
import { Mail, Calendar, Linkedin, Plug, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Badge, LoadingSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import type { JpConnectedAccount, AccountProvider, AccountStatus } from '@/types/db';

const PROVIDERS: { provider: AccountProvider; label: string; icon: typeof Mail; color: string; available: boolean }[] = [
  { provider: 'gmail', label: 'Gmail', icon: Mail, color: '#ea4335', available: true },
  { provider: 'outlook', label: 'Outlook', icon: Mail, color: '#0078d4', available: true },
  { provider: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: '#0a66c2', available: false },
];

const STATUS_VARIANT: Record<AccountStatus, 'success' | 'neutral' | 'warning' | 'error'> = {
  connected: 'success', disconnected: 'neutral', error: 'error', paused: 'warning',
};

export default function ConnectedAccountsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [accounts, setAccounts] = useState<JpConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from('jp_connected_accounts').select('*').eq('user_id', profile.id);
    setAccounts((data as JpConnectedAccount[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile]);

  const connect = async (provider: AccountProvider) => {
    setConnecting(provider);
    try {
      const { auth_url } = await api.connectAccount(provider);
      window.location.href = auth_url;
    } catch {
      toast.show('Could not start connection.', 'error');
    }
    setConnecting(null);
  };

  const disconnect = async (account: JpConnectedAccount) => {
    await supabase.from('jp_connected_accounts').update({ status: 'disconnected' }).eq('id', account.id);
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, status: 'disconnected' } : a)));
    toast.show(`${account.provider} disconnected.`, 'info');
  };

  if (loading) return <div className="jp-page-header"><h1>Connected Accounts</h1><LoadingSkeleton className="jp-card-skel" /></div>;

  return (
    <div>
      <div className="jp-page-header">
        <div><h1>Connected Accounts</h1><p>Connect your email to send outreach automatically</p></div>
      </div>

      <div className="jp-accounts-list">
        {PROVIDERS.map((p) => {
          const account = accounts.find((a) => a.provider === p.provider);
          return (
            <div key={p.provider} className="jp-account-card">
              <div className="jp-account-icon" style={{ background: `${p.color}15`, color: p.color }}>
                <p.icon size={24} />
              </div>
              <div className="jp-account-info">
                <h3>{p.label}</h3>
                {account && account.status === 'connected' && (
                  <p>{account.account_email || 'Connected'} · {account.sends_today}/{account.daily_limit} sent today</p>
                )}
                {(!account || account.status === 'disconnected') && <p>Not connected</p>}
                {account?.status === 'error' && <p className="jp-error-text">{account.status}</p>}
              </div>
              <div className="jp-account-actions">
                {account && <Badge variant={STATUS_VARIANT[account.status]}>{account.status}</Badge>}
                {p.available ? (
                  account?.status === 'connected' ? (
                    <button className="jp-btn-ghost jp-btn-sm" onClick={() => disconnect(account)}>Disconnect</button>
                  ) : (
                    <button className="jp-btn-primary jp-btn-sm" disabled={connecting === p.provider} onClick={() => connect(p.provider)}>
                      {connecting === p.provider ? 'Connecting…' : 'Connect'}
                    </button>
                  )
                ) : (
                  <Badge variant="neutral">Coming soon</Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="jp-safe-sending-box">
        <ShieldCheck size={20} />
        <div>
          <h3>Safe sending tips</h3>
          <ul>
            <li>Keep your daily send cap at 15 or below to protect email deliverability.</li>
            <li>Connect a real email account — not a shared or alias inbox.</li>
            <li>Avoid sending on weekends; JobPilot schedules outreach on business days.</li>
            <li>Warm up new connections by starting with 5 sends per day for the first week.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
