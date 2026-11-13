import { newReferralCode } from '@/lib/clients';
import { clientIp, endSession, guardAttempts, recordFailure, startSession } from '@/lib/auth';
import {
  apptDto,
  bizNow,
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
import { firstName, isEmail, normalizePhone, phoneDisplay } from '@/lib/format';
import { fail, json, notFound, readBody, route, str } from '@/lib/http';
import { nextIsFree } from '@/lib/rules';
import { currentClient, requireClient, type ClientRow } from '@/lib/session';
import { isOpenAt, type Now } from '@/lib/time';

export const dynamic = 'force-dynamic';

function readPhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) fail(400, 'Revisá el teléfono: código de área y número, sin 0 ni 15. Ej: 362 549-3647');
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
    rewards: rewards.map((r) => ({
      id: r.id,
      kind: r.kind,
      percent: r.percent,
      status: r.status,
      from: r.source_name ? firstName(r.source_name) : null,
    })),
    referrals: ref,
    queue,
  };
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
      const phone = readPhone(str(body, 'phone', { max: 30, label: 'el teléfono' }));
      const email = str(body, 'email', { optional: true, max: 120 }).toLowerCase();
      if (email && !isEmail(email)) fail(400, 'Revisá el correo electrónico.');
      const ref = str(body, 'ref', { optional: true, max: 20 }).toUpperCase();

      const client = await tenantTx(biz.id, async (tx) => {
        const [exists] = await tx`select 1 from clients where business_id = ${biz.id} and phone = ${phone}`;
        if (exists) fail(409, 'Ese teléfono ya tiene cuenta. Tocá "Ya tengo cuenta" para entrar.');
        let referredBy: string | null = null;
        if (ref) {
          const [r] = await tx<{ id: string }[]>`select id from clients where business_id = ${biz.id} and referral_code = ${ref}`;
          referredBy = r?.id ?? null;
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
      const phone = readPhone(str(body, 'phone', { max: 30, label: 'el teléfono' }));
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
          if (!isOpenAt(biz.hours, now.day, now.min)) fail(409, 'Ahora estamos cerrados. Anotate cuando abramos.');
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
