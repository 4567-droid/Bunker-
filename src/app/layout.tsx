import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Jost } from 'next/font/google';
import { headers } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { currentBusiness } from '@/lib/business';
import './globals.css';

const jost = Jost({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-jost', display: 'swap' });
// Letras con serifa del estilo "natural" (títulos y marca)
const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-serif', display: 'swap' });

async function safeBusiness() {
  try {
    return await currentBusiness();
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const biz = await safeBusiness();
  const name = biz?.name ?? 'Turnos';
  const own = biz?.slug === 'bunker';
  // Cada negocio con su logo; si todavía no cargó uno, un ícono neutro (no el de Bunker)
  const icon = biz?.logo_url ?? '/brand/turnos-favicon-32.png';
  const appleIcon = biz?.logo_url ?? '/brand/turnos-apple-icon.png';
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000').split(',')[0].trim();
  const proto = (h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0].trim();
  const where = biz?.city ? ` (${biz.city.replace(/^[A-Z]\d{4}\s*/, '')})` : '';
  const description = `Sacá tu turno en ${name}${where}: elegí servicio, horario y barbero. Tarjeta de fidelidad y ${biz?.referral_percent ?? 20}% para vos y un amigo.`;
  const image = own ? '/brand/og-bunker.png' : biz?.logo_url;
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: { default: `${name} · Turnos online`, template: `%s · ${name}` },
    description,
    applicationName: name,
    icons: { icon: own ? '/brand/favicon-32.png' : icon, apple: own ? '/brand/apple-icon.png' : appleIcon },
    appleWebApp: { capable: true, title: name.split(/\s+/)[0], statusBarStyle: 'black-translucent' },
    openGraph: {
      type: 'website',
      locale: 'es_AR',
      siteName: name,
      title: `${name} · Sacá tu turno online`,
      description,
      images: image ? [{ url: image, width: own ? 1200 : undefined, height: own ? 630 : undefined, alt: name }] : [],
    },
    twitter: { card: own ? 'summary_large_image' : 'summary', title: name, description, images: image ? [image] : [] },
  };
}

export const viewport: Viewport = {
  themeColor: '#121211',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const biz = await safeBusiness();
  return (
    <html
      lang="es-AR"
      data-theme={biz?.theme === 'natural' ? 'natural' : 'clasico'}
      className={`${jost.variable} ${serif.variable}`}
      style={{ '--accent': biz?.accent ?? '#F5C400' } as CSSProperties}
    >
      <body className="min-h-dvh bg-bg">{children}</body>
    </html>
  );
}
