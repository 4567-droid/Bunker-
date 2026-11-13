import 'server-only';
import { readSession } from './auth';
import type { Business } from './business';
import { systemTx, tenantTx } from './db';
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

export async function currentClient(biz: Business): Promise<ClientRow | null> {
  const s = await readSession('client');
  if (!s?.client_id || s.business_id !== biz.id) return null;
  const rows = await tenantTx(biz.id, (tx) => tx<ClientRow[]>`select * from clients where id = ${s.client_id}`);
  return rows[0] ?? null;
}

export async function requireClient(biz: Business): Promise<ClientRow> {
  const c = await currentClient(biz);
  if (!c) fail(401, 'Primero creá tu cuenta o ingresá.');
  return c;
}

export async function currentStaff(): Promise<StaffRow | null> {
  const s = await readSession('staff');
  if (!s?.staff_id) return null;
  const rows = await systemTx(
    (tx) => tx<StaffRow[]>`select id, business_id, role, name, username, instagram, active
                           from staff where id = ${s.staff_id} and active`,
  );
  return rows[0] ?? null;
}

/** Exige un usuario del personal con alguno de esos roles y del negocio actual. */
export async function requireStaff(biz: Business | null, roles: Role[]): Promise<StaffRow> {
  const st = await currentStaff();
  if (!st || !roles.includes(st.role)) fail(401, 'Tenés que ingresar.');
  if (st.role !== 'admin' && biz && st.business_id !== biz.id) fail(403, 'No tenés acceso a este negocio.');
  return st;
}
