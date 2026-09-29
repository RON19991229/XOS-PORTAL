import { requireAuth } from '@/lib/auth';
import HistoryClient from '@/components/HistoryClient';

export const dynamic = 'force-dynamic';

export default async function AdminHistoryPage() {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <HistoryClient baseHref="/admin/customers" role={auth.role} />
    </div>
  );
}
