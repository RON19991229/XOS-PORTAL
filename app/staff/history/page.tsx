import { requireAuth } from '@/lib/auth';
import HistoryClient from '@/components/HistoryClient';

export const dynamic = 'force-dynamic';

export default async function StaffHistoryPage() {
  const auth = await requireAuth(['staff', 'admin']);
  return (
    <div className="min-h-screen">
      <HistoryClient baseHref="/staff/customers" role={auth.role} />
    </div>
  );
}
