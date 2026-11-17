import type { MetadataRoute } from 'next';
import { currentBusiness, type Business } from '@/lib/business';

// "Agregar a la pantalla de inicio": la web se abre como una app, sin barra del navegador.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let biz: Business | null = null;
  try {
    biz = await currentBusiness();
  } catch {
    biz = null;
  }
  const name = biz?.name ?? 'Turnos online';
  const own = !biz || biz.slug === 'bunker';
  const icons: MetadataRoute.Manifest['icons'] = own
    ? [
        { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ]
    : biz?.logo_url
      ? [{ src: biz.logo_url, sizes: 'any' }]
      : [
          { src: '/brand/turnos-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/brand/turnos-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ];
  return {
    name,
    short_name: name.split(/\s+/)[0],
    description: `Turnos online en ${name}`,
    lang: 'es-AR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0E0E0D',
    theme_color: '#121211',
    icons,
  };
}
