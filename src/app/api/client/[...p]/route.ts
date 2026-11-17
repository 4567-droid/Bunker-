import { BAD_CODE, findReferrer, inviteBlock, newReferralCode, normalizeCode, NOT_NEW, rememberFormerClient, wasClientBefore } from '@/lib/clients';
import { clientIp, endSession, endSessionsFor, guardAttempts, recordFailure, startSession } from '@/lib/auth';
import {
  apptDto,
  bizNow,
  businessCuts,
  cancelAppointment,
  createAppointment,
  getService,
  liveStatus,
  lockAppointment,
  quote,
  shiftedTimes,
  type ApptRow,
} from '@/lib/booking';
import { currentBusiness, type Business } from '@/lib/business';
import { tenantTx, type Tx } from '@/lib/db';
import { areaFromWhatsapp, firstName, isEmail, money, normalizePhone, phoneDisplay } from '@/lib/format';
import { fail, json, notFound, readBody, route, str } from '@/lib/http';
import { nextIsFree } from '@/lib/rules';
import { currentClient, requireClient, type ClientRow } from '@/lib/session';
import { dayLabel, fmtMin, isOpenAt, zonedToUtc, type Now } from '@/lib/time';

export const dynamic = 'force-dynamic';

function readPhone(raw: string, biz: Business): string {
  const phone = normalizePhone(raw, areaFromWhatsapp(biz.whatsapp));
  if (!phone) fail(400, 'Revisá el teléfono: tiene que tener entre 6 y 15 números. Ej: 362 412-3456');
  return phone;
}

async function mePayload(tx: Tx, biz: Business, c: ClientRow, now: Now) {
  const appts = await tx<(ApptRow & { barber_name: string })[]>`
    select a.*, s.name as barber_name from appointments a join staff s on s.id = a.barber_id
    where a.client_id = ${c.id} and a.status in ('booked', 'in_progress')
      and (a.day > ${now.day} or (a.day = ${now.day} and a.end_min > ${now.min - 60}))
    order by a.day, a.start_min`;
  const upcoming = [];
  for (const a of appts) {
    const shifted = a.day === now.day ? await shiftedTimes(tx, biz.id, a.barber_id, a.day, now) : {};
    upcoming.push(apptDto(a, { barberName: a.barber_name, projected: shifted[a.id] }));
  }
  const rewards = await tx<{ id: string; kind: string; percent: number; status: string; source_name: string | null }[]>`
    select r.id, r.kind, r.percent, r.status, sc.name as source_name
    from rewards r left join clients sc on sc.id = r.source_client_id
    where r.client_id = ${c.id} and r.status in ('available', 'reserved') order by r.created_at`;
  const [ref] = await tx<{ invited: number; rewarded: number }[]>`
    select (select count(*)::int from clients where referred_by = ${c.id}) as invited,
           (select count(*)::int from rewards where client_id = ${c.id} and kind = 'referral') as rewarded`;
  const [entry] = await tx<{ id: string; status: string; created_at: Date }[]>`
    select id, status, created_at from queue_entries
    where client_id = ${c.id} and status in ('waiting', 'called') limit 1`;
  const past = await tx<{ id: string; day: string; service_name: string; barber_name: string; status: string; stamps_added: number; loyalty_free: boolean; final_price: number; discount_pct: number }[]>`
    select a.id, a.day, a.service_name, s.name as barber_name, a.status, a.stamps_added, a.loyalty_free, a.final_price, a.discount_pct
    from appointments a join staff s on s.id = a.barber_id
    where a.client_id = ${c.id} and a.status in ('completed', 'no_show')
    order by a.day desc, a.start_min desc limit 10`;
  // Invitación: si todavía puede cargar el código de un amigo, y quién lo invitó
  const [by] = c.referred_by ? await tx<{ name: string }[]>`select name from clients where id = ${c.referred_by}` : [];
  const invite = { canUse: (await inviteBlock(tx, biz, c)) === null, by: by ? firstName(by.name) : null, percent: biz.referral_percent };
  let queue = null;
  if (entry) {
    const [{ ahead }] = await tx<{ ahead: number }[]>`
      select count(*)::int as ahead from queue_entries
      where business_id = ${biz.id} and status = 'waiting' and created_at < ${entry.created_at}`;
    const live = await liveStatus(tx, biz, now);
    const per = live.queue.avgMin / Math.max(1, live.barbers.length);
    queue = {
      id: entry.id,
      status: entry.status,
      position: ahead + 1,
      waitMin: entry.status === 'called' ? 0 : Math.max(5, Math.round((ahead * per) / 5) * 5),
    };
  }
  return {
    client: {
      id: c.id,
      name: c.name,
      firstName: firstName(c.name),
      phone: c.phone,
      phoneDisplay: phoneDisplay(c.phone),
      email: c.email,
      referralCode: c.referral_code,
      stamps: c.stamps,
      visits: c.visits,
      lastVisitOn: c.last_visit_on,
      nextFree: nextIsFree(c.stamps, biz.loyalty_goal),
    },
    upcoming,
    history: past.map((h) => ({
      id: h.id,
      dayLabel: dayLabel(h.day),
      serviceName: h.service_name,
      barberName: h.barber_name,
      status: h.status,
      stampsAdded: h.stamps_added,
      free: h.loyalty_free,
      discountPct: h.discount_pct,
      paid: h.final_price,
    })),
    rewards: rewards.map((r) => ({
      id: r.id,
      kind: r.kind,
      percent: r.percent,
      status: r.status,
      from: r.source_name ? firstName(r.source_name) : null,
    })),
    referrals: ref,
    invite,
    queue,
  };
}

/**
 * Carga el código de invitación de un amigo: crea el 20% de bienvenida y, si ya tiene un turno
 * reservado, se lo aplica a ese turno. Una sola vez y solo si nunca se cortó en el local.
 */
async function useInvite(tx: Tx, biz: Business, c: ClientRow, rawCode: unknown) {
  const code = normalizeCode(rawCode);
  if (!code) fail(400, 'Escribí el código de invitación.');
  const referrer = await findReferrer(tx, biz.id, code);
  if (!referrer) fail(400, BAD_CODE, 'bad_ref');
  if (referrer.id === c.id) fail(400, 'Ese es tu propio código: pasáselo a un amigo.');
  if (referrer.referred_by === c.id) fail(409, 'Ese amigo entró con tu código: no pueden usar el código uno del otro.');
  const [fresh] = await tx<ClientRow[]>`select * from clients where id = ${c.id} for update`;
  const why = await inviteBlock(tx, biz, fresh);
  if (why) fail(409, why);
  await tx`update clients set referred_by = ${referrer.id} where id = ${c.id}`;
  const [reward] = await tx<{ id: string }[]>`
    insert into rewards (business_id, client_id, kind, percent, source_client_id)
    values (${biz.id}, ${c.id}, 'welcome', ${biz.referral_percent}, ${referrer.id}) returning id`;
  // Si ya reservó, el descuento va a ese turno (el próximo que no tenga otro descuento)
  const [next] = await tx<ApptRow[]>`
    select * from appointments
    where client_id = ${c.id} and status = 'booked' and reward_id is null and not loyalty_free
      and discount_pct = 0 and price > 0
    order by day, start_min limit 1 for update`;
  if (next) {
    const pct = biz.referral_percent;
    await tx`update appointments
             set discount_pct = ${pct}, discount_reason = ${`${pct}% de bienvenida (te invitó un amigo)`},
                 final_price = ${Math.round((next.price * (100 - pct)) / 100)}, reward_id = ${reward.id}
             where id = ${next.id}`;
    await tx`update rewards set status = 'reserved', appointment_id = ${next.id} where id = ${reward.id}`;
  }
  return { name: firstName(referrer.name), appliedTo: next ? `${dayLabel(next.day)} ${fmtMin(next.start_min)}` : null };
}

async function currentClientById(id: string): Promise<ClientRow | null> {
  const biz = await currentBusiness();
  const [c] = await tenantTx(biz.id, (tx) => tx<ClientRow[]>`select * from clients where id = ${id}`);
  return c ?? null;
}

async function ownAppointment(tx: Tx, biz: Business, c: ClientRow, id: unknown) {
  const a = await lockAppointment(tx, biz.id, id);
  if (a.client_id !== c.id) fail(404, 'Turno no encontrado.');
  return a;
}

export const GET = route(async (req, [action]) => {
  const biz = await currentBusiness();
  const now = bizNow(biz);
  switch (action) {
    case 'me': {
      const c = await currentClient(biz);
      if (!c) return json({ client: null });
      return json(await tenantTx(biz.id, (tx) => mePayload(tx, biz, c, now)));
    }
    case 'quote': {
      const c = await currentClient(biz);
      const serviceId = new URL(req.url).searchParams.get('service');
      return json(
        await tenantTx(biz.id, async (tx) => {
          const s = await getService(tx, biz.id, serviceId);
          const q = await quote(tx, biz, c, s);
          return { price: q.price, discountPct: q.pct, reason: q.reason, finalPrice: q.finalPrice };
        }),
      );
    }
    case 'ics': {
      const c = await requireClient(biz);
      const id = new URL(req.url).searchParams.get('id');
      const a = await tenantTx(biz.id, async (tx) => {
        const row = await ownAppointment(tx, biz, c, id);
        const [b] = await tx<{ name: string }[]>`select name from staff where id = ${row.barber_id}`;
        return { ...row, barber_name: b?.name ?? '' };
      });
      const start = zonedToUtc(a.day, a.start_min, biz.timezone);
      const end = zonedToUtc(a.day, a.end_min, biz.timezone);
      const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n');
      const where = [biz.address, biz.city].filter(Boolean).join(', ') || biz.name;
      const total = a.final_price + a.products_total;
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Turnos//ES',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${a.id}@${biz.slug}`,
        `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(end)}`,
        `SUMMARY:${esc(`${a.service_name} en ${biz.name}`)}`,
        `LOCATION:${esc(where)}`,
        `DESCRIPTION:${esc(`Con ${a.barber_name}. Total ${money(total)}. Si no podés venir, avisá por WhatsApp.`)}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT2H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(`Turno en ${biz.name}`)}`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n');
      return new Response(ics, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="turno-${biz.slug}-${a.day}.ics"`,
          'Cache-Control': 'no-store',
        },
      });
    }
  }
  notFound();
});

export const POST = route(async (req, [action]) => {
  const biz = await currentBusiness();
  const now = bizNow(biz);
  const body = await readBody(req);

  switch (action) {
    case 'register': {
      const ip = await clientIp();
      await guardAttempts([`reg:${ip}`], 15, 60);
      const name = str(body, 'name', { min: 3, max: 80, label: 'el nombre y apellido' }).replace(/\s+/g, ' ');
      if (!/\S+\s+\S+/.test(name)) fail(400, 'Escribí tu nombre y apellido.');
      const phone = readPhone(str(body, 'phone', { max: 30, label: 'el teléfono' }), biz);
      const email = str(body, 'email', { optional: true, max: 120 }).toLowerCase();
      if (email && !isEmail(email)) fail(400, 'Revisá el correo electrónico.');
      const ref = normalizeCode(str(body, 'ref', { optional: true, max: 30 }));

      // Ya tenía cuenta con ese teléfono: entra como en "Ya tengo cuenta" (teléfono, y el correo si cargó uno)
      const [existing] = await tenantTx(biz.id, (tx) => tx<ClientRow[]>`
        select * from clients where business_id = ${biz.id} and phone = ${phone}`);
      if (existing) {
        const keys = [`cl:${ip}`, `cl:${biz.id}:${phone}`];
        await guardAttempts(keys);
        if (existing.email && existing.email.toLowerCase() !== email) {
          await recordFailure(keys);
          fail(409, 'Ese teléfono ya tiene cuenta. Para entrar, escribí el correo con el que te registraste.', 'needs_email');
        }
        await startSession('client', { businessId: biz.id, clientId: existing.id });
        // Si trajo un código y todavía puede usarlo (nunca se cortó), se le aplica; si no, se le avisa
        let notice: string | null = null;
        if (ref) {
          try {
            const r = await tenantTx(biz.id, (tx) => useInvite(tx, biz, existing, ref));
            notice = `Ya tenías cuenta: entraste. Te invitó ${r.name}: tenés ${biz.referral_percent}% en tu primer corte.`;
          } catch (e) {
            notice = `Ya tenías cuenta: entraste. ${(e as Error).message}`;
          }
        }
        const fresh = (await currentClientById(existing.id)) ?? existing;
        return json({ ...(await tenantTx(biz.id, (tx) => mePayload(tx, biz, fresh, now))), notice });
      }

      const client = await tenantTx(biz.id, async (tx) => {
        const [exists] = await tx`select 1 from clients where business_id = ${biz.id} and phone = ${phone}`;
        if (exists) fail(409, 'Ese teléfono ya tiene cuenta. Tocá "Ya tengo cuenta" para entrar.');
        let referredBy: string | null = null;
        if (ref) {
          // Un código mal escrito no se ignora en silencio: se avisa para que lo corrija o lo borre
          const r = await findReferrer(tx, biz.id, ref);
          if (!r) fail(400, BAD_CODE, 'bad_ref');
          if (await wasClientBefore(tx, biz.id, phone)) fail(409, `${NOT_NEW} Borrá el código para seguir.`, 'ref_not_new');
          referredBy = r.id;
        }
        const code = await newReferralCode(tx, biz.id, name);
        const [c] = await tx<ClientRow[]>`
          insert into clients (business_id, name, phone, email, referral_code, referred_by)
          values (${biz.id}, ${name}, ${phone}, ${email || null}, ${code}, ${referredBy})
          returning *`;
        if (referredBy && biz.referral_percent > 0) {
          await tx`insert into rewards (business_id, client_id, kind, percent, source_client_id)
                   values (${biz.id}, ${c.id}, 'welcome', ${biz.referral_percent}, ${referredBy})`;
        }
        return c;
      });
      await recordFailure([`reg:${ip}`]); // cuenta altas por conexión (freno a spam)
      await startSession('client', { businessId: biz.id, clientId: client.id });
      return json(await tenantTx(biz.id, (tx) => mePayload(tx, biz, client, now)), 201);
    }

    case 'login': {
      const phone = readPhone(str(body, 'phone', { max: 30, label: 'el teléfono' }), biz);
      const email = str(body, 'email', { optional: true, max: 120 }).toLowerCase();
      const ip = await clientIp();
      const keys = [`cl:${ip}`, `cl:${biz.id}:${phone}`];
      await guardAttempts(keys);
      const [c] = await tenantTx(biz.id, (tx) => tx<ClientRow[]>`
        select * from clients where business_id = ${biz.id} and phone = ${phone}`);
      if (!c) {
        await recordFailure(keys);
        fail(404, 'No encontramos una cuenta con ese teléfono. Creala en un minuto.');
      }
      if (c.email && c.email.toLowerCase() !== email) {
        await recordFailure(keys);
        fail(401, email ? 'Ese correo no coincide con el de tu cuenta.' : 'Escribí también el correo con el que te registraste.');
      }
      await startSession('client', { businessId: biz.id, clientId: c.id });
      return json(await tenantTx(biz.id, (tx) => mePayload(tx, biz, c, now)));
    }

    case 'logout':
      await endSession('client');
      return json({ ok: true });

    case 'book': {
      const c = await requireClient(biz);
      const appt = await tenantTx(biz.id, async (tx) => {
        const a = await createAppointment(tx, biz, { client: c }, { serviceId: body.serviceId, day: body.day, time: body.time, barberId: body.barberId, payment: body.payment, productIds: body.productIds }, now, "web");
        const [b] = await tx<{ name: string }[]>`select name from staff where id = ${a.barber_id}`;
        return apptDto(a, { barberName: b?.name });
      });
      return json({ appointment: appt }, 201);
    }

    case 'cancel': {
      const c = await requireClient(biz);
      await tenantTx(biz.id, async (tx) => {
        const a = await ownAppointment(tx, biz, c, body.id);
        if (a.status !== 'booked') fail(409, 'Ese turno ya no se puede cancelar.');
        const minutesLeft = a.day > now.day ? Infinity : a.day < now.day ? -1 : a.start_min - now.min;
        // "Cambiar turno" justo después de reservar siempre se puede (10 min de gracia)
        const justBooked = Date.now() - new Date(a.created_at).getTime() < 10 * 60_000;
        if (minutesLeft < biz.cancel_limit_min && !justBooked) {
          fail(409, `Faltan menos de ${biz.cancel_limit_min} minutos. Avisá por WhatsApp a la barbería.`);
        }
        await cancelAppointment(tx, a);
      });
      return json({ ok: true });
    }

    case 'whatsapp': {
      const c = await requireClient(biz);
      await tenantTx(biz.id, async (tx) => {
        const a = await ownAppointment(tx, biz, c, body.id);
        await tx`update appointments set wa_sent_at = coalesce(wa_sent_at, now()) where id = ${a.id}`;
      });
      return json({ ok: true });
    }

    case 'update': {
      const c = await requireClient(biz);
      const name = str(body, 'name', { min: 3, max: 80, label: 'el nombre y apellido' }).replace(/\s+/g, ' ');
      if (!/\S+\s+\S+/.test(name)) fail(400, 'Escribí tu nombre y apellido.');
      const email = str(body, 'email', { optional: true, max: 120 }).toLowerCase();
      if (email && !isEmail(email)) fail(400, 'Revisá el correo electrónico.');
      const updated = await tenantTx(biz.id, async (tx) => {
        const [row] = await tx<ClientRow[]>`
          update clients set name = ${name}, email = ${email || null} where id = ${c.id} returning *`;
        await tx`update appointments set client_name = ${name}
                 where client_id = ${c.id} and status in ('booked', 'in_progress')`;
        await tx`update queue_entries set name = ${name} where client_id = ${c.id} and status in ('waiting', 'called')`;
        return row;
      });
      return json(await tenantTx(biz.id, (tx) => mePayload(tx, biz, updated, now)));
    }

    case 'delete': {
      const c = await requireClient(biz);
      if (body.confirm !== true) fail(400, 'Confirmá que querés borrar tu cuenta.');
      await tenantTx(biz.id, async (tx) => {
        const open = await tx<ApptRow[]>`
          select * from appointments where client_id = ${c.id} and status in ('booked', 'in_progress') for update`;
        for (const a of open) await cancelAppointment(tx, a);
        // Los cortes viejos quedan para las cuentas del local, pero sin datos personales
        await tx`update appointments set client_name = 'Cliente eliminado', client_phone = null where client_id = ${c.id}`;
        // Solo la huella del teléfono (no el número): así no vuelve a usar el 20% de invitación
        await rememberFormerClient(tx, biz.id, c.phone);
        await tx`delete from clients where id = ${c.id}`;
      });
      await endSessionsFor({ clientId: c.id });
      await endSession('client');
      return json({ ok: true });
    }

    case 'referral': {
      // Cargar el código de un amigo después de crear la cuenta (hasta el primer corte, una sola vez)
      const c = await requireClient(biz);
      const ip = await clientIp();
      await guardAttempts([`ref:${ip}`]);
      let used: { name: string; appliedTo: string | null };
      try {
        used = await tenantTx(biz.id, (tx) => useInvite(tx, biz, c, body.code));
      } catch (e) {
        if ((e as { code?: string }).code === 'bad_ref') await recordFailure([`ref:${ip}`]);
        throw e;
      }
      const fresh = (await currentClientById(c.id)) ?? c;
      return json({
        ...(await tenantTx(biz.id, (tx) => mePayload(tx, biz, fresh, now))),
        notice: `Listo: te invitó ${used.name}. Tenés ${biz.referral_percent}% en tu primer corte${used.appliedTo ? ` (ya aplicado a tu turno del ${used.appliedTo.toLowerCase()})` : ''}.`,
      });
    }

    case 'confirm': {
      const c = await requireClient(biz);
      await tenantTx(biz.id, async (tx) => {
        const a = await ownAppointment(tx, biz, c, body.id);
        if (a.status !== 'booked') fail(409, 'Ese turno ya no está activo.');
        await tx`update appointments set confirmed_at = coalesce(confirmed_at, now()) where id = ${a.id}`;
      });
      return json({ ok: true });
    }

    case 'queue': {
      const c = await requireClient(biz);
      const join = body.action === 'join';
      await tenantTx(biz.id, async (tx) => {
        if (join) {
          if (!isOpenAt(biz.hours, now.day, now.min, await businessCuts(tx, biz.id, now.day, 0))) {
            fail(409, 'Ahora estamos cerrados. Anotate cuando abramos.');
          }
          const [already] = await tx`select 1 from queue_entries where client_id = ${c.id} and status in ('waiting', 'called')`;
          if (already) fail(409, 'Ya estás en la fila.');
          await tx`insert into queue_entries (business_id, client_id, name, phone)
                   values (${biz.id}, ${c.id}, ${c.name}, ${c.phone})`;
        } else {
          await tx`update queue_entries set status = 'left'
                   where client_id = ${c.id} and status in ('waiting', 'called')`;
        }
      });
      return json({ ok: true });
    }
  }
  notFound();
});
