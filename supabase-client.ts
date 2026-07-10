import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import TodayList from '@/components/TodayList';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <TodayList baseHref="/staff/customers" role={auth.role} />
    </div>
  );
}
