// Prueba de punta a punta contra la app corriendo y una base recién creada.
//   npm run test:e2e   (ver scripts/e2e.sh)
// Requiere: TEST_BASE_URL, DATABASE_URL, y el servidor con ALLOW_TEST_CLOCK=1
// TEST_NOW=2026-11-13T11:00:00-03:00 (viernes 11:00 en Resistencia).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3200';
const DAY = '2026-11-13';
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice() {} });

function agent(extra = {}) {
  const jar = new Map();
  async function req(path, body, headers = {}) {
    const h = { ...extra, ...headers };
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
    const res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: h,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /Max-Age=0/i.test(c) || /Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k);
      else jar.set(k, v);
    }
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }
  return { get: (p, h) => req(p, undefined, h), post: (p, b = {}, h) => req(p, b, h) };
}

const pub = agent();
const ana = agent();
const bruno = agent();
const carla = agent();
const mauri = agent();
const ivan = agent();
const owner = agent();
const admin = agent();
const ctx = {};

test('configuración pública', async () => {
  const r = await pub.get('/api/public/config');
  assert.equal(r.status, 200);
  assert.equal(r.data.business.name, 'Bunker Barber Club');
  assert.equal(r.data.today, DAY);
  assert.deepEqual(r.data.services.map((s) => s.name), ['Corte', 'Corte + barba', 'Barba sola']);
  assert.deepEqual(r.data.barbers.map((b) => b.name), ['Mauri', 'Iván']);
  ctx.svc = Object.fromEntries(r.data.services.map((s) => [s.name, s.id]));
  ctx.barber = Object.fromEntries(r.data.barbers.map((b) => [b.name, b.id]));
});

test('registro: valida nombre y apellido y teléfono', async () => {
  let r = await pub.post('/api/client/register', { name: 'Juan', phone: '3624111111' });
  assert.equal(r.status, 400);
  r = await pub.post('/api/client/register', { name: 'Juan Pérez', phone: '123' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /teléfono/i);
});

test('registro con y sin invitación', async () => {
  let r = await ana.post('/api/client/register', { name: 'Ana Pérez', phone: '362 411-1111' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  ctx.anaCode = r.data.client.referralCode;
  assert.match(ctx.anaCode, /^ANA[A-Z0-9]{3}$/);

  const ref = await pub.get(`/api/public/referral?code=${ctx.anaCode}`);
  assert.deepEqual(ref.data, { valid: true, code: ctx.anaCode, name: 'Ana', percent: 20 });

  r = await bruno.post('/api/client/register', { name: 'Bruno Díaz', phone: '0362 15 422-2222', ref: ctx.anaCode });
  assert.equal(r.status, 201);
  assert.equal(r.data.client.phone, '3624222222');
  assert.equal(r.data.rewards.length, 1);
  assert.equal(r.data.rewards[0].kind, 'welcome');
  assert.equal(r.data.rewards[0].from, 'Ana');

  r = await agent().post('/api/client/register', { name: 'Otro Bruno', phone: '+54 9 362 422-2222' });
  assert.equal(r.status, 409);
});

test('ingreso: si cargó correo, se pide el correo', async () => {
  let r = await carla.post('/api/client/register', { name: 'Carla Gómez', phone: '3624333333', email: 'Carla@Mail.com' });
  assert.equal(r.status, 201);
  const other = agent();
  r = await other.post('/api/client/login', { phone: '3624333333' });
  assert.equal(r.status, 401);
  r = await other.post('/api/client/login', { phone: '3624333333', email: 'carla@mail.com' });
  assert.equal(r.status, 200);
  assert.equal(r.data.client.name, 'Carla Gómez');
  r = await other.post('/api/client/login', { phone: '3629999999' });
  assert.equal(r.status, 404);
});

test('días y horarios libres', async () => {
  const d = await pub.get(`/api/public/days?service=${ctx.svc.Corte}`);
  assert.equal(d.data.days[0].day, DAY);
  assert.ok(!d.data.days.some((x) => x.day === '2026-11-15'), 'domingo cerrado');
  const s = await pub.get(`/api/public/slots?service=${ctx.svc.Corte}&day=${DAY}`);
  // 11:00 + 30 min de anticipación; 13 a 16 cerrado
  assert.deepEqual(s.data.slots.slice(0, 4).map((x) => x.time), ['11:30', '12:00', '12:30', '16:00']);
  assert.equal(s.data.slots[0].free.length, 2);
});

test('reserva con 20% de bienvenida y sin choques', async () => {
  let q = await bruno.get(`/api/client/quote?service=${ctx.svc.Corte}`);
  assert.equal(q.data.discountPct, 20);
  assert.equal(q.data.finalPrice, 12000);

  const base = { serviceId: ctx.svc.Corte, day: DAY, time: '11:30', payment: 'efectivo' };
  let r = await bruno.post('/api/client/book', { ...base, barberId: ctx.barber.Mauri });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.appointment.finalPrice, 12000);
  ctx.brunoAppt = r.data.appointment.id;

  r = await ana.post('/api/client/book', { ...base, barberId: ctx.barber.Mauri });
  assert.equal(r.status, 409, 'mismo barbero, misma hora');

  r = await ana.post('/api/client/book', { ...base, barberId: ctx.barber['Iván'] });
  assert.equal(r.status, 201);
  ctx.anaIvan = r.data.appointment.id;

  const s = await pub.get(`/api/public/slots?service=${ctx.svc.Corte}&day=${DAY}`);
  assert.ok(!s.data.slots.some((x) => x.time === '11:30'), '11:30 ya no está');

  r = await ana.post('/api/client/book', { ...base, time: '12:00', barberId: ctx.barber['Iván'] });
  assert.equal(r.status, 201);
  ctx.anaNoon = r.data.appointment.id;
  r = await ana.post('/api/client/book', { ...base, time: '12:30', barberId: ctx.barber['Iván'] });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /2 turnos/);

  r = await ana.post('/api/client/cancel', { id: ctx.anaNoon });
  assert.equal(r.status, 200);
  r = await bruno.post('/api/client/cancel', { id: ctx.anaIvan });
  assert.equal(r.status, 404, 'no puede cancelar turnos ajenos');
});

test('barbero: ingreso con nombre y código', async () => {
  let r = await mauri.post('/api/staff/login', { role: 'barber', username: 'mauri', password: '0000' });
  assert.equal(r.status, 401);
  r = await mauri.post('/api/staff/login', { role: 'barber', username: 'Mauri', password: '1234' });
  assert.equal(r.status, 200);
  r = await ivan.post('/api/staff/login', { role: 'barber', username: 'IVAN', password: '5678' });
  assert.equal(r.status, 200);
  r = await bruno.get('/api/barber/agenda');
  assert.equal(r.status, 401, 'un cliente no entra al panel');
});

test('barbero: empezar corte, luz roja y sellar', async () => {
  let a = await mauri.get('/api/barber/agenda');
  const row = a.data.rows.find((x) => x.id === ctx.brunoAppt);
  assert.ok(row);
  assert.equal(row.client.stamps, 0);
  assert.equal(row.total, 12000);
  assert.ok(!a.data.rows.some((x) => x.id === ctx.anaIvan), 'solo ve sus turnos');

  let r = await mauri.post('/api/barber/cancel', { id: ctx.anaIvan });
  assert.equal(r.status, 404);

  r = await mauri.post('/api/barber/start', { id: ctx.brunoAppt, minutes: 20 });
  assert.equal(r.status, 200);
  const live = await pub.get('/api/public/live');
  const m = live.data.barbers.find((b) => b.name === 'Mauri');
  assert.equal(m.state, 'cutting');
  assert.ok(m.freeInMin >= 19 && m.freeInMin <= 20);

  r = await mauri.post('/api/barber/complete', {});
  assert.equal(r.status, 200);
  assert.equal(r.data.added, 1);
  const me = await bruno.get('/api/client/me');
  assert.equal(me.data.client.stamps, 1);

  // Primer corte del amigo → Ana gana 20%
  const q = await ana.get(`/api/client/quote?service=${ctx.svc.Corte}`);
  assert.equal(q.data.discountPct, 20);
  assert.match(q.data.reason, /invitar/);
  const live2 = await pub.get('/api/public/live');
  assert.equal(live2.data.barbers.find((b) => b.name === 'Mauri').state, 'free');
});

test('tarjeta llena: el 10.º corte es gratis', async () => {
  await sql`update clients set stamps = 9 where phone = '3624222222'`;
  const q = await bruno.get(`/api/client/quote?service=${ctx.svc['Barba sola']}`);
  assert.equal(q.data.discountPct, 100);
  let r = await bruno.post('/api/client/book', { serviceId: ctx.svc['Barba sola'], day: DAY, time: '16:00', barberId: ctx.barber.Mauri, payment: 'efectivo' });
  assert.equal(r.status, 201);
  assert.equal(r.data.appointment.finalPrice, 0);
  r = await mauri.post('/api/barber/complete', { id: r.data.appointment.id });
  assert.equal(r.data.free, true);
  const me = await bruno.get('/api/client/me');
  assert.equal(me.data.client.stamps, 0);
});

test('doble sello si vuelve antes de 30 días', async () => {
  let r = await bruno.post('/api/client/book', { serviceId: ctx.svc.Corte, day: DAY, time: '17:00', barberId: ctx.barber.Mauri, payment: 'transferencia' });
  assert.equal(r.status, 201);
  assert.equal(r.data.appointment.finalPrice, 15000);
  r = await mauri.post('/api/barber/complete', { id: r.data.appointment.id });
  assert.equal(r.data.added, 2);
  assert.equal(r.data.double, true);
});

test('fila sin turno', async () => {
  let r = await ana.post('/api/client/queue', { action: 'join' });
  assert.equal(r.status, 200);
  r = await ana.post('/api/client/queue', { action: 'join' });
  assert.equal(r.status, 409);
  let live = await pub.get('/api/public/live');
  assert.equal(live.data.queue.waiting, 1);
  const me = await ana.get('/api/client/me');
  assert.equal(me.data.queue.position, 1);

  r = await mauri.post('/api/barber/queue/call', {});
  assert.equal(r.data.called[0].name, 'Ana Pérez');
  r = await mauri.post('/api/barber/queue/serve', { id: r.data.called[0].id, serviceId: ctx.svc.Corte });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  live = await pub.get('/api/public/live');
  assert.equal(live.data.queue.waiting, 0);
  const anaMe = await ana.get('/api/client/me');
  assert.equal(anaMe.data.client.stamps, 1, 'sumó sello por la fila');
  assert.equal(anaMe.data.rewards.length, 0, 'usó su 20% por invitar');
});

test('turno creado a mano por el barbero', async () => {
  const s = await ivan.get(`/api/barber/slots?service=${ctx.svc.Corte}&day=${DAY}`);
  assert.ok(s.data.slots.some((x) => x.time === '12:00'));
  let r = await ivan.post('/api/barber/appointments', { name: 'Diego Ruiz', phone: '362 455-5555', serviceId: ctx.svc.Corte, day: DAY, time: '12:00' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  r = await ivan.post('/api/barber/appointments', { name: 'Otro', serviceId: ctx.svc.Corte, day: DAY, time: '12:00' });
  assert.equal(r.status, 409);
  const cl = await ivan.get('/api/barber/clients');
  assert.ok(cl.data.clients.some((c) => c.name === 'Diego Ruiz'));
});

test('central del dueño: ingresos, gastos y ajustes', async () => {
  let r = await owner.post('/api/staff/login', { role: 'owner', username: 'bunker', password: 'bunker-test' });
  assert.equal(r.status, 200);
  let f = await owner.get('/api/owner/finance');
  // 12.000 (Bruno con 20%) + 0 (gratis) + 15.000 (doble sello) + 12.000 (Ana en la fila con 20%)
  assert.equal(f.data.serviceIncome, 39000);
  assert.equal(f.data.barberCards.find((b) => b.name === 'Mauri').total, 39000);
  r = await owner.post('/api/owner/expense', { category: 'Servicios', description: 'Luz', amount: 5000 });
  assert.equal(r.status, 200);
  f = await owner.get('/api/owner/finance');
  assert.equal(f.data.expense, 5000);
  assert.equal(f.data.profit, 34000);
  assert.equal(f.data.booked.n, 2, 'turnos reservados que faltan (Ana 11:30 e Iván 12:00)');

  const st = await owner.get('/api/owner/settings');
  const corte = st.data.services.find((s) => s.name === 'Corte');
  r = await owner.post('/api/owner/service/update', { ...corte, price: 16000 });
  assert.equal(r.status, 200);
  const cfg = await pub.get('/api/public/config');
  assert.equal(cfg.data.services.find((s) => s.name === 'Corte').price, 16000);

  r = await owner.post('/api/owner/barber', { name: 'Leo', code: '4321' });
  assert.equal(r.status, 200);
  r = await agent().post('/api/staff/login', { role: 'barber', username: 'leo', password: '4321' });
  assert.equal(r.status, 200);

  r = await mauri.get('/api/owner/finance');
  assert.equal(r.status, 401, 'un barbero no ve la central');
});

test('admin general y aislamiento entre negocios', async () => {
  let r = await admin.post('/api/staff/login', { role: 'admin', username: 'admin', password: 'admin-test-123' });
  assert.equal(r.status, 200);
  r = await admin.post('/api/admin/business', { name: 'Uñas Sol', slug: 'unas-sol', kind: 'Uñas', ownerUser: 'sol', ownerPassword: 'sol-12345' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const list = await admin.get('/api/admin/businesses');
  assert.equal(list.data.totals.businesses, 2);

  const sol = agent({ 'x-bk-biz': 'unas-sol' });
  r = await sol.post('/api/staff/login', { role: 'owner', username: 'sol', password: 'sol-12345' });
  assert.equal(r.status, 200);
  const f = await sol.get('/api/owner/finance');
  assert.equal(f.data.income, 0, 'no ve plata de Bunker');
  const st = await sol.get('/api/owner/settings');
  assert.equal(st.data.services.length, 0);

  r = await owner.get('/api/owner/finance', { 'x-bk-biz': 'unas-sol' });
  assert.equal(r.status, 403, 'el dueño de Bunker no entra a otro negocio');
  r = await bruno.get('/api/client/me', { 'x-bk-biz': 'unas-sol' });
  assert.equal(r.data.client, null);

  // La base misma (RLS) no deja ver filas de otro negocio
  const [biz] = await sql`select id from businesses where slug = 'unas-sol'`;
  const seen = await sql.begin(async (tx) => {
    await tx`select set_config('app.business_id', ${biz.id}, true), set_config('role', 'bunker_app', true)`;
    const [{ n }] = await tx`select count(*)::int as n from clients`;
    const [{ s }] = await tx`select count(*)::int as s from sessions`;
    return { n, s };
  });
  assert.deepEqual(seen, { n: 0, s: 0 });
});

test('seguridad: CSRF y freno a intentos', async () => {
  let r = await bruno.post('/api/client/logout', {}, { origin: 'https://otro-sitio.com' });
  assert.equal(r.status, 403);
  r = await bruno.post('/api/client/logout', 'x', { 'content-type': 'text/plain' });
  assert.equal(r.status, 415);
  const bad = agent();
  let last;
  for (let i = 0; i < 9; i++) last = await bad.post('/api/staff/login', { role: 'barber', username: 'Iván', password: String(1000 + i) });
  assert.equal(last.status, 429);
});

test.after(async () => {
  await sql.end();
});
