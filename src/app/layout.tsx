import type { Metadata, Viewport } from 'next';
import { Jost } from 'next/font/google';
import type { CSSProperties, ReactNode } from 'react';
import { currentBusiness } from '@/lib/business';
import './globals.css';

const jost = Jost({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-jost', display: 'swap' });

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
  const icon = biz?.logo_url ?? '/brand/favicon-32.png';
  return {
    title: { default: `${name} · Turnos online`, template: `%s · ${name}` },
    description: `Sacá tu turno en ${name}: elegí servicio, horario y barbero. Tarjeta de fidelidad y 20% invitando a un amigo.`,
    icons: { icon: biz?.slug === 'bunker' ? '/brand/favicon-32.png' : icon, apple: biz?.slug === 'bunker' ? '/brand/apple-icon.png' : icon },
    openGraph: { title: name, description: 'Turnos online', images: biz?.logo_url ? [biz.logo_url] : [] },
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
    <html lang="es-AR" className={jost.variable} style={{ '--accent': biz?.accent ?? '#F5C400' } as CSSProperties}>
      <body className="min-h-dvh bg-bg">{children}</body>
    </html>
  );
}
