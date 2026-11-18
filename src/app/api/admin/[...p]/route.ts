import { endSessionsFor, hashPassword, normUser } from '@/lib/auth';
import { asTheme, forgetBusinessCache, type Theme } from '@/lib/business';
import { adminTx } from '@/lib/db';
import { fail, json, notFound, readBody, route, str, uuid } from '@/lib/http';
import { requireStaff } from '@/lib/session';

export const dynamic = 'force-dynamic';

const STATUSES = ['activo', 'demo', 'por_armar', 'pausado'];
const DEFAULT_HOURS = {
  0: [],
  1: [['09:00', '13:00'], ['16:00', '20:00']],
  2: [['09:00', '13:00'], ['16:00', '20:00']],
  3: [['09:00', '13:00'], ['16:00', '20:00']],
  4: [['09:00', '13:00'], ['16:00', '20:00']],
  5: [['09:00', '13:00'], ['16:00', '20:00']],
  6: [['09:00', '13:00']],
};

const DEFAULT_SERVICES = [
  { name: 'Corte', duration: 30, price: 15000 },
  { name: 'Corte + barba', duration: 50, price: 18000 },
  { name: 'Barba sola', duration: 20, price: 10000 },
];

function cleanDomain(v: string): string | null {
  const d = v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!d) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) fail(400, 'El dominio no es válido (ej: bunkerbarberclub.com.ar).');
  return d;
}

/** Estilo de la web (clasico, moderno o natural); uno que no existe vuelve a clásico */
const cleanTheme = (v: unknown): Theme => asTheme(v);

function cleanAccent(v: string): string {
  const a = v.trim() || '#F5C400';
  if (!/^#[0-9a-fA-F]{6}$/.test(a)) fail(400, 'El color tiene que ser tipo #F5C400.');
  return a.toUpperCase();
}

export const GET = route(async (_req, [action]) => {
  await requireStaff(null, ['admin']);
  if (action !== 'businesses') notFound();
  return json(
    await adminTx(async (tx) => {
      const businesses = await tx<{ id: string; slug: string; name: string; kind: string; domain: string | null; status: string; accent: string; logo_url: string | null; hero_url: string | null; theme: string }[]>`
        select id, slug, name, kind, domain, status, accent, logo_url, hero_url, theme from businesses order by created_at`;
      const staff = await tx<{ id: string; business_id: string; role: string; name: string; username: string; active: boolean }[]>`
        select id, business_id, role, name, username, active from staff where role <> 'admin' order by role desc, sort, name`;
      const counts = await tx<{ business_id: string; clients: number }[]>`
        select business_id, count(*)::int as clients from clients group by business_id`;
      return {
        businesses: businesses.map((b) => ({
          id: b.id,
          slug: b.slug,
          name: b.name,
          kind: b.kind,
          domain: b.domain,
          status: b.status,
          accent: b.accent,
          logoUrl: b.logo_url,
          heroUrl: b.hero_url,
          theme: b.theme,
          clients: counts.find((c) => c.business_id === b.id)?.clients ?? 0,
          owners: staff.filter((s) => s.business_id === b.id && s.role === 'owner').map((s) => ({ id: s.id, name: s.name, username: s.username, active: s.active })),
          staff: staff.filter((s) => s.business_id === b.id && s.role === 'barber').map((s) => ({ id: s.id, name: s.name, active: s.active })),
        })),
        totals: {
          businesses: businesses.length,
          owners: staff.filter((s) => s.role === 'owner').length,
          staff: staff.filter((s) => s.role === 'barber').length,
        },
      };
    }),
  );
});

export const POST = route(async (req, path) => {
  await requireStaff(null, ['admin']);
  const body = await readBody(req);
  const key = path.join('/');

  if (key === 'business') {
    const name = str(body, 'name', { min: 2, max: 80, label: 'el nombre' });
    const slug = str(body, 'slug', { min: 2, max: 40, label: 'el identificador' }).toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) fail(400, 'El identificador va en minúsculas, sin espacios (ej: bunker).');
    const ownerUser = normUser(str(body, 'ownerUser', { min: 3, max: 40, label: 'el usuario del dueño' }));
    const ownerPassword = str(body, 'ownerPassword', { min: 8, max: 100, label: 'la contraseña del dueño' });
    const hash = await hashPassword(ownerPassword);
    await adminTx(async (tx) => {
      const [b] = await tx<{ id: string }[]>`
        insert into businesses (slug, name, kind, domain, status, accent, logo_url, hours, theme)
        values (${slug}, ${name}, ${str(body, 'kind', { optional: true, max: 40 }) || 'Barbería'},
                ${cleanDomain(str(body, 'domain', { optional: true, max: 120 }))},
                ${STATUSES.includes(String(body.status)) ? String(body.status) : 'por_armar'},
                ${cleanAccent(str(body, 'accent', { optional: true, max: 7 }))},
                ${str(body, 'logoUrl', { optional: true, max: 400 }) || null}, ${tx.json(DEFAULT_HOURS)},
                ${cleanTheme(body.theme)})
        returning id`;
      await tx`insert into staff (business_id, role, name, username, password_hash)
               values (${b.id}, 'owner', ${str(body, 'ownerName', { optional: true, max: 60 }) || 'Dueño'}, ${ownerUser}, ${hash})`;
      // Arranca con servicios de ejemplo para que la web ya funcione; el dueño los cambia en Ajustes
      const kind = str(body, 'kind', { optional: true, max: 40 }) || 'Barbería';
      const services = /barber/i.test(kind) ? DEFAULT_SERVICES : [{ name: 'Turno', duration: 30, price: 10000 }];
      for (const [i, sv] of services.entries()) {
        await tx`insert into services (business_id, name, duration_min, price, sort)
                 values (${b.id}, ${sv.name}, ${sv.duration}, ${sv.price}, ${i})`;
      }
    });
    forgetBusinessCache();
    return json({ ok: true }, 201);
  }

  if (key === 'business/update') {
    const id = uuid(body.id);
    const r = await adminTx((tx) => tx`
      update businesses set
        name = ${str(body, 'name', { min: 2, max: 80, label: 'el nombre' })},
        kind = ${str(body, 'kind', { optional: true, max: 40 }) || 'Barbería'},
        domain = ${cleanDomain(str(body, 'domain', { optional: true, max: 120 }))},
        status = ${STATUSES.includes(String(body.status)) ? String(body.status) : 'activo'},
        accent = ${cleanAccent(str(body, 'accent', { optional: true, max: 7 }))},
        logo_url = ${str(body, 'logoUrl', { optional: true, max: 400 }) || null},
        hero_url = ${str(body, 'heroUrl', { optional: true, max: 400 }) || null},
        theme = ${body.theme === undefined ? tx`theme` : cleanTheme(body.theme)}
      where id = ${id}`);
    if (!r.count) fail(404, 'Negocio no encontrado.');
    forgetBusinessCache();
    return json({ ok: true });
  }

  if (key === 'demo') {
    // Crea una muestra o propuesta (tabla sample_businesses; sin slug, la de siempre), o con reset la deja como
    // nueva (turnos desde hoy). Conserva su dirección y su marca.
    const reset = body.reset === true;
    const slug = typeof body.slug === 'string' && /^[a-z0-9-]{2,40}$/.test(body.slug) ? body.slug : 'demo';
    const [row] = await adminTx(async (tx) => {
      const [known] = await tx`select 1 from sample_businesses where slug = ${slug}`;
      if (!known) fail(404, 'No hay una muestra con ese nombre.');
      return tx<{ id: string }[]>`select sample_business(${slug}, ${reset}) as id`;
    });
    forgetBusinessCache();
    return json({ ok: true, id: row.id });
  }

  if (key === 'owner') {
    const businessId = uuid(body.businessId);
    const username = normUser(str(body, 'username', { min: 3, max: 40, label: 'el usuario' }));
    const hash = await hashPassword(str(body, 'password', { min: 8, max: 100, label: 'la contraseña' }));
    const name = str(body, 'name', { optional: true, max: 60 }) || 'Dueño';
    const id = await adminTx(async (tx) => {
      const [existing] = await tx<{ id: string }[]>`
        select id from staff where business_id = ${businessId} and role = 'owner' and lower(username) = ${username}`;
      if (existing) {
        await tx`update staff set password_hash = ${hash}, name = ${name}, active = true where id = ${existing.id}`;
        return existing.id;
      }
      const [s] = await tx<{ id: string }[]>`
        insert into staff (business_id, role, name, username, password_hash)
        values (${businessId}, 'owner', ${name}, ${username}, ${hash}) returning id`;
      return s.id;
    });
    await endSessionsFor({ staffId: id });
    return json({ ok: true });
  }
  notFound();
});
