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
    rows: [
      { label: service ? `${service.name} · ${money(service.price)}` : 'Seleccionar corte', step: 1 },
      { label: draft.day && draft.time ? `${dayLabel(draft.day)} · ${draft.time}` : 'Seleccionar fecha y horario', step: service ? 2 : 1 },
      { label: barber ? `Con ${barber.name}` : 'Seleccionar barbero', step: service && draft.time ? 3 : 1 },
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

/** "Ahora en el local": cada barbero libre u ocupado, y la fila sin turno */
export function LiveCard({ className = '' }: { className?: string }) {
  const { live, photos } = useHome();
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
          {live.barbers.map((b) => {
            const busy = b.state !== 'free';
            const status =
              b.state === 'cutting'
                ? b.freeInMin && b.freeInMin > 0
                  ? `Se libera en ${b.freeInMin} min`
                  : 'Terminando'
                : b.state === 'busy'
                  ? 'Ocupado'
                  : 'Libre';
            return (
              <div key={b.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3 text-[17px] font-medium">
                  {photos[b.id] && <Avatar name={b.name} src={photos[b.id]} size={36} />}
                  {b.name}
                </span>
                <span className="inline-flex items-center gap-2 text-sm text-soft">
                  <Dot color={busy ? RED : GREEN} />
                  {status}
                </span>
              </div>
            );
          })}
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
  const { where, hours, maps, ig, wa, waShown } = useHome();
  if (!where && hours.length === 0) return null;
  return (
    <Card className={`gap-3 px-5 py-[18px] ${className}`}>
      <Kicker>Dónde estamos</Kicker>
      {where && <span className="text-[17px] font-medium">{where}</span>}
      {hours.length > 0 && (
        <span className="flex flex-col text-sm font-light text-muted">
          {hours.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </span>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {maps && (
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
