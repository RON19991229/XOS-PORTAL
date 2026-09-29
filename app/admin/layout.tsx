// v2.19.0 — shared admin shell. The layout persists across client-side
// navigation, so DashboardNav no longer remounts (and re-queries the
// complaint badge) on every page change. Each page still calls
// requireAuth() itself — layouts don't re-run on client navigation, so the
// page-level check is what actually guards each route.
import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth(['admin']);
  return (
    <>
      <DashboardNav role={auth.role} userName={auth.displayName} />
      {children}
    </>
  );
}
