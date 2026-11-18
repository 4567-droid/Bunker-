'use client';

// Piezas del Inicio que usan las dos portadas (estilo "clásico" y estilo "natural").
import Link from 'next/link';
import { useApp } from '@/components/client/app-context';
import { Avatar, Card, Dot, GREEN, Icon, Kicker, RED } from '@/components/ui';
import { instagramHandle, mapsHref, money, phoneDisplay } from '@/lib/format';
import { prizeInfo } from '@/lib/rules';
import { addDays, dayLabel, hoursSummary } from '@/lib/time';
import { enviarWhatsApp } from '@/lib/whatsapp';

/** Todo lo que el Inicio necesita saber, calculado una sola vez */
export function useHome() {
  const { config, me, live, draft, referral } = useApp();
  const biz = config.business;
  const short = biz.name.split(/\s+/)[0];
  const service = config.services.find((s) => s.id === draft.serviceId);
  const barber = config.barbers.find((b) => b.id === draft.barberId);
  const goal = biz.loyaltyGoal;
  // Sucursales: con dos o más, el cliente elige primero dónde va
  const locations = config.locations;
  const multi = locations.length > 1;
  const location = multi ? (locations.find((l) => l.id === draft.locationId) ?? null) : null;
  const lastVisit = me?.client?.lastVisitOn ?? null;
  // Doble sello: vale si vuelve dentro de los N días de su último corte
  const doubleUntil = lastVisit && biz.doubleStampDays ? addDays(lastVisit, biz.doubleStampDays) : null;
  return {
    config,
    me,
    live,
    draft,
    referral,
    biz,
    short,
    service,
    barber,
    goal,
    stamps: me?.client?.stamps ?? 0,
    nextAppt: me?.upcoming?.[0] ?? null,
    prize: prizeInfo({ kind: biz.loyaltyReward, pct: biz.loyaltyRewardPct, text: biz.loyaltyRewardText, goal }),
    locations,
    multi,
    location,
    /** Link de Maps de una sucursal (si la dirección no dice la ciudad, se suma la del negocio) */
    locMaps: (l: { name: string; address: string | null; mapsUrl: string | null }) =>
      mapsHref(l.mapsUrl, l.address ?? l.name, (l.address ?? '').includes(',') ? null : biz.city),
    /** Paso del turno al que lleva cada fila (con sucursales, sin elegirla se empieza por ahí) */
    rows: [
      ...(multi ? [{ label: location ? `En ${location.name}` : 'Seleccionar sucursal', step: 'lugar' }] : []),
      { label: service ? `${service.name} · ${money(service.price)}` : 'Seleccionar corte', step: multi && !location ? 'lugar' : 'servicio' },
      { label: draft.day && draft.time ? `${dayLabel(draft.day)} · ${draft.time}` : 'Seleccionar fecha y horario', step: multi && !location ? 'lugar' : service ? 'hora' : 'servicio' },
      { label: barber ? `Con ${barber.name}` : 'Seleccionar barbero', step: multi && !location ? 'lugar' : service && draft.time ? 'barbero' : 'servicio' },
    ],
    wa: biz.whatsapp ? enviarWhatsApp({ to: biz.whatsapp, text: `Hola ${short}! Quería hacer una consulta.` }).url : null,
    hours: hoursSummary(biz.hours),
    where: [biz.address, biz.city].filter(Boolean).join(', '),
    maps: mapsHref(biz.mapsUrl, biz.address, biz.city),
    ig: instagramHandle(biz.instagram),
    waShown: biz.whatsapp && /^549\d{10}$/.test(biz.whatsapp) ? phoneDisplay(biz.whatsapp.slice(3)) : biz.whatsapp,
    doubleUntil,
    doubleOn: !!doubleUntil && doubleUntil >= config.today,
    photos: Object.fromEntries(config.barbers.filter((b) => b.photoUrl).map((b) => [b.id, b.photoUrl as string])),
  };
}

export function NextApptCard({ className = '' }: { className?: string }) {
  const { nextAppt } = useHome();
  if (!nextAppt) return null;
  return (
    <Link href="/cuenta" className={`flex items-center justify-between gap-3 rounded-[20px] border border-accent bg-card px-5 py-4 ${className}`}>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-light text-muted">{nextAppt.status === 'in_progress' ? 'Te están atendiendo' : 'Tu próximo turno'}</span>
        <span className="text-lg font-semibold">
          {nextAppt.dayLabel} · {nextAppt.projectedTime ?? nextAppt.time}
        </span>
        <span className="truncate text-sm font-light text-muted">
          {nextAppt.serviceName} con {nextAppt.barberName}
          {nextAppt.locationName ? ` · ${nextAppt.locationName}` : ''}
          {nextAppt.projectedTime ? ` · se corrió de las ${nextAppt.time}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-sm text-accent">Ver →</span>
    </Link>
  );
}

/** "Ana te invitó": para quien entró por el link de un amigo */
export function InviteBanners({ className = '' }: { className?: string }) {
  const { referral, me } = useHome();
  if (!referral) return null;
  if (me?.client && me.invite?.canUse && referral.code !== me.client.referralCode) {
    return (
      <Link href="/fidelidad" className={`flex flex-col gap-1 rounded-[20px] border border-accent px-5 py-[18px] ${className}`}>
        <span className="text-[17px] font-semibold">{referral.name} te invitó</span>
        <span className="text-sm font-light text-muted">Tocá acá para usar su código: {referral.percent}% en tu primer corte.</span>
      </Link>
    );
  }
  if (!me?.client) {
    return (
      <Link href="/cuenta" className={`flex flex-col gap-1 rounded-[20px] border border-accent px-5 py-[18px] ${className}`}>
        <span className="text-[17px] font-semibold">{referral.name} te invitó</span>
        <span className="text-sm font-light text-muted">Tenés {referral.percent}% de descuento en tu primer corte. Creá tu cuenta y reservá.</span>
      </Link>
    );
  }
  return null;
}

type LiveBarber = NonNullable<ReturnType<typeof useApp>['live']>['barbers'][number];

function BarberLine({ b, photo }: { b: LiveBarber; photo?: string }) {
  const busy = b.state !== 'free';
  const status = b.state === 'cutting' ? (b.freeInMin && b.freeInMin > 0 ? `Se libera en ${b.freeInMin} min` : 'Terminando') : b.state === 'busy' ? 'Ocupado' : 'Libre';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-3 text-[17px] font-medium">
        {photo && <Avatar name={b.name} src={photo} size={36} />}
        {b.name}
      </span>
      <span className="inline-flex items-center gap-2 text-sm text-soft">
        <Dot color={busy ? RED : GREEN} />
        {status}
      </span>
    </div>
  );
}

/** "Ahora en el local": cada barbero libre u ocupado, y la fila sin turno (con sucursales, separado por local) */
export function LiveCard({ className = '' }: { className?: string }) {
  const { live, photos, multi, locations } = useHome();
  if (live?.open && multi) {
    return (
      <Card className={`gap-3 px-5 py-[18px] ${className}`}>
        <Kicker>Ahora en los locales</Kicker>
        {locations.map((l, i) => {
          const q = live.locations?.find((x) => x.id === l.id);
          return (
            <div key={l.id} className={`flex flex-col gap-2.5 ${i > 0 ? 'border-t border-line pt-3' : ''}`}>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium tracking-[.06em] text-accent uppercase">
                <Icon name="pin" size={15} />
                {l.name}
              </span>
              {live.barbers
                .filter((b) => b.locationId === l.id)
                .map((b) => (
                  <BarberLine key={b.id} b={b} photo={photos[b.id]} />
                ))}
              <span className="text-[13px] font-light text-muted">
                {q?.waiting ? `Sin turno: ${q.waiting} en la fila (~${q.waitMin} min)` : 'Sin turno: no hay fila ahora'}
              </span>
            </div>
          );
        })}
        {live.closesAt && <span className="border-t border-line pt-3 text-sm font-light text-muted">Atendemos hasta las {live.closesAt}</span>}
      </Card>
    );
  }
  return (
    <Card className={`gap-3 px-5 py-[18px] ${className}`}>
      <Kicker>Ahora en el local</Kicker>
      {!live ? (
        <span className="text-sm font-light text-muted">Cargando…</span>
      ) : !live.open ? (
        <span className="text-[15px] font-light text-soft">
          Cerrado ahora{live.nextOpening ? ` · abrimos ${live.nextOpening.label} a las ${live.nextOpening.time}` : ''}
        </span>
      ) : (
        <>
          {live.barbers.map((b) => (
            <BarberLine key={b.id} b={b} photo={photos[b.id]} />
          ))}
          <span className="border-t border-line pt-3 text-sm font-light text-muted">
            {live.queue.waiting ? `Sin turno: ${live.queue.waiting} en la fila (~${live.queue.waitMin} min)` : 'Sin turno: no hay fila ahora'}
            {live.closesAt ? ` · atendemos hasta las ${live.closesAt}` : ''}
          </span>
        </>
      )}
    </Card>
  );
}

export function LoyaltyLink({ className = '' }: { className?: string }) {
  const { me, stamps, goal, prize, doubleOn, doubleUntil } = useHome();
  return (
    <Link href="/fidelidad" className={`flex items-center justify-between gap-3 rounded-[20px] border border-accent px-5 py-[18px] text-left ${className}`}>
      <span className="flex flex-col">
        <span className="text-[17px] font-semibold">Tarjeta de fidelidad</span>
        <span className="text-sm font-light text-muted">
          {me?.client
            ? me.client.nextFree
              ? prize.next
              : `${stamps} de ${goal} sellos${doubleOn && doubleUntil ? ` · doble sello hasta el ${Number(doubleUntil.slice(8))}/${Number(doubleUntil.slice(5, 7))}` : ''}`
            : `Sumá sellos: ${prize.short}`}
        </span>
      </span>
      <span className="text-[22px] font-semibold text-accent">
        {Math.min(stamps, goal - 1)}/{goal}
      </span>
    </Link>
  );
}

/** Dirección, horarios, Cómo llegar, Instagram y WhatsApp */
export function WhereCard({ className = '' }: { className?: string }) {
  const { where, hours, maps, ig, wa, waShown, multi, locations, locMaps } = useHome();
  if (!where && hours.length === 0 && !multi) return null;
  return (
    <Card className={`gap-3 px-5 py-[18px] ${className}`}>
      <Kicker>{multi ? 'Nuestros locales' : 'Dónde estamos'}</Kicker>
      {multi
        ? locations.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-[17px] font-medium">{l.name}</span>
                {l.address && l.address !== l.name && <span className="truncate text-[13px] font-light text-muted">{l.address}</span>}
              </span>
              <a
                href={locMaps(l) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-2 px-4 text-sm"
              >
                <Icon name="pin" size={16} />
                Cómo llegar
              </a>
            </div>
          ))
        : where && <span className="text-[17px] font-medium">{where}</span>}
      {hours.length > 0 && (
        <span className="flex flex-col text-sm font-light text-muted">
          {hours.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </span>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {maps && !multi && (
          <a href={maps} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-2 text-[15px] font-medium">
            <Icon name="pin" size={18} />
            Cómo llegar
          </a>
        )}
        {ig && (
          <a href={`https://www.instagram.com/${ig}/`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-2 text-[15px] font-medium">
            <Icon name="instagram" size={18} />
            Instagram
          </a>
        )}
      </div>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-muted">
          <Icon name="whatsapp" size={18} className="text-wa" />
          WhatsApp {waShown}
        </a>
      )}
    </Card>
  );
}

/** Pie: nombre e Instagram. Los paneles (barberos y dueño) no se muestran: cada uno entra con su link */
export function HomeFooter() {
  const { biz, ig } = useHome();
  return (
    <footer className="mx-6 mt-6 mb-6 flex flex-col gap-1 text-[13px] font-light text-dim md:mx-auto md:mt-10 md:w-full md:max-w-[1080px] md:px-10">
      <span>
        {biz.name}
        {ig ? ` · @${ig}` : ''}
      </span>
    </footer>
  );
}
