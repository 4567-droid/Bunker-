import { currentBusiness } from '@/lib/business';
import { tenantTx } from '@/lib/db';
import { UUID_RE } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Fotos subidas desde la Central (portada, productos, barberos).
// Cada foto nueva tiene su propia dirección, así que se puede guardar en caché para siempre.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new Response('No encontrada', { status: 404 });
  const biz = await currentBusiness();
  const [img] = await tenantTx(biz.id, (tx) => tx<{ mime: string; data: Buffer }[]>`
    select mime, data from images where id = ${id} and business_id = ${biz.id}`);
  if (!img) return new Response('No encontrada', { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: {
      'Content-Type': img.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
