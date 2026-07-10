import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import HistoryClient from '@/components/HistoryClient';

export const dynamic = 'force-dynamic';

export default async function StaffHistoryPage() {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <HistoryClient baseHref="/staff/customers" role={auth.role} />
    </div>
  );
}
