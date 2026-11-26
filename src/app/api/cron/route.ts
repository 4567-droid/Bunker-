import { db } from '@/lib/db';

// Aviso diario de Vercel (vercel.json → "crons"): hace una consulta chica a la base para que Supabase no la
// ponga en pausa. En el plan gratis, Supabase pausa la base después de 7 días sin uso y la web deja de andar.
// Solo lee cuántos negocios hay: no devuelve datos de nadie.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [row] = await db()<{ n: number }[]>`select count(*)::int as n from businesses`;
    return Response.json({ ok: true, negocios: row.n, hora: new Date().toISOString() });
  } catch (e) {
    console.error('cron: la base no respondió', e);
    return Response.json({ ok: false, error: 'La base de datos no responde.' }, { status: 503 });
  }
}
