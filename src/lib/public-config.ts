import 'server-only';
import { activeBarbers, activeLocations, activeServices, barberLocation, bizNow, type ProductRow } from './booking';
import { publicBusiness, type Business } from './business';
import { tenantTx } from './db';

export async function getPublicConfig(biz: Business) {
  return tenantTx(biz.id, async (tx) => {
    const [services, barbers, locations, products] = await Promise.all([
      activeServices(tx, biz.id),
      activeBarbers(tx, biz.id),
      activeLocations(tx, biz.id),
      tx<(ProductRow & { image_url: string | null })[]>`select id, name, description, price, image_url, active, sort from products
                       where business_id = ${biz.id} and active order by sort, name`,
    ]);
    return {
      business: publicBusiness(biz),
      today: bizNow(biz).day,
      services: services.map((s) => ({ id: s.id, name: s.name, duration: s.duration_min, price: s.price })),
      barbers: barbers.map((b) => ({ id: b.id, name: b.name, instagram: b.instagram, photoUrl: b.photo_url, locationId: barberLocation(b, locations) })),
      // Sucursales: con dos o más, el cliente elige primero dónde (ver turno/page.tsx)
      locations: locations.map((l) => ({ id: l.id, name: l.name, address: l.address, mapsUrl: l.maps_url })),
      products: products.map((p) => ({ id: p.id, name: p.name, description: p.description, price: p.price, imageUrl: p.image_url })),
      realtime: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
        : null,
    };
  });
}
export type PublicConfig = Awaited<ReturnType<typeof getPublicConfig>>;
