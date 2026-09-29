import { requireAuth } from '@/lib/auth';
import CustomerList from '@/components/CustomerList';

export const dynamic = 'force-dynamic';

export default async function AdminCustomersPage() {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <CustomerList baseHref="/admin/customers" role={auth.role} />
    </div>
  );
}
