// v2.19.0 — shared admin shell. The layout persists across client-side
// navigation, so the nav no longer remounts (and re-queries the complaint
// badge) on every page change. Each page still calls requireAuth() itself —
// layouts don't re-run on client navigation, so the page-level check is what
// actually guards each route.
// v2.20.0 — CheckinAlerts (new-check-in popup) lives here so it fires on
// every admin page, not just TODAY.
// v2.22.0 — DashboardShell (light left-rail shell + privacy mode) replaces
// the old black DashboardNav.
import { requireAuth } from '@/lib/auth';
import DashboardShell from '@/components/dashboard/DashboardShell';
import CheckinAlerts from '@/components/CheckinAlerts';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth(['admin']);
  return (
    <>
      <DashboardShell role={auth.role} userName={auth.displayName}>
        {children}
      </DashboardShell>
      <CheckinAlerts todayHref="/admin" customersHref="/admin/customers" />
    </>
  );
}
