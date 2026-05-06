import { requireAuth } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';
import ImportClient from '@/components/ImportClient';

export const dynamic = 'force-dynamic';

export default async function AdminImportPage() {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <DashboardNav role={auth.role} userName={auth.displayName} />
      <ImportClient userName={auth.displayName} />
    </div>
  );
}
