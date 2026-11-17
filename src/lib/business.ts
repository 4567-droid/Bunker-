import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { db } from './db';
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
  loyalty_reward: 'free' | 'discount' | 'gift';
  loyalty_reward_pct: number;
  loyalty_reward_text: string | null;
  double_stamp_days: number;
  referral_percent: number;
  monthly_goal: number;
}

export const BIZ_COOKIE = 'bk_biz';
export const BIZ_HEADER = 'x-bk-biz';

// Memoria corta del negocio. Va en globalThis para que la compartan la web y la API (Next arma
// paquetes separados): así, cuando el dueño guarda Ajustes, se borra para todos al mismo tiempo.
declare global {
  var __bunkerBizMemo: Map<string, { at: number; biz: Business }> | undefined;
}
const memo = (globalThis.__bunkerBizMemo ??= new Map<string, { at: number; biz: Business }>());
const TTL = 10_000;

export function forgetBusinessCache(): void {
  memo.clear();
}

/**
 * Qué negocio se muestra:
 * 1) el que tiene cargado este dominio (bunkerbarberclub.com.ar)
 * 2) si el dominio no es de nadie (ej. *.vercel.app o localhost): el elegido con ?negocio=slug
 * 3) DEFAULT_BUSINESS_SLUG, o el primero que se cargó
 * Todo en una sola consulta, y se recuerda 10 segundos (cada ida a la base suma demora).
 */
export const currentBusiness = cache(async (): Promise<Business> => {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  const raw = h.get(BIZ_HEADER) ?? (await cookies()).get(BIZ_COOKIE)?.value ?? '';
  const override = /^[a-z0-9-]{2,40}$/.test(raw) ? raw : '';
  const def = process.env.DEFAULT_BUSINESS_SLUG ?? '';
  const key = `${host}|${override}|${def}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.biz;
  const rows = await db()<(Business & { pick: number })[]>`
    select b.*, case when ${host} <> '' and b.domain in (${host}, ${'www.' + host}) then 0
                     when b.slug = ${override} then 1
                     when b.slug = ${def} then 2
                     else 3 end as pick
    from businesses b
    where (${host} <> '' and b.domain in (${host}, ${'www.' + host}))
       or b.slug in (${override}, ${def})
       or b.id = (select id from businesses order by (status = 'demo'), created_at limit 1)
    order by pick, (b.status = 'demo'), b.created_at
    limit 1`;
  if (!rows[0]) fail(503, 'Todavía no hay ningún negocio cargado. En tu PC: `npm run db:seed`. En Vercel: Redeploy.');
  const { pick: _pick, ...biz } = rows[0];
  void _pick;
  memo.set(key, { at: Date.now(), biz });
  return biz;
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
    loyaltyReward: b.loyalty_reward ?? 'free',
    loyaltyRewardPct: b.loyalty_reward_pct ?? 50,
    loyaltyRewardText: b.loyalty_reward_text ?? null,
    doubleStampDays: b.double_stamp_days,
    referralPercent: b.referral_percent,
  };
}
export type PublicBusiness = ReturnType<typeof publicBusiness>;

/** Premio de la tarjeta del negocio (para prizeInfo) */
export function bizPrize(b: Business) {
  return { kind: b.loyalty_reward ?? 'free', pct: b.loyalty_reward_pct ?? 50, text: b.loyalty_reward_text ?? null, goal: b.loyalty_goal };
}
