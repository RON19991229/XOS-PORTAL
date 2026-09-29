import { requireAuth } from '@/lib/auth';
import ReportsClient from './ReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <ReportsClient />
    </div>
  );
}
