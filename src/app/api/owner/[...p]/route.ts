import { endSessionsFor, hashPassword, normUser } from '@/lib/auth';
import { apptDto, bizNow, blockDto, businessCuts, createBlocks, loadBlocks, parseBlockInput, type ApptRow } from '@/lib/booking';
import { phoneDisplay } from '@/lib/format';
import { dropImage, saveImage } from '@/lib/images';
import { currentBusiness, forgetBusinessCache, type Business } from '@/lib/business';
import { tenantTx, type Tx } from '@/lib/db';
import { bool, fail, int, json, notFound, readBody, route, str, uuid, type Body } from '@/lib/http';
import { requireStaff } from '@/lib/session';
import { addDays, dayLabel, isDay, isOpenDay, monthDays, monthLabel, toMin, type Hours, type Now } from '@/lib/time';

export const dynamic = 'force-dynamic';

const INCOME_CATS = ['Productos', 'Servicios extra', 'Otros'];
const EXPENSE_CATS = ['Alquiler', 'Servicios', 'Productos', 'Insumos', 'Sueldos', 'Mantenimiento', 'Otros'];

interface Money {
  id: string;
  category: string;
  description: string;
  amount: number;
  on_date: string;
  created_at: Date;
}

async function finance(tx: Tx, biz: Business, month: string, now: Now) {
  const days = monthDays(month);
  const first = days[0];
  const last = days[days.length - 1];
  const closures = await businessCuts(tx, biz.id, first, days.length);
  const openDays = days.filter((d) => isOpenDay(biz.hours, d, closures));
  const elapsed = openDays.filter((d) => d <= now.day).length;

  const barbers = await tx<{ id: string; name: string; active: boolean }[]>`
    select id, name, active from staff where business_id = ${biz.id} and role = 'barber' order by sort, name`;
  const services = await tx<{ name: string; price: number }[]>`
    select name, price from services where business_id = ${biz.id} and active order by sort, name`;
  const done = await tx<{ barber_id: string; service_name: string; n: number; total: number }[]>`
    select barber_id, service_name, count(*)::int as n, coalesce(sum(final_price), 0)::int as total
    from appointments
    where business_id = ${biz.id} and day between ${first} and ${last} and status = 'completed'
    group by barber_id, service_name`;
  const incomes = await tx<Money[]>`
    select id, category, description, amount, on_date, created_at from incomes
    where business_id = ${biz.id} and on_date between ${first} and ${last} order by on_date desc, created_at desc`;
  const expenses = await tx<Money[]>`
    select id, category, description, amount, on_date, created_at from expenses
    where business_id = ${biz.id} and on_date between ${first} and ${last} order by on_date desc, created_at desc`;
  const [booked] = await tx<{ n: number; amount: number }[]>`
    select count(*)::int as n, coalesce(sum(final_price), 0)::int as amount from appointments
    where business_id = ${biz.id} and status = 'booked'
      and day between ${first > now.day ? first : now.day} and ${last}`;

  const serviceIncome = done.reduce((a, r) => a + r.total, 0);
  const cuts = done.reduce((a, r) => a + r.n, 0);
  const otherIncome = incomes.reduce((a, r) => a + r.amount, 0);
  const income = serviceIncome + otherIncome;
  const expense = expenses.reduce((a, r) => a + r.amount, 0);
  const perDay = elapsed ? income / elapsed : 0;
  const projIncome = Math.round(perDay * openDays.length);
  const avgTicket = cuts ? serviceIncome / cuts : services[0]?.price || 15000;

  const serviceNames = [...new Set([...services.map((s) => s.name), ...done.map((d) => d.service_name)])];
  const barberCards = barbers
    .map((b) => {
      const mine = done.filter((d) => d.barber_id === b.id);
      return {
        id: b.id,
        name: b.name,
        total: mine.reduce((a, r) => a + r.total, 0),
        parts: serviceNames
          .map((name) => ({ label: name, n: mine.find((m) => m.service_name === name)?.n ?? 0 }))
          .filter((p, i) => p.n > 0 || i < 3),
        active: b.active,
      };
    })
    .filter((b) => b.active || b.total > 0);

  const catTotals = EXPENSE_CATS.map((c) => ({
    name: c,
    total: expenses.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0),
  }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const moneyDto = (r: Money, kind: 'in' | 'out') => ({
    id: r.id,
    kind,
    category: r.category,
    description: r.description,
    amount: r.amount,
    date: `${r.on_date.slice(8, 10)}/${r.on_date.slice(5, 7)}`,
    sort: `${r.on_date} ${new Date(r.created_at).toISOString()}`,
  });
  const moves = [...incomes.map((r) => moneyDto(r, 'in')), ...expenses.map((r) => moneyDto(r, 'out'))]
    .sort((a, b) => b.sort.localeCompare(a.sort))
    .slice(0, 5);

  const missing = biz.monthly_goal - projIncome;
  return {
    month,
    monthLabel: monthLabel(month),
    isCurrent: month === now.day.slice(0, 7),
    today: now.day,
    income,
    serviceIncome,
    otherIncome,
    expense,
    profit: income - expense,
    elapsed,
    openDays: openDays.length,
    perDay: Math.round(perDay),
    projIncome,
    projProfit: projIncome - expense,
    booked,
    goal: biz.monthly_goal,
    goalPct: biz.monthly_goal ? Math.min(100, Math.round((income / biz.monthly_goal) * 100)) : 0,
    projPct: biz.monthly_goal ? Math.min(100, Math.round((projIncome / biz.monthly_goal) * 100)) : 0,
    missing,
    cutsMissing: missing > 0 ? Math.ceil(missing / Math.max(1, avgTicket)) : 0,
    barberCards,
    incomes: incomes.map((r) => moneyDto(r, 'in')),
    expenses: expenses.map((r) => moneyDto(r, 'out')),
    catTotals,
    moves,
    incomeCats: INCOME_CATS,
    expenseCats: EXPENSE_CATS,
  };
}

/** Todos los meses, del primero con movimiento hasta el actual: cómo les fue a cada uno */
async function months(tx: Tx, biz: Business, now: Now) {
  const rows = await tx<{ m: string; cuts: number; service: number; other: number; expense: number; no_show: number; new_clients: number }[]>`
    select m, sum(cuts)::int as cuts, sum(service)::float8 as service, sum(other)::float8 as other,
           sum(expense)::float8 as expense, sum(no_show)::int as no_show, sum(new_clients)::int as new_clients
    from (
      select to_char(day, 'YYYY-MM') as m, (status = 'completed')::int as cuts,
             case when status = 'completed' then final_price else 0 end as service, 0 as other, 0 as expense,
             (status = 'no_show')::int as no_show, 0 as new_clients
        from appointments where business_id = ${biz.id} and status in ('completed', 'no_show')
      union all
      select to_char(on_date, 'YYYY-MM'), 0, 0, amount, 0, 0, 0 from incomes where business_id = ${biz.id}
      union all
      select to_char(on_date, 'YYYY-MM'), 0, 0, 0, amount, 0, 0 from expenses where business_id = ${biz.id}
      union all
      select to_char(created_at at time zone ${biz.timezone}, 'YYYY-MM'), 0, 0, 0, 0, 0, 1 from clients where business_id = ${biz.id}
    ) x
    group by m order by m`;
  const current = now.day.slice(0, 7);
  const byMonth = new Map(rows.map((r) => [r.m, r]));
  const first = rows.find((r) => r.m <= current)?.m ?? current;
  const list: string[] = [];
  for (let m = first; m <= current && list.length < 240; m = shiftMonth(m, 1)) list.push(m);

  let prev: { profit: number; active: boolean } | null = null;
  const out = list.map((m) => {
    const r = byMonth.get(m);
    const service = Math.round(r?.service ?? 0);
    const other = Math.round(r?.other ?? 0);
    const expense = Math.round(r?.expense ?? 0);
    const income = service + other;
    const profit = income - expense;
    const cuts = r?.cuts ?? 0;
    const item = {
      month: m,
      label: monthLabel(m),
      isCurrent: m === current,
      income,
      serviceIncome: service,
      otherIncome: other,
      expense,
      profit,
      cuts,
      avgTicket: cuts ? Math.round(service / cuts) : 0,
      noShows: r?.no_show ?? 0,
      newClients: r?.new_clients ?? 0,
      // Cuánto más (o menos) ganaron que el mes anterior. null si el anterior no tuvo movimiento
      profitDiff: prev && prev.active ? profit - prev.profit : null,
    };
    prev = { profit, active: income > 0 || expense > 0 };
    return item;
  });

  const years = [...new Set(out.map((x) => x.month.slice(0, 4)))].map((y) => {
    const ms = out.filter((x) => x.month.startsWith(y));
    return {
      year: y,
      income: ms.reduce((a, x) => a + x.income, 0),
      expense: ms.reduce((a, x) => a + x.expense, 0),
      profit: ms.reduce((a, x) => a + x.profit, 0),
      cuts: ms.reduce((a, x) => a + x.cuts, 0),
      months: ms.length,
    };
  });
  const closed = out.filter((x) => !x.isCurrent && (x.income > 0 || x.expense > 0));
  const best = closed.length ? closed.reduce((a, x) => (x.profit > a.profit ? x : a)) : null;
  return { current, months: out.reverse(), years: years.reverse(), best: best?.month ?? null };
}

function shiftMonth(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
}

function parseHours(raw: unknown): Hours {
  if (!raw || typeof raw !== 'object') fail(400, 'Horarios inválidos.');
  const out: Hours = {};
  for (let d = 0; d < 7; d++) {
    const list = (raw as Record<string, unknown>)[String(d)];
    const ranges: [string, string][] = [];
    if (Array.isArray(list)) {
      for (const r of list.slice(0, 3)) {
        if (!Array.isArray(r) || r.length !== 2) continue;
        const [a, b] = r.map(String);
        if (!(toMin(a) < toMin(b))) fail(400, 'Revisá los horarios: la hora de cierre tiene que ser después de la de apertura.');
        ranges.push([a, b]);
      }
    }
    ranges.sort((x, y) => toMin(x[0]) - toMin(y[0]));
    for (let i = 1; i < ranges.length; i++) {
      if (toMin(ranges[i][0]) < toMin(ranges[i - 1][1])) fail(400, 'Los horarios de un mismo día se superponen.');
    }
    out[String(d)] = ranges;
  }
  return out;
}

async function settings(tx: Tx, biz: Business) {
  const [b] = await tx<Business[]>`select * from businesses where id = ${biz.id}`;
  const barbers = await tx`select id, name, instagram, photo_url as "photoUrl", active, sort from staff
                           where business_id = ${biz.id} and role = 'barber' order by sort, name`;
  const services = await tx`select id, name, duration_min as duration, price, active, sort from services
                            where business_id = ${biz.id} order by sort, name`;
  const products = await tx`select id, name, description, price, image_url as "imageUrl", active, sort from products
                            where business_id = ${biz.id} order by sort, name`;
  return {
    business: {
      name: b.name,
      address: b.address,
      city: b.city,
      whatsapp: b.whatsapp,
      instagram: b.instagram,
      mapsUrl: b.maps_url,
      transferAlias: b.transfer_alias,
      mpLink: b.mp_link,
      heroUrl: b.hero_url,
      hours: b.hours,
      slotStep: b.slot_step,
      bookingDays: b.booking_days,
      cancelLimitMin: b.cancel_limit_min,
      loyaltyGoal: b.loyalty_goal,
      doubleStampDays: b.double_stamp_days,
      referralPercent: b.referral_percent,
      monthlyGoal: b.monthly_goal,
    },
    barbers,
    services,
    products,
  };
}

interface ClientListRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  stamps: number;
  visits: number;
  last_visit_on: string | null;
  created_at: Date;
  source: string;
  no_shows: number;
  invited: number;
  next_day: string | null;
}

async function clientList(tx: Tx, biz: Business, q: string, now: Now) {
  const like = `%${q.replace(/[%_\\]/g, '')}%`;
  const digits = q.replace(/\D/g, '');
  return tx<ClientListRow[]>`
    select c.id, c.name, c.phone, c.email, c.stamps, c.visits, c.last_visit_on, c.created_at, c.source,
           (select count(*)::int from appointments a where a.client_id = c.id and a.status = 'no_show') as no_shows,
           (select count(*)::int from clients r where r.referred_by = c.id) as invited,
           (select min(a.day) from appointments a where a.client_id = c.id and a.status = 'booked' and a.day >= ${now.day}) as next_day
    from clients c
    where c.business_id = ${biz.id}
      ${q ? tx`and (c.name ilike ${like} or c.email ilike ${like} ${digits.length >= 3 ? tx`or c.phone like ${'%' + digits + '%'}` : tx``})` : tx``}
    order by c.last_visit_on desc nulls last, c.created_at desc
    limit 500`;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Evita que Excel tome el texto como fórmula
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const optText = (b: Body, k: string, max = 200) => {
  const v = str(b, k, { optional: true, max });
  return v || null;
};

function mpLink(b: Body): string | null {
  const v = optText(b, 'mpLink', 300);
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    fail(400, 'Revisá el link de Mercado Pago (ej: https://link.mercadopago.com.ar/bunker).');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') fail(400, 'Revisá el link de Mercado Pago.');
  u.protocol = 'https:';
  return u.toString();
}

export const GET = route(async (req, [action]) => {
  const biz = await currentBusiness();
  await requireStaff(biz, ['owner', 'admin']);
  const now = bizNow(biz);
  if (action === 'finance') {
    const m = new URL(req.url).searchParams.get('month') ?? '';
    const month = isDay(`${m}-01`) ? m : now.day.slice(0, 7);
    return json(await tenantTx(biz.id, (tx) => finance(tx, biz, month, now)));
  }
  if (action === 'settings') return json(await tenantTx(biz.id, (tx) => settings(tx, biz)));
  if (action === 'months') return json(await tenantTx(biz.id, (tx) => months(tx, biz, now)));

  const q = new URL(req.url).searchParams;
  if (action === 'blocks') {
    return json(
      await tenantTx(biz.id, async (tx) => {
        const names = Object.fromEntries(
          (await tx<{ id: string; name: string }[]>`select id, name from staff where business_id = ${biz.id} and role = 'barber'`).map((r) => [r.id, r.name]),
        );
        const rows = await loadBlocks(tx, biz.id, now.day, addDays(now.day, 366));
        return { today: now.day, blocks: rows.map((b) => blockDto(b, names)) };
      }),
    );
  }
  if (action === 'clients') {
    const search = (q.get('q') ?? '').trim().slice(0, 60);
    const rows = await tenantTx(biz.id, (tx) => clientList(tx, biz, search, now));
    if (q.get('format') === 'csv') {
      const head = ['Nombre', 'Teléfono', 'Correo', 'Sellos', 'Visitas', 'Último corte', 'Faltó', 'Invitó', 'Próximo turno', 'Alta'];
      const lines = rows.map((c) =>
        [c.name, phoneDisplay(c.phone), c.email, c.stamps, c.visits, c.last_visit_on, c.no_shows, c.invited, c.next_day,
         new Date(c.created_at).toISOString().slice(0, 10)].map(csvCell).join(';'),
      );
      const body = '\uFEFF' + [head.join(';'), ...lines].join('\r\n');
      return new Response(body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="clientes-${biz.slug}-${now.day}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return json({
      goal: biz.loyalty_goal,
      total: rows.length,
      clients: rows.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        phoneDisplay: phoneDisplay(c.phone),
        email: c.email,
        stamps: c.stamps,
        visits: c.visits,
        lastVisitOn: c.last_visit_on,
        noShows: c.no_shows,
        invited: c.invited,
        nextDay: c.next_day,
        source: c.source,
      })),
    });
  }
  if (action === 'agenda') {
    const day = isDay(q.get('day')) ? (q.get('day') as string) : now.day;
    return json(
      await tenantTx(biz.id, async (tx) => {
        const barbers = await tx<{ id: string; name: string }[]>`
          select id, name from staff where business_id = ${biz.id} and role = 'barber' and active order by sort, name`;
        const rows = await tx<ApptRow[]>`
          select * from appointments where business_id = ${biz.id} and day = ${day} and status <> 'cancelled'
          order by start_min`;
        const blocks = await loadBlocks(tx, biz.id, day, day);
        const names = Object.fromEntries(barbers.map((b) => [b.id, b.name]));
        return {
          day,
          dayLabel: dayLabel(day),
          today: now.day,
          days: Array.from({ length: 14 }, (_, i) => addDays(now.day, i - 1)),
          barbers: barbers.map((b) => ({
            id: b.id,
            name: b.name,
            rows: rows.filter((r) => r.barber_id === b.id).map((r) => ({ ...apptDto(r), clientPhone: phoneDisplay(r.client_phone) })),
            blocks: blocks.filter((x) => x.barber_id === b.id).map((x) => blockDto(x, names)),
          })),
          closures: blocks.filter((x) => !x.barber_id).map((x) => blockDto(x, names)),
          totals: {
            booked: rows.filter((r) => r.status === 'booked' || r.status === 'in_progress').length,
            done: rows.filter((r) => r.status === 'completed').length,
            noShow: rows.filter((r) => r.status === 'no_show').length,
            amount: rows.filter((r) => r.status !== 'no_show').reduce((a, r) => a + r.final_price + r.products_total, 0),
          },
        };
      }),
    );
  }
  notFound();
});

export const POST = route(async (req, path) => {
  const biz = await currentBusiness();
  const me = await requireStaff(biz, ['owner', 'admin']);
  const now = bizNow(biz);
  const body = await readBody(req);
  const key = path.join('/');

  const result = await tenantTx(biz.id, async (tx) => {
    switch (key) {
      case 'income': {
        const category = String(body.category);
        if (!INCOME_CATS.includes(category)) fail(400, 'Elegí una categoría.');
        const date = isDay(body.date) ? (body.date as string) : now.day;
        await tx`insert into incomes (business_id, category, description, amount, on_date)
                 values (${biz.id}, ${category}, ${str(body, 'description', { min: 2, max: 120, label: 'el detalle' })},
                         ${int(body, 'amount', { min: 1, max: 1_000_000_000, label: 'el monto' })}, ${date})`;
        return { ok: true };
      }
      case 'income/delete':
        await tx`delete from incomes where id = ${uuid(body.id)} and business_id = ${biz.id}`;
        return { ok: true };
      case 'expense': {
        const category = String(body.category);
        if (!EXPENSE_CATS.includes(category)) fail(400, 'Elegí una categoría.');
        const date = isDay(body.date) ? (body.date as string) : now.day;
        await tx`insert into expenses (business_id, category, description, amount, on_date)
                 values (${biz.id}, ${category}, ${str(body, 'description', { min: 2, max: 120, label: 'el detalle' })},
                         ${int(body, 'amount', { min: 1, max: 1_000_000_000, label: 'el monto' })}, ${date})`;
        return { ok: true };
      }
      case 'expense/delete':
        await tx`delete from expenses where id = ${uuid(body.id)} and business_id = ${biz.id}`;
        return { ok: true };
      case 'goal':
        await tx`update businesses set monthly_goal = ${int(body, 'amount', { min: 0, max: 10_000_000_000, label: 'la meta' })}
                 where id = ${biz.id}`;
        forgetBusinessCache();
        return { ok: true };

      case 'business': {
        const hours = body.hours !== undefined ? parseHours(body.hours) : biz.hours;
        const whatsapp = optText(body, 'whatsapp', 20)?.replace(/\D/g, '') || null;
        await tx`update businesses set
                   address = ${optText(body, 'address', 120)},
                   city = ${optText(body, 'city', 80)},
                   whatsapp = ${whatsapp},
                   instagram = ${optText(body, 'instagram', 60)?.replace(/^@/, '') ?? null},
                   maps_url = ${optText(body, 'mapsUrl', 400)},
                   transfer_alias = ${optText(body, 'transferAlias', 60)},
                   mp_link = ${mpLink(body)},
                   hours = ${tx.json(hours)},
                   slot_step = ${int(body, 'slotStep', { min: 5, max: 120, label: 'el intervalo' })},
                   booking_days = ${int(body, 'bookingDays', { min: 1, max: 90, label: 'los días' })},
                   cancel_limit_min = ${int(body, 'cancelLimitMin', { min: 0, max: 2880, label: 'el aviso' })},
                   loyalty_goal = ${int(body, 'loyaltyGoal', { min: 2, max: 50, label: 'los sellos' })},
                   double_stamp_days = ${int(body, 'doubleStampDays', { min: 0, max: 365, label: 'los días del doble sello' })},
                   referral_percent = ${int(body, 'referralPercent', { min: 0, max: 100, label: 'el descuento' })}
                 where id = ${biz.id}`;
        forgetBusinessCache();
        return { ok: true };
      }

      case 'barber': {
        const name = str(body, 'name', { min: 2, max: 40, label: 'el nombre' });
        const code = str(body, 'code', { min: 4, max: 40, label: 'el código' });
        const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from staff where business_id = ${biz.id} and role = 'barber'`;
        const [s] = await tx<{ id: string }[]>`
          insert into staff (business_id, role, name, username, password_hash, instagram, sort)
          values (${biz.id}, 'barber', ${name}, ${normUser(name)}, ${await hashPassword(code)},
                  ${optText(body, 'instagram', 60)?.replace(/^@/, '') ?? null}, ${n})
          returning id`;
        await tx`insert into barber_status (barber_id, business_id, name) values (${s.id}, ${biz.id}, ${name})`;
        return { ok: true };
      }
      case 'barber/update': {
        const id = uuid(body.id);
        const [s] = await tx<{ id: string; name: string }[]>`
          select id, name from staff where id = ${id} and business_id = ${biz.id} and role = 'barber'`;
        if (!s) fail(404, 'Barbero no encontrado.');
        const name = str(body, 'name', { optional: true, min: 2, max: 40 }) || s.name;
        const active = bool(body, 'active');
        const code = str(body, 'code', { optional: true, min: 4, max: 40, label: 'el código' });
        await tx`update staff set name = ${name}, username = ${normUser(name)},
                   instagram = ${body.instagram === undefined ? tx`instagram` : (optText(body, 'instagram', 60)?.replace(/^@/, '') ?? null)},
                   active = ${active === undefined ? tx`active` : active}
                 where id = ${id}`;
        if (code) await tx`update staff set password_hash = ${await hashPassword(code)} where id = ${id}`;
        await tx`update barber_status set name = ${name} where barber_id = ${id}`;
        return { ok: true, endSessions: !!code || active === false ? id : null };
      }

      case 'service':
      case 'service/update': {
        const name = str(body, 'name', { min: 2, max: 60, label: 'el nombre' });
        const duration = int(body, 'duration', { min: 5, max: 480, label: 'la duración' });
        const price = int(body, 'price', { min: 0, max: 100_000_000, label: 'el precio' });
        if (key === 'service') {
          await tx`insert into services (business_id, name, duration_min, price, sort)
                   values (${biz.id}, ${name}, ${duration}, ${price},
                           (select coalesce(max(sort), 0) + 1 from services where business_id = ${biz.id}))`;
        } else {
          const active = bool(body, 'active') ?? true;
          const r = await tx`update services set name = ${name}, duration_min = ${duration}, price = ${price}, active = ${active}
                             where id = ${uuid(body.id)} and business_id = ${biz.id}`;
          if (!r.count) fail(404, 'Servicio no encontrado.');
        }
        return { ok: true };
      }

      case 'blocks': {
        const input = parseBlockInput(body, { multiDay: true });
        const barberId = body.barberId ? uuid(body.barberId) : null;
        if (barberId) {
          const [b] = await tx`select 1 from staff where id = ${barberId} and business_id = ${biz.id} and role = 'barber'`;
          if (!b) fail(404, 'Barbero no encontrado.');
        }
        const n = await createBlocks(tx, biz, { ...input, barberId, by: me.id }, now);
        return { ok: true, days: n };
      }
      case 'blocks/delete': {
        const r = await tx`delete from blocks where id = ${uuid(body.id)} and business_id = ${biz.id}`;
        if (!r.count) fail(404, 'Ese bloqueo ya no existe.');
        return { ok: true };
      }

      case 'image':
      case 'image/delete': {
        const target = String(body.target);
        let old: string | null = null;
        if (target === 'hero') {
          old = (await tx<{ u: string | null }[]>`select hero_url as u from businesses where id = ${biz.id}`)[0]?.u ?? null;
        } else if (target === 'product') {
          const [r] = await tx<{ u: string | null }[]>`select image_url as u from products where id = ${uuid(body.id)} and business_id = ${biz.id}`;
          if (!r) fail(404, 'Producto no encontrado.');
          old = r.u;
        } else if (target === 'barber') {
          const [r] = await tx<{ u: string | null }[]>`select photo_url as u from staff where id = ${uuid(body.id)} and business_id = ${biz.id} and role = 'barber'`;
          if (!r) fail(404, 'Barbero no encontrado.');
          old = r.u;
        } else {
          fail(400, 'Foto de qué?');
        }
        const url = key === 'image' ? await saveImage(tx, biz.id, body.data) : null;
        if (target === 'hero') await tx`update businesses set hero_url = ${url} where id = ${biz.id}`;
        if (target === 'product') await tx`update products set image_url = ${url} where id = ${uuid(body.id)} and business_id = ${biz.id}`;
        if (target === 'barber') await tx`update staff set photo_url = ${url} where id = ${uuid(body.id)} and business_id = ${biz.id}`;
        await dropImage(tx, biz.id, old);
        if (target === 'hero') forgetBusinessCache();
        return { ok: true, url };
      }

      case 'product':
      case 'product/update': {
        const name = str(body, 'name', { min: 2, max: 60, label: 'el nombre' });
        const description = optText(body, 'description', 200);
        const priceRaw = body.price;
        const price = priceRaw === null || priceRaw === '' || priceRaw === undefined ? null : int(body, 'price', { min: 0, max: 100_000_000, label: 'el precio' });
        if (key === 'product') {
          await tx`insert into products (business_id, name, description, price, sort)
                   values (${biz.id}, ${name}, ${description}, ${price},
                           (select coalesce(max(sort), 0) + 1 from products where business_id = ${biz.id}))`;
        } else {
          const active = bool(body, 'active') ?? true;
          const r = await tx`update products set name = ${name}, description = ${description}, price = ${price}, active = ${active}
                             where id = ${uuid(body.id)} and business_id = ${biz.id}`;
          if (!r.count) fail(404, 'Producto no encontrado.');
        }
        return { ok: true };
      }
    }
    return null;
  });

  if (result) {
    if ('endSessions' in result && result.endSessions) await endSessionsFor({ staffId: result.endSessions });
    return json({ ok: true, ...('url' in result ? { url: result.url } : {}), ...('days' in result ? { days: result.days } : {}) });
  }

  notFound();
});
