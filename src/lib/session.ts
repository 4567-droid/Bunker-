import 'server-only';
import { sessionTokenHash } from './auth';
import type { Business } from './business';
import { db } from './db';
import { fail } from './http';

export interface ClientRow {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  email: string | null;
  referral_code: string;
  referred_by: string | null;
  stamps: number;
  visits: number;
  last_visit_on: string | null;
  created_at: Date;
}

export type Role = 'admin' | 'owner' | 'barber';

export interface StaffRow {
  id: string;
  business_id: string | null;
  role: Role;
  name: string;
  username: string;
  instagram: string | null;
  active: boolean;
}

// Sesión + persona en una sola consulta (antes eran dos transacciones): cada ida a la base cuenta.
export async function currentClient(biz: Business): Promise<ClientRow | null> {
  const hash = await sessionTokenHash('client');
  if (!hash) return null;
  const rows = await db()<ClientRow[]>`
    select c.* from sessions s join clients c on c.id = s.client_id
    where s.token_hash = ${hash} and s.kind = 'client' and s.expires_at > now()
      and s.business_id = ${biz.id} and c.business_id = ${biz.id}`;
  return rows[0] ?? null;
}

export async function requireClient(biz: Business): Promise<ClientRow> {
  const c = await currentClient(biz);
  if (!c) fail(401, 'Primero creá tu cuenta o ingresá.');
  return c;
}

export async function currentStaff(): Promise<StaffRow | null> {
  const hash = await sessionTokenHash('staff');
  if (!hash) return null;
  const rows = await db()<StaffRow[]>`
    select st.id, st.business_id, st.role, st.name, st.username, st.instagram, st.active
    from sessions s join staff st on st.id = s.staff_id
    where s.token_hash = ${hash} and s.kind = 'staff' and s.expires_at > now() and st.active`;
  return rows[0] ?? null;
}

/** Exige un usuario del personal con alguno de esos roles y del negocio actual. */
export async function requireStaff(biz: Business | null, roles: Role[]): Promise<StaffRow> {
  const st = await currentStaff();
  if (!st || !roles.includes(st.role)) fail(401, 'Tenés que ingresar.');
  if (st.role !== 'admin' && biz && st.business_id !== biz.id) fail(403, 'No tenés acceso a este negocio.');
  return st;
}
