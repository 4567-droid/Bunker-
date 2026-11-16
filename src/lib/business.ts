import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { systemTx } from './db';
import { fail } from './http';
import type { Hours } from './time';

export interface Business {
  id: string;
  slug: string;
  name: string;
  kind: string;
  domain: string | null;
  status: string;
  accent: string;
  logo_url: string | null;
  hero_url: string | null;
  whatsapp: string | null;
  instagram: string | null;
  address: string | null;
  city: string | null;
  maps_url: string | null;
  transfer_alias: string | null;
  mp_link: string | null;
  timezone: string;
  hours: Hours;
  slot_step: number;
  booking_days: number;
  min_advance_min: number;
  cancel_limit_min: number;
  loyalty_goal: number;
  double_stamp_days: number;
  referral_percent: number;
  monthly_goal: number;
}

export const BIZ_COOKIE = 'bk_biz';
export const BIZ_HEADER = 'x-bk-biz';

const memo = new Map<string, { at: number; biz: Business | null }>();
const TTL = 30_000;

async function bySlugOrDomain(kind: 'slug' | 'domain', value: string): Promise<Business | null> {
  const key = `${kind}:${value}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.biz;
  const rows = await systemTx((tx) =>
    kind === 'slug'
      ? tx<Business[]>`select * from businesses where slug = ${value}`
      : tx<Business[]>`select * from businesses where domain = ${value} or domain = ${'www.' + value}`,
  );
  const biz = rows[0] ?? null;
  memo.set(key, { at: Date.now(), biz });
  return biz;
}

export function forgetBusinessCache(): void {
  memo.clear();
}

/**
 * Qué negocio se muestra:
 * 1) el que tiene cargado este dominio (bunkerbarberclub.com.ar)
 * 2) si el dominio no es de nadie (ej. *.vercel.app o localhost): el elegido con ?negocio=slug
 * 3) DEFAULT_BUSINESS_SLUG, o el primero que se cargó
 */
export const currentBusiness = cache(async (): Promise<Business> => {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  if (host) {
    const byDomain = await bySlugOrDomain('domain', host);
    if (byDomain) return byDomain;
  }
  const override = h.get(BIZ_HEADER) ?? (await cookies()).get(BIZ_COOKIE)?.value;
  if (override && /^[a-z0-9-]{2,40}$/.test(override)) {
    const b = await bySlugOrDomain('slug', override);
    if (b) return b;
  }
  const def = process.env.DEFAULT_BUSINESS_SLUG;
  if (def) {
    const b = await bySlugOrDomain('slug', def);
    if (b) return b;
  }
  const rows = await systemTx((tx) => tx<Business[]>`select * from businesses order by created_at limit 1`);
  if (!rows[0]) fail(503, 'Todavía no hay ningún negocio cargado. En tu PC: `npm run db:seed`. En Vercel: Redeploy.');
  return rows[0];
});

/** Lo que cualquiera puede ver del negocio */
export function publicBusiness(b: Business) {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    kind: b.kind,
    accent: b.accent,
    logoUrl: b.logo_url,
    heroUrl: b.hero_url,
    whatsapp: b.whatsapp,
    instagram: b.instagram,
    address: b.address,
    city: b.city,
    mapsUrl: b.maps_url,
    transferAlias: b.transfer_alias,
    mpLink: b.mp_link,
    timezone: b.timezone,
    hours: b.hours,
    slotStep: b.slot_step,
    bookingDays: b.booking_days,
    cancelLimitMin: b.cancel_limit_min,
    loyaltyGoal: b.loyalty_goal,
    doubleStampDays: b.double_stamp_days,
    referralPercent: b.referral_percent,
  };
}
export type PublicBusiness = ReturnType<typeof publicBusiness>;
