import { requireAuth } from '@/lib/auth';
import AuditClient from './AuditClient';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <AuditClient />
    </div>
  );
}
