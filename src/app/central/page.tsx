import type { Metadata } from 'next';
import { OwnerPanel } from '@/components/panels/owner-panel';
import { currentBusiness } from '@/lib/business';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Central del dueño', robots: { index: false } };

export default async function CentralPage() {
  const biz = await currentBusiness();
  return <OwnerPanel brand={biz.name} />;
}
