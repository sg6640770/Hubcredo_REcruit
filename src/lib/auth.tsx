import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { JpProfile } from '@/types/db';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: JpProfile | null;
  loading: boolean;
  isCandidate: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<JpProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('jp_profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    setProfile(data as JpProfile | null);
    return data as JpProfile | null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const formatAuthError = (message: string) => {
    const m = message.toLowerCase();
    if (m.includes('invalid api key')) return 'Authentication service rejected the request. Please contact support.';
    if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the authentication service. Check your connection and try again.';
    if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
    if (m.includes('user already registered')) return 'An account with this email already exists.';
    return message;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { app: 'jobpilot', full_name: fullName },
          emailRedirectTo: `${window.location.origin}/onboarding`,
        },
      });
      if (error) return { error: formatAuthError(error.message) };
      if (data.user) {
        await loadProfile(data.user.id);
      }
      return { error: null };
    } catch {
      return { error: 'We could not reach the authentication service. Try again in a moment.' };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: formatAuthError(error.message) };
      return { error: null };
    } catch {
      return { error: 'We could not reach the authentication service. Try again in a moment.' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        isCandidate: !!profile,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
