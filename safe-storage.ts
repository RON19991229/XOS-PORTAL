import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import CustomerList from '@/components/CustomerList';

export const dynamic = 'force-dynamic';

export default async function StaffCustomersPage() {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <CustomerList baseHref="/staff/customers" role={auth.role} />
    </div>
  );
}
