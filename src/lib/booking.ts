import 'server-only';
import type { Business } from './business';
import type { Tx } from './db';
import { fail } from './http';
import { freeSlots, nextIsFree, projectShift, queueWait, stampOutcome, type BusyBlock } from './rules';
import type { ClientRow } from './session';
import { addDays, closesAt, dayLabel, fmtMin, isDay, isOpenAt, isOpenDay, nextOpening, nowIn, rangesFor, type Cuts, type Now } from './time';
import type { Payment } from './format';
import { PAYMENTS } from './format';

export interface ServiceRow {
  id: string;
  name: string;
  duration_min: number;
  price: number;
  active: boolean;
  sort: number;
}

export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  active: boolean;
  sort: number;
}

export interface BarberRow {
  id: string;
  name: string;
  instagram: string | null;
  photo_url: string | null;
}

export interface ApptRow {
  id: string;
  business_id: string;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  barber_id: string;
  service_id: string | null;
  service_name: string;
  duration_min: number;
  day: string;
  start_min: number;
  end_min: number;
  status: 'booked' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  source: 'web' | 'barbero' | 'fila';
  payment: Payment | null;
  price: number;
  discount_pct: number;
  discount_reason: string | null;
  final_price: number;
  products: { id: string; name: string; price: number | null }[];
  products_total: number;
  reward_id: string | null;
  loyalty_free: boolean;
  stamps_added: number;
  wa_sent_at: Date | null;
  confirmed_at: Date | null;
  started_at: Date | null;
  est_end_at: Date | null;
  completed_at: Date | null;
  reminded_at: Date | null;
  created_at: Date;
}

/**
 * Hora actual del negocio. Para las pruebas automáticas se puede fijar con
 * ALLOW_TEST_CLOCK=1 y TEST_NOW=2026-11-13T11:00:00-03:00 (nunca en producción).
 */
export const bizNow = (biz: Business): Now => {
  const fake = process.env.ALLOW_TEST_CLOCK === '1' ? process.env.TEST_NOW : undefined;
  return nowIn(biz.timezone, fake ? new Date(fake) : new Date());
};

export async function activeBarbers(tx: Tx, bizId: string): Promise<BarberRow[]> {
  return tx<BarberRow[]>`select id, name, instagram, photo_url from staff
                         where business_id = ${bizId} and role = 'barber' and active
                         order by sort, name`;
}

export async function activeServices(tx: Tx, bizId: string): Promise<ServiceRow[]> {
  return tx<ServiceRow[]>`select id, name, duration_min, price, active, sort from services
                          where business_id = ${bizId} and active order by sort, name`;
}

export async function getService(tx: Tx, bizId: string, id: unknown): Promise<ServiceRow> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) fail(400, 'Elegí un servicio.');
  const [s] = await tx<ServiceRow[]>`select id, name, duration_min, price, active, sort from services
                                     where id = ${id} and business_id = ${bizId} and active`;
  if (!s) fail(400, 'Ese servicio ya no está disponible.');
  return s;
}

type DayBusy = BusyBlock & { day: string };

export interface BlockRow {
  id: string;
  barber_id: string | null;
  day: string;
  start_min: number;
  end_min: number;
  reason: string | null;
}

/**
 * Turnos y bloqueos entre dos días.
 *  - busy: lo que ocupa a cada barbero (turnos + sus bloqueos)
 *  - cuts: tramos en que cierra todo el local (feriados) → se restan del horario
 */
async function agendaLoad(tx: Tx, bizId: string, from: string, to: string): Promise<{ busy: DayBusy[]; cuts: Cuts; closedReason: Record<string, string> }> {
  const rows = await tx<{ barber_id: string; day: string; start_min: number; end_min: number }[]>`
    select barber_id, day, start_min, end_min from appointments
    where business_id = ${bizId} and day between ${from} and ${to}
      and status in ('booked', 'in_progress', 'completed') and source <> 'fila'`;
  const blocks = await loadBlocks(tx, bizId, from, to);
  const busy: DayBusy[] = rows.map((r) => ({ barberId: r.barber_id, day: r.day, start: r.start_min, end: r.end_min }));
  const cuts: Cuts = {};
  const closedReason: Record<string, string> = {};
  for (const b of blocks) {
    if (b.barber_id) busy.push({ barberId: b.barber_id, day: b.day, start: b.start_min, end: b.end_min });
    else {
      (cuts[b.day] ??= []).push([b.start_min, b.end_min]);
      if (b.start_min === 0 && b.end_min === 1440) closedReason[b.day] = b.reason || 'Cerrado';
    }
  }
  return { busy, cuts, closedReason };
}

export async function loadBlocks(tx: Tx, bizId: string, from: string, to: string): Promise<BlockRow[]> {
  return tx<BlockRow[]>`
    select id, barber_id, day, start_min, end_min, reason from blocks
    where business_id = ${bizId} and day between ${from} and ${to}
    order by day, start_min`;
}

/** Cierres del local (feriados) de los próximos días, para saber si está abierto */
export async function businessCuts(tx: Tx, bizId: string, from: string, days = 15): Promise<Cuts> {
  const cuts: Cuts = {};
  for (const b of await loadBlocks(tx, bizId, from, addDays(from, days))) {
    if (!b.barber_id) (cuts[b.day] ??= []).push([b.start_min, b.end_min]);
  }
  return cuts;
}

/**
 * Un solo cambio de agenda por negocio y día a la vez: así un turno nuevo y un bloqueo
 * que se cargan en el mismo segundo no se pisan (los turnos entre sí ya los frena la base).
 */
export async function lockDay(tx: Tx, bizId: string, day: string): Promise<void> {
  await tx`select pg_advisory_xact_lock(hashtext(${'bk:' + bizId + ':' + day}))`;
}

function slotsFor(biz: Business, now: Now, day: string, duration: number, barberIds: string[], load: { busy: DayBusy[]; cuts: Cuts }, opts: { anyTime?: boolean } = {}) {
  const last = addDays(now.day, biz.booking_days - 1);
  if (day < now.day || (!opts.anyTime && day > last)) return [];
  const minStart = day === now.day ? now.min + (opts.anyTime ? 0 : biz.min_advance_min) : 0;
  return freeSlots({
    ranges: rangesFor(biz.hours, day, load.cuts),
    step: biz.slot_step,
    duration,
    barberIds,
    busy: load.busy.filter((b) => b.day === day),
    minStart,
  });
}

/** Próximos días abiertos y si les queda algún horario libre */
export async function listDays(tx: Tx, biz: Business, service: ServiceRow, now: Now) {
  const barbers = await activeBarbers(tx, biz.id);
  const ids = barbers.map((b) => b.id);
  const last = addDays(now.day, biz.booking_days - 1);
  const load = await agendaLoad(tx, biz.id, now.day, last);
  const out: { day: string; available: boolean; closed: string | null }[] = [];
  for (let i = 0; i < biz.booking_days; i++) {
    const day = addDays(now.day, i);
    if (!isOpenDay(biz.hours, day)) continue;
    const closed = load.closedReason[day] ?? null;
    out.push({ day, available: !closed && slotsFor(biz, now, day, service.duration_min, ids, load).length > 0, closed });
  }
  return out;
}

/** Horarios con al menos un barbero libre, y qué barberos están libres en cada uno */
export async function listSlots(tx: Tx, biz: Business, service: ServiceRow, day: string, now: Now, opts: { barberId?: string; anyTime?: boolean } = {}) {
  if (!isDay(day)) fail(400, 'Fecha inválida.');
  const barbers = await activeBarbers(tx, biz.id);
  const ids = opts.barberId ? barbers.filter((b) => b.id === opts.barberId).map((b) => b.id) : barbers.map((b) => b.id);
  const load = await agendaLoad(tx, biz.id, day, day);
  return slotsFor(biz, now, day, service.duration_min, ids, load, opts).map((s) => ({
    time: fmtMin(s.start),
    start: s.start,
    free: s.barbers,
  }));
}

// ---------------------------------------------------------------------
// Precio: tarjeta llena = gratis; si no, beneficio de invitación (20%)
// ---------------------------------------------------------------------
async function pricing(tx: Tx, biz: Business, client: ClientRow | null, service: ServiceRow) {
  if (!client) return { pct: 0, reason: null as string | null, rewardId: null as string | null, loyaltyFree: false };
  if (nextIsFree(client.stamps, biz.loyalty_goal)) {
    return { pct: 100, reason: 'Corte gratis · tarjeta de fidelidad', rewardId: null, loyaltyFree: true };
  }
  const [r] = await tx<{ id: string; kind: string; percent: number }[]>`
    select id, kind, percent from rewards
    where client_id = ${client.id} and status = 'available'
    order by (kind = 'welcome') desc, created_at
    limit 1 for update`;
  if (!r || service.price === 0) return { pct: 0, reason: null, rewardId: null, loyaltyFree: false };
  return {
    pct: r.percent,
    reason: r.kind === 'welcome' ? `${r.percent}% de bienvenida (te invitó un amigo)` : `${r.percent}% por invitar a un amigo`,
    rewardId: r.id,
    loyaltyFree: false,
  };
}

export async function quote(tx: Tx, biz: Business, client: ClientRow | null, service: ServiceRow) {
  const p = await pricing(tx, biz, client, service);
  return { ...p, price: service.price, finalPrice: Math.round((service.price * (100 - p.pct)) / 100) };
}

export interface NewAppointment {
  serviceId: unknown;
  day: unknown;
  time: unknown;
  barberId: unknown;
  payment?: unknown;
  productIds?: unknown;
}

export async function createAppointment(
  tx: Tx,
  biz: Business,
  who: { client: ClientRow | null; name?: string; phone?: string | null },
  input: NewAppointment,
  now: Now,
  source: 'web' | 'barbero' = 'web',
): Promise<ApptRow> {
  const service = await getService(tx, biz.id, input.serviceId);
  const day = input.day;
  if (!isDay(day)) fail(400, 'Elegí un día.');
  const time = typeof input.time === 'string' ? input.time : '';
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) fail(400, 'Elegí un horario.');
  const start = Number(m[1]) * 60 + Number(m[2]);
  const barbers = await activeBarbers(tx, biz.id);
  const barber = barbers.find((b) => b.id === input.barberId);
  if (!barber) fail(400, 'Elegí un barbero.');
  const payment = (typeof input.payment === 'string' && input.payment in PAYMENTS ? input.payment : null) as Payment | null;
  if (source === 'web' && !payment) fail(400, 'Elegí cómo vas a pagar.');

  await lockDay(tx, biz.id, day);
  const load = await agendaLoad(tx, biz.id, day, day);
  const slots = slotsFor(biz, now, day, service.duration_min, [barber.id], load, { anyTime: source === 'barbero' });
  if (!slots.some((s) => s.start === start)) fail(409, `${barber.name} ya no está libre a esa hora. Elegí otro horario.`);

  const client = who.client;
  if (client) {
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from appointments
      where client_id = ${client.id} and status = 'booked'
        and (day > ${now.day} or (day = ${now.day} and end_min > ${now.min}))`;
    if (source === 'web' && n >= 2) fail(409, 'Ya tenés 2 turnos reservados. Cancelá uno para sacar otro.');
    const [clash] = await tx`
      select 1 from appointments
      where client_id = ${client.id} and day = ${day} and status in ('booked', 'in_progress')
        and start_min < ${start + service.duration_min} and end_min > ${start}`;
    if (clash) fail(409, 'Ya tenés un turno a esa hora.');
  }

  // Productos sumados al turno (se pagan en el local)
  const ids = Array.isArray(input.productIds) ? input.productIds.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  const products = ids.length
    ? await tx<{ id: string; name: string; price: number | null }[]>`
        select id, name, price from products where business_id = ${biz.id} and active and id::text = any(${ids})`
    : [];
  const productsTotal = products.reduce((a, p) => a + (p.price ?? 0), 0);

  const q = await quote(tx, biz, client, service);
  const [appt] = await tx<ApptRow[]>`
    insert into appointments (business_id, client_id, client_name, client_phone, barber_id, service_id, service_name,
                              duration_min, day, start_min, end_min, source, payment, price, discount_pct,
                              discount_reason, final_price, products, products_total, reward_id, loyalty_free,
                              confirmed_at)
    values (${biz.id}, ${client?.id ?? null}, ${client?.name ?? who.name ?? 'Cliente'}, ${client?.phone ?? who.phone ?? null},
            ${barber.id}, ${service.id}, ${service.name}, ${service.duration_min}, ${day}, ${start},
            ${start + service.duration_min}, ${source}, ${payment}, ${service.price}, ${q.pct}, ${q.reason},
            ${q.finalPrice}, ${tx.json(products)}, ${productsTotal}, ${q.rewardId}, ${q.loyaltyFree},
            ${source === 'barbero' ? new Date() : null})
    returning *`;
  if (q.rewardId) {
    await tx`update rewards set status = 'reserved', appointment_id = ${appt.id} where id = ${q.rewardId}`;
  }
  return appt;
}

async function releaseReward(tx: Tx, appt: ApptRow) {
  if (appt.reward_id) {
    await tx`update rewards set status = 'available', appointment_id = null
             where id = ${appt.reward_id} and status = 'reserved'`;
  }
}

async function freeBarberIfCutting(tx: Tx, appt: ApptRow) {
  await tx`update barber_status set state = 'free', free_at = null, appointment_id = null, updated_at = now()
           where barber_id = ${appt.barber_id} and appointment_id = ${appt.id}`;
}

export async function lockAppointment(tx: Tx, bizId: string, id: unknown): Promise<ApptRow> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) fail(404, 'Turno no encontrado.');
  const [a] = await tx<ApptRow[]>`select * from appointments where id = ${id} and business_id = ${bizId} for update`;
  if (!a) fail(404, 'Turno no encontrado.');
  return a;
}

export async function cancelAppointment(tx: Tx, appt: ApptRow): Promise<void> {
  if (appt.status !== 'booked' && appt.status !== 'in_progress') fail(409, 'Ese turno ya estaba cerrado.');
  await tx`update appointments set status = 'cancelled', cancelled_at = now() where id = ${appt.id}`;
  await releaseReward(tx, appt);
  await freeBarberIfCutting(tx, appt);
}

/** "No vino": libera el horario y el beneficio reservado; queda anotado como ausente */
export async function noShowAppointment(tx: Tx, appt: ApptRow, now: Now): Promise<void> {
  if (appt.status !== 'booked') fail(409, 'Ese turno ya estaba cerrado.');
  if (appt.day > now.day || (appt.day === now.day && appt.start_min > now.min)) {
    fail(409, 'Todavía no llegó la hora del turno. Si avisó que no viene, cancelalo.');
  }
  await tx`update appointments set status = 'no_show', cancelled_at = now() where id = ${appt.id}`;
  await releaseReward(tx, appt);
}

/** "Vino · marcar y sellar": registra el corte, suma sellos (doble si corresponde) y libera al barbero */
export async function completeAppointment(tx: Tx, biz: Business, appt: ApptRow, now: Now) {
  if (appt.status !== 'booked' && appt.status !== 'in_progress') fail(409, 'Ese turno ya estaba cerrado.');
  let finalPrice = appt.final_price;
  let pct = appt.discount_pct;
  let reason = appt.discount_reason;
  let result = { free: false, added: 0, double: false, stamps: null as number | null };

  if (appt.client_id) {
    const [c] = await tx<ClientRow[]>`select * from clients where id = ${appt.client_id} for update`;
    if (c) {
      const out = stampOutcome({
        stamps: c.stamps,
        lastVisitOn: c.last_visit_on,
        today: now.day,
        goal: biz.loyalty_goal,
        doubleDays: biz.double_stamp_days,
      });
      if (out.free) {
        pct = 100;
        reason = 'Corte gratis · tarjeta de fidelidad';
        finalPrice = 0;
        await releaseReward(tx, appt);
      } else {
        if (appt.loyalty_free) {
          pct = 0;
          reason = null;
          finalPrice = appt.price;
        }
        if (appt.reward_id) {
          await tx`update rewards set status = 'used', used_at = now() where id = ${appt.reward_id}`;
        }
      }
      await tx`update clients set stamps = ${out.newStamps}, visits = visits + 1, last_visit_on = ${now.day}
               where id = ${c.id}`;
      // Primer corte de un amigo invitado → 20% para quien lo invitó
      if (c.visits === 0 && c.referred_by) {
        await tx`insert into rewards (business_id, client_id, kind, percent, source_client_id)
                 values (${biz.id}, ${c.referred_by}, 'referral', ${biz.referral_percent}, ${c.id})
                 on conflict do nothing`;
      }
      result = { free: out.free, added: out.added, double: out.double, stamps: out.newStamps };
    }
  }
  await tx`update appointments
           set status = 'completed', completed_at = now(), final_price = ${finalPrice}, discount_pct = ${pct},
               discount_reason = ${reason}, loyalty_free = ${result.free}, stamps_added = ${result.added}
           where id = ${appt.id}`;
  await freeBarberIfCutting(tx, appt);
  return result;
}

export async function startCut(tx: Tx, appt: ApptRow, minutes: number) {
  if (appt.status !== 'booked') fail(409, 'Ese turno no se puede empezar.');
  const [busy] = await tx`select 1 from appointments where barber_id = ${appt.barber_id} and status = 'in_progress'`;
  if (busy) fail(409, 'Ya estás cortando a otro cliente. Terminá ese primero.');
  await tx`update appointments set status = 'in_progress', started_at = now(),
                  est_end_at = now() + make_interval(mins => ${minutes})
           where id = ${appt.id}`;
  await tx`update barber_status set state = 'cutting', free_at = now() + make_interval(mins => ${minutes}),
                  appointment_id = ${appt.id}, updated_at = now()
           where barber_id = ${appt.barber_id}`;
}

// ---------------------------------------------------------------------
// En vivo: luz de cada barbero y fila sin turno
// ---------------------------------------------------------------------
export function minutesUntil(d: Date | null): number | null {
  if (!d) return null;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 60000));
}

export async function liveStatus(tx: Tx, biz: Business, now: Now) {
  const rows = await tx<{ barber_id: string; name: string; state: 'free' | 'busy' | 'cutting'; free_at: Date | null }[]>`
    select bs.barber_id, bs.name, bs.state, bs.free_at
    from barber_status bs join staff s on s.id = bs.barber_id
    where bs.business_id = ${biz.id} and s.active
    order by s.sort, s.name`;
  const [{ waiting }] = await tx<{ waiting: number }[]>`
    select count(*)::int as waiting from queue_entries where business_id = ${biz.id} and status = 'waiting'`;
  const services = await activeServices(tx, biz.id);
  const avg = services.length ? services.reduce((a, s) => a + s.duration_min, 0) / services.length : 30;
  const cuts = await businessCuts(tx, biz.id, now.day);
  const open = isOpenAt(biz.hours, now.day, now.min, cuts);
  const next = open ? null : nextOpening(biz.hours, now, cuts);
  const closes = closesAt(biz.hours, now.day, now.min, cuts);
  return {
    open,
    closesAt: closes !== null ? fmtMin(closes) : null,
    nextOpening: next
      ? {
          day: next.day,
          label: next.day === now.day ? 'hoy' : next.day === addDays(now.day, 1) ? 'mañana' : `el ${dayLabel(next.day).toLowerCase()}`,
          time: fmtMin(next.min),
        }
      : null,
    barbers: rows.map((r) => ({
      id: r.barber_id,
      name: r.name,
      state: r.state,
      freeInMin: r.state === 'cutting' ? minutesUntil(r.free_at) : null,
    })),
    queue: { waiting, waitMin: queueWait(waiting, avg, Math.max(1, rows.length)), avgMin: Math.round(avg) },
  };
}

/** Horario corrido de los turnos de hoy de un barbero que está cortando */
export async function shiftedTimes(tx: Tx, bizId: string, barberId: string, day: string, now: Now): Promise<Record<string, number>> {
  const appts = await tx<ApptRow[]>`
    select * from appointments where business_id = ${bizId} and barber_id = ${barberId} and day = ${day}
      and status in ('booked', 'in_progress') order by start_min`;
  return shiftFromRows(appts, day, now);
}

/** Corrimiento de los turnos que siguen al corte en curso, con los turnos del día ya cargados */
export function shiftFromRows(rows: ApptRow[], day: string, now: Now): Record<string, number> {
  const appts = rows.filter((a) => a.status === 'booked' || a.status === 'in_progress').sort((a, b) => a.start_min - b.start_min);
  const cutting = appts.find((a) => a.status === 'in_progress');
  if (!cutting || day !== now.day) return {};
  const left = minutesUntil(cutting.est_end_at) ?? 0;
  return projectShift(
    appts.map((a) => ({ id: a.id, start: a.start_min, duration: a.duration_min, status: a.status })),
    cutting.id,
    now.min + left,
  );
}

export function apptDto(a: ApptRow, extra: { barberName?: string; projected?: number } = {}) {
  return {
    id: a.id,
    day: a.day,
    dayLabel: dayLabel(a.day),
    time: fmtMin(a.start_min),
    start: a.start_min,
    end: a.end_min,
    projectedTime: extra.projected !== undefined ? fmtMin(extra.projected) : null,
    serviceName: a.service_name,
    duration: a.duration_min,
    barberId: a.barber_id,
    barberName: extra.barberName ?? null,
    clientName: a.client_name,
    status: a.status,
    source: a.source,
    payment: a.payment,
    price: a.price,
    discountPct: a.discount_pct,
    discountReason: a.discount_reason,
    finalPrice: a.final_price,
    products: a.products,
    productsTotal: a.products_total,
    total: a.final_price + a.products_total,
    loyaltyFree: a.loyalty_free,
    stampsAdded: a.stamps_added,
    waSent: !!a.wa_sent_at,
    confirmed: !!a.confirmed_at,
    reminded: !!a.reminded_at,
    estEndInMin: a.status === 'in_progress' ? minutesUntil(a.est_end_at) : null,
  };
}
export type ApptDto = ReturnType<typeof apptDto>;

// ---------------------------------------------------------------------
// Bloqueos de agenda (almuerzo, franco, vacaciones, feriados)
// ---------------------------------------------------------------------
export interface NewBlock {
  barberId: string | null; // null = todo el local
  days: string[];
  start: number;
  end: number;
  reason: string | null;
  by: string;
}

/** Crea los bloqueos; si hay turnos reservados en ese horario, no bloquea y avisa cuáles son */
export async function createBlocks(tx: Tx, biz: Business, b: NewBlock, now: Now): Promise<number> {
  if (!b.days.length) fail(400, 'Elegí el día.');
  if (b.days.length > 62) fail(400, 'Como máximo 2 meses de una vez.');
  if (!(b.start >= 0 && b.end <= 1440 && b.end > b.start)) fail(400, 'Revisá el horario: "hasta" tiene que ser después de "desde".');
  for (const day of b.days) {
    if (!isDay(day)) fail(400, 'Fecha inválida.');
    if (day < now.day) fail(400, 'No se pueden bloquear días que ya pasaron.');
  }
  const days = [...new Set(b.days)].sort();
  for (const day of days) await lockDay(tx, biz.id, day);
  const clash = await tx<{ day: string; start_min: number; client_name: string; barber: string }[]>`
    select a.day, a.start_min, a.client_name, s.name as barber
    from appointments a join staff s on s.id = a.barber_id
    where a.business_id = ${biz.id} and a.day = any(${days}::date[])
      and a.status in ('booked', 'in_progress') and a.source <> 'fila'
      and a.start_min < ${b.end} and a.end_min > ${b.start}
      ${b.barberId ? tx`and a.barber_id = ${b.barberId}` : tx``}
    order by a.day, a.start_min
    limit 6`;
  if (clash.length) {
    const list = clash
      .map((c) => `${days.length > 1 ? dayLabel(c.day) + ' ' : ''}${fmtMin(c.start_min)} ${c.client_name}${b.barberId ? '' : ` (${c.barber})`}`)
      .join(', ');
    fail(409, `Hay turnos reservados en ese horario: ${list}. Cancelalos o avisales antes de bloquear.`);
  }
  for (const day of days) {
    await tx`insert into blocks (business_id, barber_id, day, start_min, end_min, reason, created_by)
             values (${biz.id}, ${b.barberId}, ${day}, ${b.start}, ${b.end}, ${b.reason}, ${b.by})`;
  }
  return days.length;
}

export function blockDto(b: BlockRow, names: Record<string, string> = {}) {
  const allDay = b.start_min === 0 && b.end_min === 1440;
  return {
    id: b.id,
    day: b.day,
    dayLabel: dayLabel(b.day),
    barberId: b.barber_id,
    barberName: b.barber_id ? (names[b.barber_id] ?? null) : null,
    allDay,
    from: fmtMin(b.start_min),
    to: b.end_min === 1440 ? '24:00' : fmtMin(b.end_min),
    start: b.start_min,
    end: b.end_min,
    reason: b.reason,
  };
}
export type BlockDto = ReturnType<typeof blockDto>;

/** Lee "día (o desde/hasta), todo el día o desde/hasta hora, motivo" de un formulario */
export function parseBlockInput(body: Record<string, unknown>, opts: { multiDay: boolean }): { days: string[]; start: number; end: number; reason: string | null } {
  const from = body.day ?? body.fromDay;
  if (!isDay(from)) fail(400, 'Elegí el día.');
  let days = [from];
  if (opts.multiDay && body.toDay !== undefined && body.toDay !== '' && body.toDay !== null) {
    const to = body.toDay;
    if (!isDay(to)) fail(400, 'Revisá el día "hasta".');
    if (to < from) fail(400, 'El día "hasta" tiene que ser después del "desde".');
    days = [];
    for (let d = from; d <= to && days.length <= 62; d = addDays(d, 1)) days.push(d);
  }
  let start = 0;
  let end = 1440;
  if (body.allDay !== true) {
    const m1 = /^(\d{2}):(\d{2})$/.exec(String(body.from ?? ''));
    const m2 = /^(\d{2}):(\d{2})$/.exec(String(body.to ?? ''));
    if (!m1 || !m2) fail(400, 'Elegí desde qué hora y hasta qué hora.');
    start = Number(m1[1]) * 60 + Number(m1[2]);
    end = Number(m2[1]) * 60 + Number(m2[2]);
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 60) || null : null;
  return { days, start, end, reason };
}
