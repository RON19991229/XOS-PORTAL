import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import ReportsClient from './ReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <ReportsClient />
    </div>
  );
}
