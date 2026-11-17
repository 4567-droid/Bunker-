import type { Metadata } from 'next';
import { BarberPanel } from '@/components/panels/barber-panel';
import { bizNow } from '@/lib/booking';
import { currentBusiness } from '@/lib/business';
import { getPublicConfig } from '@/lib/public-config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Panel del barbero', robots: { index: false } };

export default async function BarberoPage() {
  const biz = await currentBusiness();
  const config = await getPublicConfig(biz);
  return <BarberPanel brand={biz.name} services={config.services} today={bizNow(biz).day} />;
}
