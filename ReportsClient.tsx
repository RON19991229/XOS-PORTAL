import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import NewCustomerClient from './NewCustomerClient';

export const dynamic = 'force-dynamic';

export default async function NewCustomerPage() {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <NewCustomerClient userId={auth.userId} userName={auth.displayName} />
    </div>
  );
}
