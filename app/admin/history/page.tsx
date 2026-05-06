import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import HistoryClient from '@/components/HistoryClient';

export const dynamic = 'force-dynamic';

export default async function AdminHistoryPage() {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <HistoryClient baseHref="/admin/customers" role={auth.role} />
    </div>
  );
}
