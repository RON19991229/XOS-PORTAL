'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import BrandMark from '@/components/BrandMark';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Show error from URL param
  const urlError = searchParams.get('error');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    // Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setError('Login failed');
      return;
    }

    // Look up role
    const { data: appUser, error: roleErr } = await supabase
      .from('app_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (roleErr || !appUser) {
      setLoading(false);
      await supabase.auth.signOut();
      setError('Your account has no role assigned. Please contact admin.');
      return;
    }

    // Hard navigation to ensure server-side auth picks up the new session
    if (appUser.role === 'admin') {
      window.location.href = '/admin';
    } else {
      window.location.href = '/staff';
    }
  };

  return (
    <main className="min-h-screen flex flex-col bg-ink">
      <header className="px-5 py-4 border-b border-ink-line">
        <BrandMark size="sm" />
      </header>

      <section className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <p className="font-mono text-[10px] tracking-[0.3em] text-accent mb-3">
              // STAFF & ADMIN
            </p>
            <h1 className="font-display text-5xl tracking-tighter mb-3">
              SIGN IN
            </h1>
            <div className="h-1 w-16 bg-accent" />
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="field-label">EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="input-field"
              />
            </div>

            <div>
              <label className="field-label">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-field"
              />
            </div>

            {(error || urlError) && (
              <div className="bg-danger text-bone px-4 py-3 font-display text-sm tracking-wider">
                {error || (urlError === 'no_role' ? 'Your account has no role.' : 'Login error')}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'SIGNING IN...' : 'SIGN IN →'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink" />}>
      <LoginForm />
    </Suspense>
  );
}
