import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import AttentionClient from '@/components/AttentionClient';

export const dynamic = 'force-dynamic';

export default async function StaffAttentionPage() {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <AttentionClient
        role={auth.role}
        userId={auth.userId}
        userName={auth.displayName}
        baseHref="/staff/customers"
      />
    </div>
  );
}
