import type { ReactNode } from 'react';
import { ClientApp, ClientNav } from '@/components/client/app-context';
import { currentBusiness } from '@/lib/business';
import { getPublicConfig } from '@/lib/public-config';

export const dynamic = 'force-dynamic';

export default async function ClienteLayout({ children }: { children: ReactNode }) {
  const config = await getPublicConfig(await currentBusiness());
  return (
    <ClientApp config={config}>
      <div className="flex min-h-dvh flex-col bg-bg text-ink">
        <div className="mx-auto w-full max-w-[480px] flex-1">{children}</div>
        <ClientNav />
      </div>
    </ClientApp>
  );
}
