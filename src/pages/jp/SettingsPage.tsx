import { useEffect, useState } from 'react';
import { User, Sliders, CreditCard, Lock, LogOut, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { TagInput, LoadingSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import type { JpCreditTransaction, JpCreditActionCost } from '@/types/db';

type Tab = 'profile' | 'preferences' | 'billing' | 'account';

const CREDIT_PACKS = [
  { id: 'starter', credits: 100, price: '$19' },
  { id: 'pro', credits: 500, price: '$79' },
  { id: 'unlimited', credits: 2000, price: '$249' },
];

export default function SettingsPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('profile');
  const [transactions, setTransactions] = useState<JpCreditTransaction[]>([]);
  const [costs, setCosts] = useState<JpCreditActionCost[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [industry, setIndustry] = useState('');

  // Preferences
  const [dailyCap, setDailyCap] = useState(15);
  const [targetLocations, setTargetLocations] = useState<string[]>([]);
  const [dealbreakers, setDealbreakers] = useState<string[]>([]);

  // Account
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setHeadline(profile.headline ?? '');
    setLocation(profile.location ?? '');
    setCurrentRole(profile.current_job_title ?? '');
    setTargetRole(profile.target_role ?? '');
    setIndustry(profile.target_industry ?? '');
    setDailyCap(profile.daily_send_cap);
    setTargetLocations(profile.target_locations ?? []);
    setDealbreakers(profile.dealbreakers ?? []);
    (async () => {
      const [t, c] = await Promise.all([
        supabase.from('jp_credit_transactions').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('jp_credit_action_costs').select('*').order('credits_cost', { ascending: true }),
      ]);
      setTransactions((t.data as JpCreditTransaction[]) ?? []);
      setCosts((c.data as JpCreditActionCost[]) ?? []);
      setLoading(false);
    })();
  }, [profile]);

  const saveProfile = async () => {
    await supabase.from('jp_profiles').update({
      full_name: fullName, phone: phone || null, headline: headline || null,
      location: location || null, current_job_title: currentRole || null,
      target_role: targetRole || null, target_industry: industry || null,
    }).eq('id', profile!.id);
    await refreshProfile();
    toast.show('Profile saved.', 'success');
  };

  const savePrefs = async () => {
    await supabase.from('jp_profiles').update({
      daily_send_cap: dailyCap, target_locations: targetLocations, dealbreakers,
    }).eq('id', profile!.id);
    await refreshProfile();
    toast.show('Preferences saved.', 'success');
  };

  const topUp = async (packId: string) => {
    try {
      const { url } = await api.checkout(packId);
      window.location.href = url;
    } catch {
      toast.show('Could not start checkout.', 'error');
    }
  };

  const updatePassword = async () => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { toast.show('Could not update password.', 'error'); return; }
    setNewPassword('');
    toast.show('Password updated.', 'success');
  };

  if (loading) return <div className="jp-page-header"><h1>Settings</h1><LoadingSkeleton className="jp-card-skel" /></div>;

  return (
    <div>
      <div className="jp-page-header"><div><h1>Settings & Billing</h1><p>Manage your account, preferences, and credits</p></div></div>

      <div className="jp-settings-tabs">
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}><User size={16} /> Profile</button>
        <button className={tab === 'preferences' ? 'active' : ''} onClick={() => setTab('preferences')}><Sliders size={16} /> Preferences</button>
        <button className={tab === 'billing' ? 'active' : ''} onClick={() => setTab('billing')}><CreditCard size={16} /> Billing & Credits</button>
        <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}><Lock size={16} /> Account</button>
      </div>

      {tab === 'profile' && (
        <div className="jp-settings-card">
          <div className="jp-form">
            <div className="jp-form-row">
              <label><span>Full name</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
              <label><span>Phone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            </div>
            <label><span>Headline</span><input value={headline} onChange={(e) => setHeadline(e.target.value)} /></label>
            <label><span>Location</span><input value={location} onChange={(e) => setLocation(e.target.value)} /></label>
            <div className="jp-form-row">
              <label><span>Current role</span><input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} /></label>
              <label><span>Target role</span><input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} /></label>
            </div>
            <label><span>Industry</span><input value={industry} onChange={(e) => setIndustry(e.target.value)} /></label>
            <button className="jp-btn-primary" onClick={saveProfile}>Save profile</button>
          </div>
        </div>
      )}

      {tab === 'preferences' && (
        <div className="jp-settings-card">
          <div className="jp-form">
            <label><span>Daily send cap: {dailyCap}</span>
              <input type="range" min={5} max={30} value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} />
              <small>Recommended: 15. Higher values may hurt email deliverability.</small>
            </label>
            <label><span>Target locations</span><TagInput values={targetLocations} onChange={setTargetLocations} /></label>
            <label><span>Dealbreakers</span><TagInput values={dealbreakers} onChange={setDealbreakers} /></label>
            <button className="jp-btn-primary" onClick={savePrefs}>Save preferences</button>
          </div>
        </div>
      )}

      {tab === 'billing' && (
        <div className="jp-settings-billing">
          <div className="jp-credits-summary">
            <div className="jp-credits-balance">
              <Sparkles size={20} />
              <div><span className="jp-credits-value">{profile?.credit_balance ?? 0}</span><span>credits remaining</span></div>
            </div>
            <div className="jp-plan-info">
              <span>Plan: <strong>{profile?.plan_tier}</strong></span>
              <span>Status: <strong>{profile?.plan_status}</strong></span>
            </div>
          </div>

          <h3 className="jp-subhead">Top up credits</h3>
          <div className="jp-credit-packs">
            {CREDIT_PACKS.map((p) => (
              <div key={p.id} className="jp-credit-pack">
                <strong>{p.credits} credits</strong>
                <span>{p.price}</span>
                <button className="jp-btn-primary jp-btn-sm" onClick={() => topUp(p.id)}>Top up</button>
              </div>
            ))}
          </div>

          <h3 className="jp-subhead">Credit costs per action</h3>
          <div className="jp-costs-table">
            {costs.map((c) => (
              <div key={c.action_type} className="jp-cost-row">
                <span>{c.description}</span>
                <strong>{c.credits_cost}</strong>
              </div>
            ))}
          </div>

          <h3 className="jp-subhead">Recent transactions</h3>
          <div className="jp-tx-list">
            {transactions.length === 0 && <p className="jp-muted">No transactions yet.</p>}
            {transactions.map((t) => (
              <div key={t.id} className="jp-tx-row">
                <span>{t.description || t.type.replace('_', ' ')}</span>
                <span className={t.amount >= 0 ? 'jp-tx-positive' : 'jp-tx-negative'}>{t.amount > 0 ? '+' : ''}{t.amount}</span>
                <small>{new Date(t.created_at).toLocaleDateString()}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'account' && (
        <div className="jp-settings-card">
          <div className="jp-form">
            <label><span>Change password</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" minLength={6} /></label>
            <button className="jp-btn-primary" onClick={updatePassword} disabled={!newPassword}>Update password</button>
            <hr className="jp-divider" />
            <button className="jp-btn-ghost" onClick={signOut}><LogOut size={16} /> Sign out</button>
            <p className="jp-muted jp-account-note">To delete your account, please contact support.</p>
          </div>
        </div>
      )}
    </div>
  );
}
