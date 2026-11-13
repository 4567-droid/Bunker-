import 'server-only';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { systemTx } from './db';
import { fail } from './http';

// ---------------------------------------------------------------------
// Contraseñas y códigos (scrypt)
// ---------------------------------------------------------------------
function scryptAsync(password: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** "Iván " → "ivan" (para entrar con el nombre sin importar tildes ni mayúsculas) */
export function normUser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// ---------------------------------------------------------------------
// Sesiones (cookie httpOnly con un token al azar; en la base se guarda su hash)
// ---------------------------------------------------------------------
export const CLIENT_COOKIE = 'bk_c';
export const STAFF_COOKIE = 'bk_s';
const CLIENT_DAYS = 365;
const STAFF_DAYS = 30;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function isHttps(): Promise<boolean> {
  const h = await headers();
  return (h.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https';
}

export async function startSession(
  kind: 'client' | 'staff',
  ids: { businessId: string | null; clientId?: string; staffId?: string },
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const days = kind === 'client' ? CLIENT_DAYS : STAFF_DAYS;
  await systemTx(async (tx) => {
    await tx`insert into sessions (token_hash, kind, business_id, client_id, staff_id, expires_at)
             values (${sha256(token)}, ${kind}, ${ids.businessId}, ${ids.clientId ?? null}, ${ids.staffId ?? null},
                     now() + make_interval(days => ${days}))`;
    if (Math.random() < 0.05) await tx`delete from sessions where expires_at < now()`;
  });
  const jar = await cookies();
  jar.set(kind === 'client' ? CLIENT_COOKIE : STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await isHttps(),
    path: '/',
    maxAge: days * 86400,
  });
}

export interface SessionRow {
  kind: 'client' | 'staff';
  business_id: string | null;
  client_id: string | null;
  staff_id: string | null;
}

export async function readSession(kind: 'client' | 'staff'): Promise<SessionRow | null> {
  const jar = await cookies();
  const token = jar.get(kind === 'client' ? CLIENT_COOKIE : STAFF_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const rows = await systemTx(
    (tx) => tx<SessionRow[]>`select kind, business_id, client_id, staff_id from sessions
                              where token_hash = ${sha256(token)} and kind = ${kind} and expires_at > now()`,
  );
  return rows[0] ?? null;
}

export async function endSession(kind: 'client' | 'staff'): Promise<void> {
  const jar = await cookies();
  const name = kind === 'client' ? CLIENT_COOKIE : STAFF_COOKIE;
  const token = jar.get(name)?.value;
  if (token) await systemTx((tx) => tx`delete from sessions where token_hash = ${sha256(token)}`);
  jar.delete(name);
}

export async function endSessionsFor(where: { clientId?: string; staffId?: string }): Promise<void> {
  await systemTx(async (tx) => {
    if (where.staffId) await tx`delete from sessions where staff_id = ${where.staffId}`;
    if (where.clientId) await tx`delete from sessions where client_id = ${where.clientId}`;
  });
}

// ---------------------------------------------------------------------
// Freno a intentos repetidos (8 fallos en 15 minutos → esperar)
// ---------------------------------------------------------------------
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'local').split(',')[0].trim();
}

export async function guardAttempts(keys: string[], max = 8, windowMin = 15): Promise<void> {
  const rows = await systemTx(
    (tx) => tx<{ n: number }[]>`select count(*)::int as n from auth_failures
                                where key = any(${keys}) and created_at > now() - make_interval(mins => ${windowMin})
                                group by key`,
  );
  if (rows.some((r) => r.n >= max)) fail(429, 'Demasiados intentos. Esperá unos minutos y probá de nuevo.');
}

export async function recordFailure(keys: string[]): Promise<void> {
  await systemTx(async (tx) => {
    for (const k of keys) await tx`insert into auth_failures (key) values (${k})`;
    if (Math.random() < 0.05) await tx`delete from auth_failures where created_at < now() - interval '1 day'`;
  });
}
