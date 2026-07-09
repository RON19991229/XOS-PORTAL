import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import ComplaintClient from '@/components/ComplaintClient';

export const dynamic = 'force-dynamic';

export default async function StaffComplaintPage() {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <ComplaintClient role={auth.role} userId={auth.userId} userName={auth.displayName} />
    </div>
  );
}
