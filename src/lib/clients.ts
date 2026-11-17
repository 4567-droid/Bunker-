import 'server-only';
import { createHmac, randomInt } from 'node:crypto';
import type { Tx } from './db';
import { firstName } from './format';
import { fail } from './http';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código para invitar amigos: primer nombre + 3 caracteres, ej. "TOMAS7KQ" */
export async function newReferralCode(tx: Tx, bizId: string, name: string): Promise<string> {
  const base =
    firstName(name)
      .normalize('NFD')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()
      .slice(0, 6) || 'AMIGO';
  for (let i = 0; i < 8; i++) {
    let code = base;
    for (let k = 0; k < 3; k++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
    const [taken] = await tx`select 1 from clients where business_id = ${bizId} and referral_code = ${code}`;
    if (!taken) return code;
  }
  fail(500, 'No se pudo crear el código. Probá de nuevo.');
}

// ---------------------------------------------------------------------
// Invitaciones (20% para cada uno: el amigo nuevo y quien lo invitó)
// ---------------------------------------------------------------------

/**
 * Huella del teléfono de una cuenta borrada. No se guarda el número: un HMAC con una clave que vive
 * solo en el servidor (APP_SECRET en Vercel). Sirve para saber "este teléfono ya fue cliente".
 */
export function phoneHash(bizId: string, phone: string): string {
  return createHmac('sha256', process.env.APP_SECRET || 'turnos-clave-local').update(`${bizId}:${phone}`).digest('hex');
}

export async function rememberFormerClient(tx: Tx, bizId: string, phone: string | null): Promise<void> {
  if (!phone) return;
  await tx`insert into former_clients (business_id, phone_hash) values (${bizId}, ${phoneHash(bizId, phone)})
           on conflict do nothing`;
}

export async function wasClientBefore(tx: Tx, bizId: string, phone: string | null): Promise<boolean> {
  if (!phone) return false;
  const [r] = await tx`select 1 from former_clients where business_id = ${bizId} and phone_hash = ${phoneHash(bizId, phone)}`;
  return !!r;
}

/** "ana 7kq " → "ANA7KQ" */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

export interface Referrer {
  id: string;
  name: string;
  referred_by: string | null;
}

export async function findReferrer(tx: Tx, bizId: string, code: string): Promise<Referrer | null> {
  if (!code) return null;
  const [r] = await tx<Referrer[]>`select id, name, referred_by from clients where business_id = ${bizId} and referral_code = ${code}`;
  return r ?? null;
}

export const BAD_CODE = 'Ese código de invitación no existe. Revisalo (son letras y números, ej: ANA7KQ) o dejalo vacío.';
export const notNew = (bizName: string) => `El descuento de invitación es solo para quien nunca se cortó en ${bizName}.`;

/** Por qué este cliente ya no puede usar un código de invitación (null = puede) */
export async function inviteBlock(
  tx: Tx,
  biz: { id: string; name: string; referral_percent: number },
  c: { id: string; phone: string | null; visits: number; referred_by: string | null },
): Promise<string | null> {
  if (biz.referral_percent <= 0) return 'Ahora no hay descuento por invitación.';
  if (c.referred_by) return 'Ya usaste un código de invitación.';
  const [w] = await tx`select 1 from rewards where client_id = ${c.id} and kind = 'welcome'`;
  if (w) return 'Ya usaste un código de invitación.';
  if (c.visits > 0) return notNew(biz.name);
  const [done] = await tx`select 1 from appointments where client_id = ${c.id} and status = 'completed' limit 1`;
  if (done) return notNew(biz.name);
  if (await wasClientBefore(tx, biz.id, c.phone)) return notNew(biz.name);
  return null;
}
