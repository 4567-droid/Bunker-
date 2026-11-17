import 'server-only';
import { randomInt } from 'node:crypto';
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
