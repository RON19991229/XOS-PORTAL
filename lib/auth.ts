// v2.19.0 — auth lookup is memoised per request with React cache(), so the
// dashboard layout (which renders the nav shell) and the page (which enforces
// its own role list) share ONE getUser() + ONE app_users query instead of
// paying for both twice on every navigation.
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase-server';

type Role = 'staff' | 'admin';

const getAuthContext = cache(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, appUser: null, error: null };

  const { data: appUser, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return { supabase, user, appUser, error };
});

export async function requireAuth(allowedRoles: Role[]) {
  const { supabase, user, appUser, error } = await getAuthContext();

  if (!user) {
    redirect('/login');
  }

  if (error || !appUser) {
    // User exists in auth but not in app_users — sign them out
    await supabase.auth.signOut();
    redirect('/login?error=no_role');
  }

  // Role check
  if (!allowedRoles.includes(appUser.role)) {
    // Wrong role: send them to their actual dashboard
    if (appUser.role === 'admin') redirect('/admin');
    if (appUser.role === 'staff') redirect('/staff');
    redirect('/login');
  }

  return {
    userId: user.id,
    email: user.email!,
    role: appUser.role as Role,
    displayName: appUser.display_name || user.email!,
  };
}
