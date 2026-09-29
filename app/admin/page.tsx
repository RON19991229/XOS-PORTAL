import { requireAuth } from '@/lib/auth';
import TodayList from '@/components/TodayList';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <TodayList baseHref="/admin/customers" role={auth.role} />
    </div>
  );
}
