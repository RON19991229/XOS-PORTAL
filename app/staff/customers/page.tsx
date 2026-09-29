import { requireAuth } from '@/lib/auth';
import CustomerList from '@/components/CustomerList';

export const dynamic = 'force-dynamic';

export default async function StaffCustomersPage() {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <div className="min-h-screen">
      <CustomerList baseHref="/staff/customers" role={auth.role} />
    </div>
  );
}
