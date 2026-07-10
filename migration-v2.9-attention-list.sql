import { redirect } from 'next/navigation';
import { createClient } from './supabase-server';

export async function requireAuth(allowedRoles: ('staff' | 'admin')[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: appUser, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

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
    role: appUser.role as 'staff' | 'admin',
    displayName: appUser.display_name || user.email!,
  };
}
