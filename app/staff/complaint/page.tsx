import { requireAuth } from '@/lib/auth';
import ComplaintClient from '@/components/ComplaintClient';

export const dynamic = 'force-dynamic';

export default async function StaffComplaintPage() {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <div className="min-h-screen">
      <ComplaintClient role={auth.role} userId={auth.userId} userName={auth.displayName} />
    </div>
  );
}
