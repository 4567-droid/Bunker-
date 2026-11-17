#!/usr/bin/env node
// Herramienta de base de datos.
//   npm run db:migrate            crea/actualiza las tablas
//   npm run db:seed               carga Bunker Barber Club (negocio, dueño, barberos, servicios)
//   npm run db:seed -- --demo     además carga clientes, turnos y gastos de ejemplo
//   npm run db:reset -- --yes     BORRA TODO y vuelve a crear (solo para pruebas)
//   node scripts/db.mjs demo      crea el negocio de muestra (con --reset lo deja como nuevo)
//
// Usa DATABASE_URL (o DIRECT_URL si existe) del archivo .env.local / .env
//
// En Vercel, `npm run vercel-build` corre `prepare` (= migrate + seed) antes de compilar: las tablas
// se crean y Bunker se carga solo en la primera publicación (después no toca nada). Ahí las claves
// iniciales salen de las variables de Vercel (ADMIN_PASSWORD, OWNER_PASSWORD, MAURI_CODE, IVAN_CODE).
// Si todavía no hay base conectada, `prepare` avisa y deja compilar igual: la web muestra el aviso.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt, scryptSync } from 'node:crypto';
import postgres from 'postgres';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = join(root, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const onVercel = !!process.env.VERCEL;
const cmd = process.argv[2];

// Acepta la dirección en los dos formatos que muestra Supabase (URL o "host=... port=... password=...").
// Copia de src/lib/db-url.ts: si cambiás algo acá, cambialo allá.
const SIN_CLAVE =
  'DATABASE_URL: falta la contraseña de la base. Cargala en Vercel como DATABASE_PASSWORD ' +
  '(Settings → Environment Variables) y volvé a publicar. Si no la recordás: Supabase → Project Settings → Database → Reset database password.';

/** @param fallbackPassword contraseña aparte (DATABASE_PASSWORD o POSTGRES_PASSWORD), por si la dirección no la trae */
function normalizeDbUrl(raw, fallbackPassword = '') {
  const s = raw.trim().replace(/^["']|["']$/g, '');
  const fb = fallbackPassword.trim();
  const isPlaceholder = (p) => !p || /YOUR-PASSWORD/i.test(p);
  const m = /^(postgres(?:ql)?:\/\/)([^:@/]+)(?::([^@/]*))?@(.+)$/i.exec(s);
  if (m) {
    const pass = m[3] ?? '';
    if (pass && !isPlaceholder(pass)) return s;
    // Sin contraseña en la dirección: se usa la de aparte; si no hay, se deja igual (bases locales sin clave)
    if (fb) return `${m[1]}${m[2]}:${encodeURIComponent(fb)}@${m[4]}`;
    if (pass) throw new Error(SIN_CLAVE);
    return s;
  }
  if (/^postgres(ql)?:\/\//i.test(s)) return s;
  const kv = {};
  for (const x of s.matchAll(/([A-Za-z_]+)\s*[=:]\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    kv[x[1].toLowerCase()] = x[2] ?? x[3] ?? x[4] ?? '';
  }
  const host = kv.host ?? kv.hostname;
  if (!host) {
    throw new Error('DATABASE_URL no tiene el formato esperado: pegá la dirección que empieza con postgresql:// (Supabase → Connect → Transaction pooler).');
  }
  const user = kv.user ?? kv.username ?? 'postgres';
  let pass = kv.password ?? kv.pass ?? '';
  if (isPlaceholder(pass)) pass = fb;
  if (!pass) throw new Error(SIN_CLAVE);
  const port = kv.port ?? '5432';
  const db = kv.database ?? kv.dbname ?? 'postgres';
  const q = kv.sslmode ? `?sslmode=${encodeURIComponent(kv.sslmode)}` : '';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}${q}`;
}

// DIRECT_URL (opcional, para crear tablas), DATABASE_URL, o POSTGRES_URL (la integración de Vercel)
const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
let url = null;
try {
  url = rawUrl ? normalizeDbUrl(rawUrl, process.env.DATABASE_PASSWORD || process.env.POSTGRES_PASSWORD || '') : null;
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
if (!url) {
  if (cmd === 'prepare') {
    console.warn('⚠ Todavía no hay una base de datos conectada: se compila igual, pero la web va a avisar que falta.');
    console.warn('  En Vercel: Storage → Create Database → Supabase (o cargá DATABASE_URL) y después Redeploy.');
    process.exit(0);
  }
  console.error(
    onVercel
      ? 'Falta DATABASE_URL: cargala en Vercel → Settings → Environment Variables y volvé a publicar.'
      : 'Falta DATABASE_URL. Copiá .env.example a .env.local y completala.',
  );
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, {
  ssl: local ? false : 'require',
  prepare: false,
  max: 1,
  onnotice: () => {},
});

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}
const normUser = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const randomCode = () => String(randomInt(0, 10000)).padStart(4, '0');
const randomPassword = () => randomBytes(9).toString('base64url');

// Clave inicial: la de la variable de entorno o una al azar (que se muestra una vez).
// En Vercel no se inventa ninguna: el registro de la publicación no es lugar para claves.
function secret(name, min, fallback) {
  const v = (process.env[name] || '').trim();
  if (v) {
    if (v.length < min) throw new Error(`${name} tiene que tener al menos ${min} caracteres.`);
    return v;
  }
  if (onVercel) {
    throw new Error(`Falta ${name}: cargala en Vercel → Settings → Environment Variables y volvé a publicar.`);
  }
  return fallback();
}

async function migrate() {
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
  // Supabase: la API pública no tiene por qué ver esta tabla
  const [{ anon }] = await sql`select exists (select 1 from pg_roles where rolname = 'anon') as anon`;
  if (anon) await sql`revoke all on _migrations from anon, authenticated`;
  const dir = join(root, 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await sql`select name from _migrations`).map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into _migrations (name) values (${f})`;
    });
    console.log(`✔ migración aplicada: ${f}`);
  }
  console.log('Base al día.');
}

const BUNKER_HOURS = {
  0: [],
  1: [['10:00', '13:00'], ['16:00', '20:00']],
  2: [['10:00', '13:00'], ['16:00', '20:00']],
  3: [['10:00', '13:00'], ['16:00', '20:00']],
  4: [['10:00', '13:00'], ['16:00', '20:00']],
  5: [['10:00', '13:00'], ['16:00', '20:00']],
  6: [['10:00', '13:00'], ['16:00', '20:00']],
};

async function seed({ demo }) {
  const printed = [];
  await sql.begin(async (tx) => {
    // Administrador general
    const adminUser = normUser(process.env.ADMIN_USER || 'admin');
    const [admin] = await tx`select id from staff where role = 'admin' and lower(username) = ${adminUser}`;
    if (!admin) {
      const pass = secret('ADMIN_PASSWORD', 8, randomPassword);
      await tx`insert into staff (role, name, username, password_hash)
               values ('admin', 'Administrador general', ${adminUser}, ${hashPassword(pass)})`;
      printed.push(['Administrador general (/admin)', adminUser, pass]);
    }

    let [biz] = await tx`select * from businesses where slug = 'bunker'`;
    if (biz) {
      console.log('Bunker Barber Club ya estaba cargado: no se tocó.');
      return;
    }
    [biz] = await tx`
      insert into businesses (slug, name, kind, domain, status, accent, logo_url, whatsapp, instagram,
                              address, city, maps_url, hours)
      values ('bunker', 'Bunker Barber Club', 'Barbería', ${process.env.SEED_DOMAIN || null}, 'activo',
              '#F5C400', '/brand/bunker-badge.png', '5493624493647', 'bunkerbarberclub',
              'Calle Isabel la Católica', 'H3506 Resistencia, Chaco',
              'https://www.google.com/maps/search/?api=1&query=Isabel+la+Cat%C3%B3lica%2C+H3506+Resistencia%2C+Chaco',
              ${tx.json(BUNKER_HOURS)})
      returning *`;

    const ownerUser = normUser(process.env.OWNER_USER || 'bunker');
    const ownerPass = secret('OWNER_PASSWORD', 8, randomPassword);
    await tx`insert into staff (business_id, role, name, username, password_hash)
             values (${biz.id}, 'owner', 'Dueño Bunker', ${ownerUser}, ${hashPassword(ownerPass)})`;
    printed.push(['Central del dueño (/central)', ownerUser, ownerPass]);

    const barbers = [
      { name: 'Mauri', instagram: 'maurii.montiel', code: secret('MAURI_CODE', 4, randomCode) },
      { name: 'Iván', instagram: '_garcia_ivann', code: secret('IVAN_CODE', 4, randomCode) },
    ];
    for (const [i, b] of barbers.entries()) {
      const [row] = await tx`
        insert into staff (business_id, role, name, username, password_hash, instagram, sort)
        values (${biz.id}, 'barber', ${b.name}, ${normUser(b.name)}, ${hashPassword(b.code)}, ${b.instagram}, ${i})
        returning id`;
      await tx`insert into barber_status (barber_id, business_id, name) values (${row.id}, ${biz.id}, ${b.name})`;
      printed.push([`Barbero ${b.name} (/barbero)`, b.name, b.code]);
    }

    const services = [
      ['Corte', 30, 15000],
      ['Corte + barba', 50, 18000],
      ['Barba sola', 20, 10000],
    ];
    for (const [i, [name, dur, price]] of services.entries()) {
      await tx`insert into services (business_id, name, duration_min, price, sort)
               values (${biz.id}, ${name}, ${dur}, ${price}, ${i})`;
    }
    const products = [
      ['Cera mate', 'Fija sin brillo. Para texturizados y pelo corto.'],
      ['Pomada con brillo', 'Brillo prolijo para peinados clásicos.'],
      ['Aceite para barba', 'Hidrata y saca el frizz de la barba.'],
    ];
    for (const [i, [name, desc]] of products.entries()) {
      await tx`insert into products (business_id, name, description, sort) values (${biz.id}, ${name}, ${desc}, ${i})`;
    }

    if (demo) await seedDemo(tx, biz);
  });

  if (printed.length && onVercel) {
    console.log('\nUsuarios creados (con las claves que cargaste en Vercel):');
    for (const [where, user] of printed) console.log(`  · ${where}: usuario "${user}"`);
    console.log('');
  } else if (printed.length) {
    console.log('\nUsuarios creados (guardalos, las contraseñas no se vuelven a mostrar):');
    for (const [where, user, pass] of printed) console.log(`  · ${where}: usuario "${user}" · clave "${pass}"`);
    console.log('');
  }
  console.log('Datos cargados.');
}

async function seedDemo(tx, biz) {
  const tz = biz.timezone;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(new Date());
  const [y, m] = today.split('-').map(Number);
  const barbers = await tx`select id, name from staff where business_id = ${biz.id} and role = 'barber' order by sort`;
  const services = await tx`select * from services where business_id = ${biz.id} order by sort`;
  const people = [
    ['Ezequiel Benítez', '3624905146', 'eze.benitez@mail.com', 5],
    ['Tomás Ríos', '3624512330', 'tomas.rios@mail.com', 6],
    ['Agustín Paz', '3624118902', 'agus.paz@mail.com', 9],
    ['Joaquín Molina', '3624760415', null, 2],
    ['Nahuel Sosa', '3624233871', 'nahuel.sosa@mail.com', 0],
  ];
  const clients = [];
  for (const [i, [name, phone, email, stamps]] of people.entries()) {
    const [c] = await tx`
      insert into clients (business_id, name, phone, email, referral_code, stamps, visits, last_visit_on)
      values (${biz.id}, ${name}, ${phone}, ${email}, ${'DEMO' + (i + 1)}, ${stamps}, ${stamps},
              ${stamps ? today : null})
      returning *`;
    clients.push(c);
  }
  // Cortes terminados en lo que va del mes (para la Central)
  const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
  const dayNum = Number(today.slice(8, 10));
  let n = 0;
  for (let d = 1; d < dayNum; d++) {
    const day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (dow === 0) continue;
    for (const [bi, b] of barbers.entries()) {
      for (let k = 0; k < 4; k++) {
        const s = services[(d + k + bi) % services.length];
        const start = 600 + k * 60;
        const c = clients[(d + k) % clients.length];
        await tx`
          insert into appointments (business_id, client_id, client_name, client_phone, barber_id, service_id,
                                    service_name, duration_min, day, start_min, end_min, status, source, payment,
                                    price, final_price, completed_at)
          values (${biz.id}, ${c.id}, ${c.name}, ${c.phone}, ${b.id}, ${s.id}, ${s.name}, ${s.duration_min},
                  ${day}, ${start}, ${start + s.duration_min}, 'completed', 'web', 'efectivo',
                  ${s.price}, ${s.price}, now())`;
        n++;
      }
    }
  }
  // Turnos de hoy y mañana
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  for (const [day, slots] of [[today, [[0, 960, 1], [0, 1020, 2], [1, 1020, 3], [0, 1080, 0]]], [tomorrow, [[1, 600, 4], [0, 660, 1]]]]) {
    for (const [bi, start, ci] of slots) {
      const s = services[ci % 2];
      const c = clients[ci];
      await tx`
        insert into appointments (business_id, client_id, client_name, client_phone, barber_id, service_id,
                                  service_name, duration_min, day, start_min, end_min, status, source, payment,
                                  price, final_price, confirmed_at, wa_sent_at)
        values (${biz.id}, ${c.id}, ${c.name}, ${c.phone}, ${barbers[bi].id}, ${s.id}, ${s.name}, ${s.duration_min},
                ${day}, ${start}, ${start + s.duration_min}, 'booked', 'web', 'efectivo',
                ${s.price}, ${s.price}, ${ci % 2 ? new Date() : null}, now())
        on conflict do nothing`;
    }
  }
  await tx`insert into incomes (business_id, category, description, amount, on_date) values
    (${biz.id}, 'Productos', 'Venta de ceras y pomadas', 64000, ${firstDay}),
    (${biz.id}, 'Otros', 'Seña de evento (casamiento)', 40000, ${firstDay})`;
  await tx`insert into expenses (business_id, category, description, amount, on_date) values
    (${biz.id}, 'Alquiler', 'Alquiler del local', 450000, ${firstDay}),
    (${biz.id}, 'Productos', 'Ceras y pomadas para reventa', 120000, ${firstDay}),
    (${biz.id}, 'Insumos', 'Navajas, talco y toallas', 45000, ${firstDay}),
    (${biz.id}, 'Servicios', 'Luz', 85000, ${firstDay}),
    (${biz.id}, 'Servicios', 'Agua e internet', 43000, ${firstDay}),
    (${biz.id}, 'Mantenimiento', 'Afilado y service de máquinas', 30000, ${firstDay})`;
  await tx`insert into queue_entries (business_id, name) values
    (${biz.id}, 'Gonzalo R.'), (${biz.id}, 'Ramiro D.'), (${biz.id}, 'Elías F.')`;
  // Un trámite de Iván mañana y datos de pago de ejemplo
  await tx`insert into blocks (business_id, barber_id, day, start_min, end_min, reason)
           values (${biz.id}, ${barbers[1].id}, ${tomorrow}, ${18 * 60}, ${19 * 60}, 'Trámite')`;
  await tx`update businesses set transfer_alias = 'bunker.barber.demo', mp_link = 'https://link.mercadopago.com.ar/demo'
           where id = ${biz.id}`;
  console.log(`Demo: ${clients.length} clientes, ${n} cortes del mes, turnos de hoy y mañana, gastos, fila y un bloqueo.`);
}

// ---------------------------------------------------------------------
// Chequeo de permisos: hace en la base real lo mismo que la web al registrar un cliente y
// reservar, con el mismo rol (bunker_app), y al final DESHACE todo. No guarda ni cambia datos.
// ---------------------------------------------------------------------
class Deshacer extends Error {}

async function check() {
  const slug = process.env.DEFAULT_BUSINESS_SLUG || 'bunker';
  const [biz] = await sql`select id from businesses where slug = ${slug}`;
  if (!biz) {
    console.log(`Chequeo: no hay negocio "${slug}" todavía.`);
    return true;
  }
  let ok = true;
  const step = async (name, fn) => {
    try {
      const r = await fn();
      console.log(`  ✔ ${name}`);
      return r;
    } catch (e) {
      ok = false;
      console.log(`  ✘ ${name}: ${e.code ? `[${e.code}] ` : ''}${e.message}`);
      throw new Deshacer();
    }
  };
  console.log('Chequeo de permisos (se deshace al final):');
  try {
    await sql.begin(async (tx) => {
      await step('entrar como la web (rol bunker_app)', () => tx`
        select set_config('app.business_id', ${biz.id}, true), set_config('app.is_admin', 'off', true),
               set_config('role', 'bunker_app', true)`);
      const [svc] = await step('leer servicios', () => tx`select id, name, duration_min, price from services where business_id = ${biz.id} and active limit 1`);
      const [bar] = await step('leer barberos', () => tx`select id from staff where business_id = ${biz.id} and role = 'barber' and active limit 1`);
      await step('leer bloqueos y turnos', () => tx`select (select count(*) from blocks) as b, (select count(*) from appointments) as a`);
      const [cl] = await step('crear cliente', () => tx`
        insert into clients (business_id, name, phone, referral_code)
        values (${biz.id}, 'Chequeo Automático', '3620000001', 'CHEQ01') returning id`);
      await step('candado del día', () => tx`select pg_advisory_xact_lock(hashtext('bk:chequeo'))`);
      if (svc && bar) {
        await step('reservar turno', () => tx`
          insert into appointments (business_id, client_id, client_name, client_phone, barber_id, service_id, service_name,
                                    duration_min, day, start_min, end_min, source, payment, price, final_price)
          values (${biz.id}, ${cl.id}, 'Chequeo Automático', '3620000001', ${bar.id}, ${svc.id}, ${svc.name},
                  ${svc.duration_min}, current_date + 400, 1380, ${1380 + svc.duration_min}, 'web', 'efectivo',
                  ${svc.price}, ${svc.price})`);
      }
      await step('anotarse en la fila', () => tx`
        insert into queue_entries (business_id, client_id, name) values (${biz.id}, ${cl.id}, 'Chequeo Automático')`);
      await step('invitaciones (cuentas borradas)', () => tx`
        insert into former_clients (business_id, phone_hash) values (${biz.id}, 'chequeo')`);
      throw new Deshacer();
    });
  } catch (e) {
    if (!(e instanceof Deshacer)) {
      ok = false;
      console.log(`  ✘ ${e.message}`);
    }
  }
  try {
    await sql.begin(async (tx) => {
      const [st] = await tx`select id from staff where business_id = ${biz.id} limit 1`;
      await step('anotar intentos de ingreso', () => tx`insert into auth_failures (key) values ('chequeo')`);
      if (st) {
        await step('abrir sesión', () => tx`
          insert into sessions (token_hash, kind, business_id, staff_id, expires_at)
          values ('chequeo-' || md5(random()::text), 'staff', ${biz.id}, ${st.id}, now() + interval '1 minute')`);
      }
      throw new Deshacer();
    });
  } catch (e) {
    if (!(e instanceof Deshacer)) {
      ok = false;
      console.log(`  ✘ ${e.message}`);
    }
  }
  console.log(ok ? 'Chequeo: todo bien (no se guardó nada).' : '⚠ Chequeo: hay un problema de permisos en la base (ver arriba).');
  return ok;
}

async function reset() {
  if (!process.argv.includes('--yes')) {
    console.error('Esto BORRA todos los datos. Si estás seguro: npm run db:reset -- --yes');
    process.exit(1);
  }
  await sql.unsafe(`
    drop table if exists former_clients, images, blocks, expenses, incomes, queue_entries, rewards, appointments, products, services,
      auth_failures, sessions, clients, barber_status, staff, businesses, _migrations cascade;
  `);
  console.log('Tablas borradas.');
  await migrate();
}

/** Negocio de muestra (Navaja Barber Club): lo arma la función demo_business() de la migración 006 */
async function demoBusiness(reset) {
  const [had] = await sql`select 1 from businesses where slug = 'demo'`;
  await sql`select demo_business(${reset})`;
  console.log(had && !reset ? 'Negocio de muestra: ya estaba, no se tocó.' : `✔ negocio de muestra ${reset ? 'renovado' : 'creado'}`);
}

try {
  if (cmd === 'migrate') await migrate();
  else if (cmd === 'prepare') {
    await migrate();
    await seed({ demo: false });
    // En Vercel: si no existe el negocio de muestra, se crea (no toca nada si ya está). DEMO_BUSINESS=off lo apaga.
    if (process.env.VERCEL && process.env.DEMO_BUSINESS !== 'off') await demoBusiness(false);
    await check();
  }
  else if (cmd === 'demo') await demoBusiness(process.argv.includes('--reset'));
  else if (cmd === 'check') {
    if (!(await check())) process.exitCode = 1;
  }
  else if (cmd === 'seed') await seed({ demo: process.argv.includes('--demo') });
  else if (cmd === 'reset') await reset();
  else console.log('Uso: node scripts/db.mjs migrate | seed [--demo] | demo [--reset] | reset --yes | prepare | check');
} catch (e) {
  console.error('Error:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
