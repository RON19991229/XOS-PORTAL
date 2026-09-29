// v2.19.0 — shared staff shell (see app/admin/layout.tsx). Staff pages stay
// read-only; each page still enforces requireAuth(['staff', 'admin']).
// v2.20.0 — CheckinAlerts popup on every staff page. Acknowledging an alert
// is local UI only (no DB write), so staff remain read-only.
// v2.22.0 — DashboardShell (light left-rail shell + privacy mode).
import { requireAuth } from '@/lib/auth';
import DashboardShell from '@/components/dashboard/DashboardShell';
import CheckinAlerts from '@/components/CheckinAlerts';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <>
      <DashboardShell role={auth.role} userName={auth.displayName}>
        {children}
      </DashboardShell>
      <CheckinAlerts todayHref="/staff" customersHref="/staff/customers" />
    </>
  );
}
