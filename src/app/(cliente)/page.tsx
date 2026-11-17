'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/client/app-context';
import { Avatar, Card, Dot, GREEN, Icon, Kicker, RED, Scissors } from '@/components/ui';
import { instagramHandle, mapsHref, money, phoneDisplay } from '@/lib/format';
import { enviarWhatsApp } from '@/lib/whatsapp';
import { addDays, dayLabel, hoursSummary } from '@/lib/time';

function ChairArt() {
  return (
    <svg width="300" height="420" viewBox="0 0 300 420" aria-hidden="true" className="absolute top-10 -right-[70px] opacity-55">
      <g fill="none" stroke="#2E2E2A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M150 0 v70" />
        <path d="M110 70 h80 l18 30 h-116 z" />
        <rect x="150" y="170" width="110" height="130" rx="22" />
        <rect x="110" y="290" width="170" height="44" rx="14" />
        <path d="M120 245 h40 M270 245 h20" />
        <path d="M195 334 v50 M150 400 h90" />
      </g>
      <ellipse cx="150" cy="104" rx="46" ry="8" fill="var(--accent)" opacity=".18" />
    </svg>
  );
}

export default function Inicio() {
  const { config, me, live, draft, referral } = useApp();
  const photos = Object.fromEntries(config.barbers.filter((b) => b.photoUrl).map((b) => [b.id, b.photoUrl as string]));
  const router = useRouter();
  const biz = config.business;
  const short = biz.name.split(/\s+/)[0];
  const service = config.services.find((s) => s.id === draft.serviceId);
  const barber = config.barbers.find((b) => b.id === draft.barberId);
  const stamps = me?.client?.stamps ?? 0;
  const nextAppt = me?.upcoming?.[0] ?? null;
  const goal = biz.loyaltyGoal;

  const rows = [
    { label: service ? `${service.name} · ${money(service.price)}` : 'Seleccionar corte', step: 1 },
    { label: draft.day && draft.time ? `${dayLabel(draft.day)} · ${draft.time}` : 'Seleccionar fecha y horario', step: service ? 2 : 1 },
    { label: barber ? `Con ${barber.name}` : 'Seleccionar barbero', step: service && draft.time ? 3 : 1 },
  ];
  const wa = biz.whatsapp ? enviarWhatsApp({ to: biz.whatsapp, text: `Hola ${short}! Quería hacer una consulta.` }).url : null;
  const hours = hoursSummary(biz.hours);
  const where = [biz.address, biz.city].filter(Boolean).join(', ');
  const maps = mapsHref(biz.mapsUrl, biz.address, biz.city);
  const ig = instagramHandle(biz.instagram);
  const waShown = biz.whatsapp && /^549\d{10}$/.test(biz.whatsapp) ? phoneDisplay(biz.whatsapp.slice(3)) : biz.whatsapp;
  // Doble sello: vale si vuelve dentro de los N días de su último corte
  const lastVisit = me?.client?.lastVisitOn ?? null;
  const doubleUntil = lastVisit && biz.doubleStampDays ? addDays(lastVisit, biz.doubleStampDays) : null;
  const doubleOn = !!doubleUntil && doubleUntil >= config.today;

  return (
    <div className="flex flex-col">
      <section
        className="relative overflow-hidden bg-hero px-6 pt-6 pb-[120px]"
        style={
          biz.heroUrl
            ? { backgroundImage: `linear-gradient(180deg, rgba(14,14,13,.55), rgba(14,14,13,.92)), url("${encodeURI(biz.heroUrl)}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {!biz.heroUrl && <ChairArt />}
        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-3">
            <Scissors />
            <span className="text-sm font-medium tracking-[.32em]">{short.toUpperCase()}</span>
          </span>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2">
              <Icon name="whatsapp" size={20} />
            </a>
          )}
        </div>
        <div className="relative mt-[84px] flex flex-col gap-1.5">
          <h1 className="m-0 flex flex-col leading-[1.05]">
            <span className="text-[clamp(38px,11vw,48px)] font-bold tracking-[.02em]">TU ESTILO,</span>
            <span className="text-[clamp(34px,10vw,44px)] font-light tracking-[.16em] text-muted">NUESTRA</span>
            <span className="text-[clamp(34px,10vw,44px)] font-light tracking-[.16em] text-muted">PASIÓN.</span>
          </h1>
          <span className="mt-[18px] mb-3 h-[3px] w-12 bg-accent" />
          <span className="text-[17px] font-light text-soft">
            Cortes de calidad,
            <br />
            con atención personalizada.
          </span>
        </div>
      </section>

      {nextAppt && (
        <Link href="/cuenta" className="relative z-[1] mx-4 -mt-[84px] flex items-center justify-between gap-3 rounded-[20px] border border-accent bg-card px-5 py-4">
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
      )}

      <section className={`relative mx-4 flex flex-col gap-3 rounded-3xl border border-line bg-card p-[22px] ${nextAppt ? 'mt-4' : '-mt-[84px]'}`}>
        <div className="mb-1.5 flex items-center gap-4">
          <Icon name="calendar" size={40} stroke={1.6} className="text-accent" />
          <span className="flex flex-col">
            <span className="text-[22px] font-semibold">Reservá tu turno</span>
            <span className="text-sm font-light text-muted">Elegí corte, horario y barbero.</span>
          </span>
        </div>
        {rows.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => router.push(`/turno?paso=${r.step}`)}
            className="flex min-h-14 items-center gap-3.5 rounded-[14px] border-0 bg-field px-4 text-left text-base text-soft"
          >
            <span className="flex-1">{r.label}</span>
            <Icon name="chevron" size={18} stroke={2} className="text-muted" />
          </button>
        ))}
        <Link href="/turno" className="mt-1.5 flex min-h-14 items-center justify-center rounded-full bg-accent text-[17px] font-semibold text-bg">
          Sacar turno →
        </Link>
      </section>

      {referral && me?.client && me.invite?.canUse && referral.code !== me.client.referralCode && (
        <Link href="/fidelidad" className="mx-4 mt-4 flex flex-col gap-1 rounded-[20px] border border-accent px-5 py-[18px]">
          <span className="text-[17px] font-semibold">{referral.name} te invitó</span>
          <span className="text-sm font-light text-muted">Tocá acá para usar su código: {referral.percent}% en tu primer corte.</span>
        </Link>
      )}

      {referral && !me?.client && (
        <Link href="/cuenta" className="mx-4 mt-4 flex flex-col gap-1 rounded-[20px] border border-accent px-5 py-[18px]">
          <span className="text-[17px] font-semibold">{referral.name} te invitó</span>
          <span className="text-sm font-light text-muted">
            Tenés {referral.percent}% de descuento en tu primer corte. Creá tu cuenta y reservá.
          </span>
        </Link>
      )}

      <Card className="mx-4 mt-4 gap-3 px-5 py-[18px]">
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
              {live.queue.waiting
                ? `Sin turno: ${live.queue.waiting} en la fila (~${live.queue.waitMin} min)`
                : 'Sin turno: no hay fila ahora'}
              {live.closesAt ? ` · atendemos hasta las ${live.closesAt}` : ''}
            </span>
          </>
        )}
      </Card>

      <Link href="/fidelidad" className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-[20px] border border-accent px-5 py-[18px] text-left">
        <span className="flex flex-col">
          <span className="text-[17px] font-semibold">Tarjeta de fidelidad</span>
          <span className="text-sm font-light text-muted">
            {me?.client
              ? me.client.nextFree
                ? 'Tu próximo corte es gratis'
                : `${stamps} de ${goal} sellos${doubleOn && doubleUntil ? ` · doble sello hasta el ${Number(doubleUntil.slice(8))}/${Number(doubleUntil.slice(5, 7))}` : ''}`
              : `Sumá sellos: el ${goal}.º corte es gratis`}
          </span>
        </span>
        <span className="text-[22px] font-semibold text-accent">
          {Math.min(stamps, goal - 1)}/{goal}
        </span>
      </Link>

      {(where || hours.length > 0) && (
        <Card className="mx-4 mt-4 gap-3 px-5 py-[18px]">
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
      )}

      <footer className="mx-6 mt-6 mb-6 flex flex-col gap-1 text-[13px] font-light text-dim">
        <span>
          {biz.name}
          {ig ? ` · @${ig}` : ''}
        </span>
        <span className="flex flex-wrap gap-x-[18px]">
          <Link href="/barbero" className="inline-flex min-h-9 items-center underline">
            Acceso barberos
          </Link>
          <Link href="/central" className="inline-flex min-h-9 items-center underline">
            Central del dueño
          </Link>
        </span>
      </footer>
    </div>
  );
}
