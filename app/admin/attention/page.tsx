import { requireAuth } from '@/lib/auth';
import AttentionClient from '@/components/AttentionClient';

export const dynamic = 'force-dynamic';

export default async function AdminAttentionPage() {
  const auth = await requireAuth(['admin']);
  return (
    <div className="min-h-screen">
      <AttentionClient
        role={auth.role}
        userId={auth.userId}
        userName={auth.displayName}
        baseHref="/admin/customers"
      />
    </div>
  );
}
