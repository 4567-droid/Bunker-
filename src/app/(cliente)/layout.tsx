import type { ReactNode } from 'react';
import { ClientApp, ClientNav } from '@/components/client/app-context';
import { WaBubble } from '@/components/client/wa-bubble';
import { currentBusiness } from '@/lib/business';
import { getPublicConfig, type PublicConfig } from '@/lib/public-config';
import { instagramHandle } from '@/lib/format';

export const dynamic = 'force-dynamic';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Datos del local para Google (dirección, teléfono, horarios, Instagram) */
function structuredData(config: PublicConfig) {
  const b = config.business;
  const ig = instagramHandle(b.instagram);
  const data = {
    '@context': 'https://schema.org',
    '@type': b.kind === 'Barbería' ? 'BarberShop' : 'LocalBusiness',
    name: b.name,
    ...(b.address || b.city
      ? { address: { '@type': 'PostalAddress', streetAddress: b.address ?? undefined, addressLocality: b.city ?? undefined, addressCountry: 'AR' } }
      : {}),
    ...(b.whatsapp ? { telephone: `+${b.whatsapp}` } : {}),
    ...(ig ? { sameAs: [`https://www.instagram.com/${ig}/`] } : {}),
    openingHoursSpecification: Object.entries(b.hours ?? {}).flatMap(([d, ranges]) =>
      (ranges ?? []).map(([opens, closes]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DOW[Number(d)], opens, closes })),
    ),
    priceRange: '$$',
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default async function ClienteLayout({ children }: { children: ReactNode }) {
  const config = await getPublicConfig(await currentBusiness());
  return (
    <ClientApp config={config}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData(config) }} />
      <div className="flex min-h-dvh flex-col bg-bg text-ink">
        <div className="mx-auto w-full max-w-[480px] flex-1">{children}</div>
        <WaBubble />
        <ClientNav />
      </div>
    </ClientApp>
  );
}
