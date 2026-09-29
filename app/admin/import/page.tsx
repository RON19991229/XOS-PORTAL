import { requireAuth } from '@/lib/auth';
import ImportClient from '@/components/ImportClient';

export const dynamic = 'force-dynamic';

export default async function AdminImportPage() {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <ImportClient userName={auth.displayName} />
    </div>
  );
}
