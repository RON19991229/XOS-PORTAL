import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import CustomerDetail from '@/components/CustomerDetail';

export const dynamic = 'force-dynamic';

export default async function AdminCustomerDetail({
  params,
}: {
  params: { id: string };
}) {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <CustomerDetail
        customerId={params.id}
        role={auth.role}
        userId={auth.userId}
        userName={auth.displayName}
        baseHref="/admin/customers"
      />
    </div>
  );
}
