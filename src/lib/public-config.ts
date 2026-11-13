import 'server-only';
import { activeBarbers, activeServices, bizNow, type ProductRow } from './booking';
import { publicBusiness, type Business } from './business';
import { tenantTx } from './db';

export async function getPublicConfig(biz: Business) {
  return tenantTx(biz.id, async (tx) => {
    const [services, barbers, products] = await Promise.all([
      activeServices(tx, biz.id),
      activeBarbers(tx, biz.id),
      tx<ProductRow[]>`select id, name, description, price, active, sort from products
                       where business_id = ${biz.id} and active order by sort, name`,
    ]);
    return {
      business: publicBusiness(biz),
      today: bizNow(biz).day,
      services: services.map((s) => ({ id: s.id, name: s.name, duration: s.duration_min, price: s.price })),
      barbers: barbers.map((b) => ({ id: b.id, name: b.name, instagram: b.instagram })),
      products: products.map((p) => ({ id: p.id, name: p.name, description: p.description, price: p.price })),
      realtime: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
        : null,
    };
  });
}
export type PublicConfig = Awaited<ReturnType<typeof getPublicConfig>>;
