import {
  apptDto,
  bizNow,
  blockDto,
  createBlocks,
  loadBlocks,
  noShowAppointment,
  parseBlockInput,
  cancelAppointment,
  completeAppointment,
  createAppointment,
  getService,
  listSlots,
  lockAppointment,
  minutesUntil,
  quote,
  shiftFromRows,
  startCut,
  type ApptRow,
} from '@/lib/booking';
import { currentBusiness, type Business } from '@/lib/business';
import { tenantTx, type Tx } from '@/lib/db';
import { areaFromWhatsapp, firstName, normalizePhone, phoneDisplay } from '@/lib/format';
import { fail, int, json, notFound, readBody, route, str, uuid } from '@/lib/http';
import { nextIsFree } from '@/lib/rules';
import { requireStaff, type ClientRow, type StaffRow } from '@/lib/session';
import { newReferralCode } from '@/lib/clients';
import { addDays, daysBetween, fmtMin, isDay, type Now } from '@/lib/time';

export const dynamic = 'force-dynamic';

const EST_OPTIONS = [10, 15, 20, 30, 45, 60];

type AgendaRow = ApptRow & {
  c_stamps: number | null;
  c_email: string | null;
  c_last_visit_on: string | null;
  c_visits: number | null;
  c_no_shows: number | null;
};

async function agenda(tx: Tx, biz: Business, st: StaffRow, day: string, now: Now) {
  const rows = await tx<AgendaRow[]>`
    select a.*, c.stamps as c_stamps, c.email as c_email, c.last_visit_on as c_last_visit_on, c.visits as c_visits,
           (select count(*)::int from appointments x where x.client_id = a.client_id and x.status = 'no_show') as c_no_shows
    from appointments a left join clients c on c.id = a.client_id
    where a.business_id = ${biz.id} and a.barber_id = ${st.id} and a.day = ${day}
      and a.status not in ('cancelled')
    order by a.start_min`;
  const shifted = shiftFromRows(rows, day, now);
  const [status] = await tx<{ state: string; free_at: Date | null; appointment_id: string | null }[]>`
    select state, free_at, appointment_id from barber_status where barber_id = ${st.id}`;
  const cuttingRow = rows.find((r) => r.status === 'in_progress') ?? null;
  const left = cuttingRow ? (minutesUntil(cuttingRow.est_end_at) ?? 0) : 0;
  const list = rows.map((r) => {
    const stamps = r.c_stamps ?? 0;
    const double =
      !!r.c_last_visit_on && biz.double_stamp_days > 0 && daysBetween(r.c_last_visit_on, now.day) <= biz.double_stamp_days;
    return {
      ...apptDto(r, { projected: shifted[r.id] }),
      client: {
        id: r.client_id,
        name: r.client_name,
        phone: r.client_phone,
        phoneDisplay: phoneDisplay(r.client_phone),
        email: r.c_email,
        stamps: r.client_id ? stamps : null,
        nextFree: r.client_id ? nextIsFree(stamps, biz.loyalty_goal) : false,
        doubleStamp: !!r.client_id && double,
        visits: r.c_visits ?? 0,
        noShows: r.c_no_shows ?? 0,
      },
    };
  });
  const dayBlocks = (await loadBlocks(tx, biz.id, day, day)).filter((b) => !b.barber_id || b.barber_id === st.id);
  const next = cuttingRow
    ? list.find((r) => r.status === 'booked' && r.start >= cuttingRow.start_min) ?? null
    : null;
  return {
    day,
    today: now.day,
    now: fmtMin(now.min),
    goal: biz.loyalty_goal,
    barber: { id: st.id, name: st.name },
    status: {
      state: (status?.state ?? 'free') as 'free' | 'busy' | 'cutting',
      freeInMin: status?.state === 'cutting' ? minutesUntil(status.free_at) : null,
    },
    counters: {
      total: list.filter((r) => r.source !== 'fila').length,
      confirmed: list.filter((r) => r.source !== 'fila' && (r.confirmed || r.status === 'completed')).length,
      done: list.filter((r) => r.status === 'completed').length,
      noShow: list.filter((r) => r.status === 'no_show').length,
    },
    rows: list,
    blocks: dayBlocks.map((b) => ({ ...blockDto(b), mine: b.barber_id === st.id })),
    cutting: cuttingRow ? { id: cuttingRow.id, leftMin: left, endTime: fmtMin(Math.min(1439, now.min + left)) } : null,
    next: next
      ? {
          id: next.id,
          name: firstName(next.clientName),
          phone: next.client.phone,
          time: next.time,
          newTime: next.projectedTime,
        }
      : null,
  };
}

async function myAppointment(tx: Tx, biz: Business, st: StaffRow, id: unknown) {
  const a = await lockAppointment(tx, biz.id, id);
  if (a.barber_id !== st.id) fail(404, 'Ese turno no es tuyo.');
  return a;
}

async function queueList(tx: Tx, biz: Business, st: StaffRow) {
  const rows = await tx<{ id: string; name: string; phone: string | null; status: string; called_by: string | null; client_id: string | null; called_at: Date | null }[]>`
    select id, name, phone, status, called_by, client_id, called_at from queue_entries
    where business_id = ${biz.id}
      and (status = 'waiting' or (status = 'called' and called_by = ${st.id}))
    order by created_at`;
  const waiting = rows.filter((r) => r.status === 'waiting');
  return {
    waiting: waiting.map((r, i) => ({ id: r.id, name: r.name, position: i + 1, hasAccount: !!r.client_id })),
    called: rows
      .filter((r) => r.status === 'called')
      .map((r) => ({ id: r.id, name: r.name, phone: r.phone, phoneDisplay: phoneDisplay(r.phone), hasAccount: !!r.client_id })),
  };
}

async function findOrCreateClient(tx: Tx, biz: Business, name: string, phone: string | null): Promise<ClientRow | null> {
  if (!phone) return null;
  const [c] = await tx<ClientRow[]>`select * from clients where business_id = ${biz.id} and phone = ${phone}`;
  if (c) return c;
  const code = await newReferralCode(tx, biz.id, name);
  const [created] = await tx<ClientRow[]>`
    insert into clients (business_id, name, phone, referral_code, source)
    values (${biz.id}, ${name}, ${phone}, ${code}, 'barbero') returning *`;
  return created;
}

export const GET = route(async (req, [action]) => {
  const biz = await currentBusiness();
  const st = await requireStaff(biz, ['barber']);
  const now = bizNow(biz);
  const q = new URL(req.url).searchParams;
  switch (action) {
    case 'agenda': {
      const day = isDay(q.get('day')) ? (q.get('day') as string) : now.day;
      return json(await tenantTx(biz.id, (tx) => agenda(tx, biz, st, day, now)));
    }
    case 'queue':
      return json(await tenantTx(biz.id, (tx) => queueList(tx, biz, st)));
    case 'slots': {
      const day = isDay(q.get('day')) ? (q.get('day') as string) : now.day;
      return json(
        await tenantTx(biz.id, async (tx) => {
          const s = await getService(tx, biz.id, q.get('service'));
          return { day, slots: await listSlots(tx, biz, s, day, now, { barberId: st.id, anyTime: true }) };
        }),
      );
    }
    case 'clients': {
      const rows = await tenantTx(biz.id, (tx) => tx<(ClientRow & { last_day: string | null })[]>`
        select c.*, max(a.day) as last_day from clients c
        join appointments a on a.client_id = c.id and a.barber_id = ${st.id}
        where c.business_id = ${biz.id}
        group by c.id order by max(a.day) desc nulls last, c.name limit 300`);
      return json({
        goal: biz.loyalty_goal,
        clients: rows.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          phoneDisplay: phoneDisplay(c.phone),
          email: c.email,
          stamps: c.stamps,
          visits: c.visits,
          lastDay: c.last_day,
        })),
      });
    }
    case 'days': {
      const days = Array.from({ length: Math.max(7, biz.booking_days) }, (_, i) => addDays(now.day, i));
      return json({ today: now.day, days, hours: biz.hours, slotStep: biz.slot_step });
    }
    case 'blocks': {
      const rows = await tenantTx(biz.id, (tx) => loadBlocks(tx, biz.id, now.day, addDays(now.day, 120)));
      return json({
        blocks: rows
          .filter((b) => !b.barber_id || b.barber_id === st.id)
          .map((b) => ({ ...blockDto(b), mine: b.barber_id === st.id })),
      });
    }
  }
  notFound();
});

export const POST = route(async (req, path) => {
  const biz = await currentBusiness();
  const st = await requireStaff(biz, ['barber']);
  const now = bizNow(biz);
  const body = await readBody(req);
  const [action, sub] = path;
  // Con ?view=<día> la respuesta trae la agenda y la fila ya actualizadas: el celular no tiene que volver a pedirlas
  const view = new URL(req.url).searchParams.get('view');
  const done = async (data: Record<string, unknown>, status = 200) => {
    if (!isDay(view)) return json(data, status);
    const fresh = await tenantTx(biz.id, async (tx) => ({
      agenda: await agenda(tx, biz, st, view as string, bizNow(biz)),
      queue: await queueList(tx, biz, st),
    }));
    return json({ ...data, ...fresh }, status);
  };

  switch (action) {
    case 'start': {
      const minutes = int(body, 'minutes', { min: 5, max: 120, label: 'el tiempo' });
      if (!EST_OPTIONS.includes(minutes)) fail(400, 'Elegí cuánto tardás.');
      await tenantTx(biz.id, async (tx) => startCut(tx, await myAppointment(tx, biz, st, body.id), minutes));
      return done({ ok: true });
    }
    case 'complete': {
      const result = await tenantTx(biz.id, async (tx) => {
        const id = body.id ?? (await tx<{ appointment_id: string | null }[]>`
          select appointment_id from barber_status where barber_id = ${st.id}`)[0]?.appointment_id;
        if (!id) fail(409, 'No estás cortando a nadie ahora.');
        return completeAppointment(tx, biz, await myAppointment(tx, biz, st, id), now);
      });
      return done({ ok: true, ...result });
    }
    case 'cancel':
      await tenantTx(biz.id, async (tx) => cancelAppointment(tx, await myAppointment(tx, biz, st, body.id)));
      return done({ ok: true });

    case 'noshow':
      await tenantTx(biz.id, async (tx) => noShowAppointment(tx, await myAppointment(tx, biz, st, body.id), now));
      return done({ ok: true });

    case 'remind':
      await tenantTx(biz.id, async (tx) => {
        const a = await myAppointment(tx, biz, st, body.id);
        await tx`update appointments set reminded_at = now() where id = ${a.id}`;
      });
      return done({ ok: true });

    case 'block': {
      if (sub === 'delete') {
        await tenantTx(biz.id, async (tx) => {
          const r = await tx`delete from blocks where id = ${uuid(body.id)} and business_id = ${biz.id} and barber_id = ${st.id}`;
          if (!r.count) fail(404, 'Ese bloqueo no es tuyo o ya no existe.');
        });
        return done({ ok: true });
      }
      const input = parseBlockInput(body, { multiDay: true });
      const n = await tenantTx(biz.id, (tx) => createBlocks(tx, biz, { ...input, barberId: st.id, by: st.id }, now));
      return done({ ok: true, days: n }, 201);
    }

    case 'status': {
      const state = body.state;
      if (state !== 'free' && state !== 'busy') fail(400, 'Estado inválido.');
      await tenantTx(biz.id, async (tx) => {
        const [cur] = await tx<{ state: string }[]>`select state from barber_status where barber_id = ${st.id}`;
        if (cur?.state === 'cutting') fail(409, 'Estás cortando: tocá "Terminé" para quedar libre.');
        await tx`insert into barber_status (barber_id, business_id, name, state)
                 values (${st.id}, ${biz.id}, ${st.name}, ${state})
                 on conflict (barber_id) do update set state = ${state}, free_at = null, appointment_id = null, updated_at = now()`;
      });
      return done({ ok: true });
    }

    case 'queue': {
      const out = await tenantTx(biz.id, async (tx) => {
        if (sub === 'call') {
          const [next] = await tx<{ id: string }[]>`
            select id from queue_entries where business_id = ${biz.id} and status = 'waiting'
            order by created_at limit 1 for update skip locked`;
          if (!next) fail(409, 'No hay nadie esperando.');
          await tx`update queue_entries set status = 'called', called_by = ${st.id}, called_at = now() where id = ${next.id}`;
        } else if (sub === 'add') {
          const name = str(body, 'name', { min: 2, max: 60, label: 'el nombre' });
          const phone = body.phone ? normalizePhone(String(body.phone), areaFromWhatsapp(biz.whatsapp)) : null;
          await tx`insert into queue_entries (business_id, name, phone) values (${biz.id}, ${name}, ${phone})`;
        } else if (sub === 'leave') {
          await tx`update queue_entries set status = 'left' where id = ${uuid(body.id)} and business_id = ${biz.id}`;
        } else if (sub === 'serve') {
          // Atendió a alguien de la fila: queda registrado el corte (y su sello si tiene cuenta)
          const [e] = await tx<{ id: string; name: string; phone: string | null; client_id: string | null; status: string }[]>`
            select id, name, phone, client_id, status from queue_entries
            where id = ${uuid(body.id)} and business_id = ${biz.id} for update`;
          if (!e || e.status === 'served' || e.status === 'left') fail(409, 'Esa persona ya no está en la fila.');
          const service = await getService(tx, biz.id, body.serviceId);
          const [c] = e.client_id ? await tx<ClientRow[]>`select * from clients where id = ${e.client_id}` : [];
          const qt = await quote(tx, biz, c ?? null, service);
          const start = Math.max(0, Math.min(now.min, 1440 - service.duration_min));
          const [a] = await tx<ApptRow[]>`
            insert into appointments (business_id, client_id, client_name, client_phone, barber_id, service_id, service_name,
                                      duration_min, day, start_min, end_min, source, price, discount_pct, discount_reason,
                                      final_price, reward_id, loyalty_free, confirmed_at)
            values (${biz.id}, ${e.client_id}, ${e.name}, ${e.phone}, ${st.id}, ${service.id}, ${service.name},
                    ${service.duration_min}, ${now.day}, ${start}, ${start + service.duration_min}, 'fila', ${service.price},
                    ${qt.pct}, ${qt.reason}, ${qt.finalPrice}, ${qt.rewardId}, ${qt.loyaltyFree}, now())
            returning *`;
          if (qt.rewardId) await tx`update rewards set status = 'reserved', appointment_id = ${a.id} where id = ${qt.rewardId}`;
          await completeAppointment(tx, biz, a, now);
          await tx`update queue_entries set status = 'served' where id = ${e.id}`;
        } else {
          notFound();
        }
        return queueList(tx, biz, st);
      });
      return done(out);
    }

    case 'appointments': {
      const name = str(body, 'name', { min: 2, max: 80, label: 'el nombre del cliente' });
      const phoneRaw = str(body, 'phone', { optional: true, max: 30 });
      const phone = phoneRaw ? normalizePhone(phoneRaw, areaFromWhatsapp(biz.whatsapp)) : null;
      if (phoneRaw && !phone) fail(400, 'Revisá el teléfono: tiene que tener entre 6 y 15 números.');
      const appt = await tenantTx(biz.id, async (tx) => {
        const client = await findOrCreateClient(tx, biz, name, phone);
        const a = await createAppointment(
          tx,
          biz,
          { client, name, phone },
          { serviceId: body.serviceId, day: body.day ?? now.day, time: body.time, barberId: st.id },
          now,
          'barbero',
        );
        return apptDto(a, { barberName: st.name });
      });
      return done({ appointment: appt }, 201);
    }
  }
  notFound();
});
