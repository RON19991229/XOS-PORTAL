// v2.19.0 — shared staff shell (see app/admin/layout.tsx). Staff pages stay
// read-only; each page still enforces requireAuth(['staff', 'admin']).
import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <>
      <DashboardNav role={auth.role} userName={auth.displayName} />
      {children}
    </>
  );
}
