import { clientIp, endSession, endSessionsFor, guardAttempts, hashPassword, normUser, recordFailure, startSession, verifyPassword } from '@/lib/auth';
import { currentBusiness } from '@/lib/business';
import { systemTx } from '@/lib/db';
import { fail, json, notFound, readBody, route, str } from '@/lib/http';
import { currentStaff, type Role } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, [action]) => {
  if (action !== 'me') notFound();
  const st = await currentStaff();
  if (!st) return json({ staff: null });
  if (st.role !== 'admin') {
    const biz = await currentBusiness();
    if (st.business_id !== biz.id) return json({ staff: null });
  }
  return json({ staff: { id: st.id, name: st.name, role: st.role, businessId: st.business_id } });
});

export const POST = route(async (req, [action]) => {
  const body = await readBody(req);
  if (action === 'logout') {
    await endSession('staff');
    return json({ ok: true });
  }
  if (action === 'password') {
    // Cambiar la propia contraseña o código (admin, dueño o barbero)
    const me = await currentStaff();
    if (!me) fail(401, 'Tenés que ingresar.');
    const isBarber = me.role === 'barber';
    const current = str(body, 'current', { max: 100, label: isBarber ? 'el código actual' : 'la contraseña actual' });
    const next = str(body, 'next', { min: isBarber ? 4 : 8, max: 100, label: isBarber ? 'el código nuevo' : 'la contraseña nueva' });
    const [row] = await systemTx((tx) => tx<{ password_hash: string }[]>`select password_hash from staff where id = ${me.id}`);
    if (!row || !(await verifyPassword(current, row.password_hash))) {
      fail(401, isBarber ? 'El código actual no es correcto.' : 'La contraseña actual no es correcta.');
    }
    const hash = await hashPassword(next);
    await systemTx((tx) => tx`update staff set password_hash = ${hash} where id = ${me.id}`);
    // Cierra las otras sesiones y vuelve a abrir esta
    await endSessionsFor({ staffId: me.id });
    await startSession('staff', { businessId: me.business_id, staffId: me.id });
    return json({ ok: true });
  }
  if (action !== 'login') notFound();

  const role = body.role as Role;
  if (!['admin', 'owner', 'barber'].includes(role)) fail(400, 'Rol inválido.');
  const username = normUser(str(body, 'username', { max: 60, label: role === 'barber' ? 'tu nombre' : 'el usuario' }));
  const password = str(body, 'password', { max: 100, label: role === 'barber' ? 'tu código' : 'la contraseña' });
  const biz = role === 'admin' ? null : await currentBusiness();

  const ip = await clientIp();
  const keys = [`st:${ip}`, `st:${biz?.id ?? 'admin'}:${username}`];
  await guardAttempts(keys);

  const rows = await systemTx(
    (tx) => tx<{ id: string; business_id: string | null; password_hash: string; name: string }[]>`
      select id, business_id, password_hash, name from staff
      where role = ${role} and active and lower(username) = ${username}
        and business_id is not distinct from ${biz?.id ?? null}`,
  );
  const st = rows[0];
  const ok = st ? await verifyPassword(password, st.password_hash) : false;
  if (!st || !ok) {
    await recordFailure(keys);
    fail(401, role === 'barber' ? 'Nombre o código incorrecto.' : 'Usuario o contraseña incorrectos.');
  }
  await startSession('staff', { businessId: st.business_id, staffId: st.id });
  return json({ staff: { id: st.id, name: st.name, role, businessId: st.business_id } });
});
