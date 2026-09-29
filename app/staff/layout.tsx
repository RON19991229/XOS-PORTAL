// v2.19.0 — shared staff shell (see app/admin/layout.tsx). Staff pages stay
// read-only; each page still enforces requireAuth(['staff', 'admin']).
// v2.20.0 — CheckinAlerts popup on every staff page. Acknowledging an alert
// is local UI only (no DB write), so staff remain read-only.
import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import CheckinAlerts from '@/components/CheckinAlerts';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <>
      <DashboardNav role={auth.role} userName={auth.displayName} />
      {children}
      <CheckinAlerts todayHref="/staff" customersHref="/staff/customers" />
    </>
  );
}
