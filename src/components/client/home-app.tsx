'use client';

// Inicio de los estilos "claro" y "oscuro" (en /admin, "App claro" y "App oscuro"): armado como una aplicación
// del celular. Los colores salen de globals.css (el bloque de arriba usa --app-top).
//  - Arriba un bloque gris carbón con el saludo y, encima, una tarjeta grande en degradé con el próximo turno
//    (o "Reservá tu turno").
//  - Accesos rápidos en cuadraditos con íconos, y listas en tarjetas blancas: barberos ahora, servicios,
//    tarjeta de fidelidad con barra de avance y "Dónde estamos".
// Los textos y datos salen de useHome(), igual que en los otros estilos.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useApp } from '@/components/client/app-context';
import { HomeFooter, InviteBanners, useHome } from '@/components/client/home-cards';
import { Icon, Scissors, type IconName } from '@/components/ui';
import { money } from '@/lib/format';
import { dayLabel } from '@/lib/time';

/** Cuadradito redondeado con un ícono (como los de la app de referencia) */
function Tile({ children, tone = 'pick', size = 44 }: { children: ReactNode; tone?: 'pick' | 'field'; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[14px] ${tone === 'pick' ? 'bg-pick text-accent' : 'bg-field text-soft'}`}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="m-0 text-[17px] font-semibold">{title}</h2>
      {right}
    </div>
  );
}

/** Anillos de adorno de la tarjeta en degradé */
function Rings() {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 w-[230px] text-white">
      <circle cx="100" cy="100" r="98" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="66" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="34" fill="currentColor" fillOpacity=".12" />
    </svg>
  );
}

/** Tarjeta grande en degradé: próximo turno, la reserva empezada o "Reservá tu turno" */
function HeroCard() {
  const { nextAppt, service, barber, draft, config } = useHome();
  const from = config.services.length ? Math.min(...config.services.map((s) => s.price)) : null;

  let kicker: string;
  let title: string;
  let sub: string;
  let cta: { href: string; label: string };
  if (nextAppt) {
    kicker = nextAppt.status === 'in_progress' ? 'Te están atendiendo' : 'Tu próximo turno';
    title = `${nextAppt.dayLabel} · ${nextAppt.projectedTime ?? nextAppt.time}`;
    sub = `${nextAppt.serviceName}${nextAppt.barberName ? ` con ${nextAppt.barberName}` : ''}${nextAppt.projectedTime ? ` · se corrió de las ${nextAppt.time}` : ''}`;
    cta = { href: '/cuenta', label: 'Ver mi turno' };
  } else if (service) {
    kicker = 'Tu reserva';
    title = `${service.name} · ${money(service.price)}`;
    sub =
      draft.day && draft.time
        ? `${dayLabel(draft.day)} a las ${draft.time}${barber ? ` con ${barber.name}` : ''}`
        : 'Te falta elegir el día y el horario.';
    cta = { href: `/turno?paso=${draft.day && draft.time ? (barber ? 4 : 3) : 2}`, label: 'Seguir reserva' };
  } else {
    kicker = 'Reservá tu turno';
    title = from != null ? `Turnos desde ${money(from)}` : 'Sacá tu turno online';
    sub = 'Elegí el servicio, el día y tu barbero en un minuto.';
    cta = { href: '/turno', label: 'Sacar turno' };
  }

  return (
    <section className="relative overflow-hidden rounded-[26px] bg-accent px-5 pt-5 pb-5 text-white shadow-[0_18px_40px_-12px_color-mix(in_srgb,var(--accent)_70%,transparent)]">
      <Rings />
      <span className="relative text-[13px] font-medium text-white/85">{kicker}</span>
      <p className="relative m-0 mt-1 text-[27px] leading-tight font-semibold">{title}</p>
      <p className="relative m-0 mt-1 max-w-[300px] text-[15px] font-light text-white/90">{sub}</p>
      <div className="relative mt-5 flex items-center justify-between gap-3">
        <Link
          href={cta.href}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold"
          style={{ color: 'color-mix(in srgb, var(--accent) 78%, #000)' }}
        >
          {cta.label}
          <Icon name="chevron" size={18} stroke={2.2} />
        </Link>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
          <Icon name="calendar" size={22} />
        </span>
      </div>
    </section>
  );
}

export function HomeApp() {
  const { biz, me, live, config, wa, maps, ig, waShown, where, hours, stamps, goal, prize, doubleOn, doubleUntil, photos } = useHome();
  const { setDraft } = useApp();
  const router = useRouter();
  const first = me?.client?.firstName;

  const today =
    !live
      ? ' '
      : live.open
        ? `Abierto ahora${live.closesAt ? ` · hasta las ${live.closesAt}` : ''}`
        : `Cerrado ahora${live.nextOpening ? ` · abrimos ${live.nextOpening.label} a las ${live.nextOpening.time}` : ''}`;

  const actions: { href: string; label: string; icon: IconName; external?: boolean }[] = [
    { href: '/turno', label: 'Turno', icon: 'calendar' },
    { href: '/fidelidad', label: 'Sellos', icon: 'fidelidad' },
    { href: '/productos', label: 'Productos', icon: 'productos' },
    maps ? { href: maps, label: 'Cómo llegar', icon: 'pin', external: true } : { href: '/cuenta', label: 'Cuenta', icon: 'cuenta' },
  ];

  const loyaltyText = me?.client
    ? me.client.nextFree
      ? prize.next
      : `${stamps} de ${goal} sellos${doubleOn && doubleUntil ? ` · doble sello hasta el ${Number(doubleUntil.slice(8))}/${Number(doubleUntil.slice(5, 7))}` : ''}`
    : `Sumá sellos: ${prize.short}`;
  const filled = Math.min(stamps, goal - 1);

  return (
    <div className="flex flex-col pb-4">
      <div className="mx-auto w-full md:max-w-[1080px] md:px-10 md:pt-6">
        {/* Bloque oscuro con el saludo */}
        <section
          className="relative overflow-hidden rounded-b-[32px] px-5 pt-5 pb-[92px] text-white md:rounded-[32px] md:px-8 md:pt-7 md:pb-[100px] lg:pb-8"
          style={{ background: 'var(--app-top)' }}
        >
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-16 h-64 w-64 rounded-full bg-accent opacity-25 blur-[80px]" />
          <div className="relative flex items-center justify-between gap-3">
            <Link href="/cuenta" className="flex min-w-0 items-center gap-3" aria-label="Mi cuenta">
              {biz.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={biz.logoUrl} alt="" width={46} height={46} className="h-[46px] w-[46px] shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                  {first ? <span className="text-lg font-semibold">{first.charAt(0).toUpperCase()}</span> : <Scissors size={22} />}
                </span>
              )}
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-light text-white/60">{first ? 'Hola de nuevo' : 'Hola!'}</span>
                <span className="truncate text-[19px] font-semibold">{first ?? `Bienvenido a ${biz.name.split(/\s+/)[0]}`}</span>
              </span>
            </Link>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Escribir por WhatsApp"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <Icon name="whatsapp" size={20} />
              </a>
            )}
          </div>

          <div className="relative mt-6 lg:mt-10 lg:grid lg:grid-cols-[1fr_430px] lg:items-end lg:gap-10">
            <div className="flex flex-col">
              <span className="text-[12px] font-medium tracking-[.22em] text-white/55 uppercase">{biz.name}</span>
              <h1 className="sr-only m-0 text-[52px] leading-[1.04] font-semibold lg:not-sr-only lg:mt-2">
                Tu turno,
                <br />a un toque.
              </h1>
              <span className="mt-1.5 inline-flex items-center gap-2 text-[14px] font-light text-white/75 lg:mt-4">
                {live && <span className={`h-2 w-2 rounded-full ${live.open ? 'bg-ok' : 'bg-bad'}`} />}
                {today}
              </span>
            </div>
            <div className="hidden lg:block">
              <HeroCard />
            </div>
          </div>
        </section>

        {/* Celular y tablet: la tarjeta en degradé se monta sobre el bloque oscuro */}
        <div className="relative -mt-[72px] px-4 md:px-8 lg:hidden">
          <HeroCard />
        </div>

        <div className="mt-5 grid gap-5 px-4 md:px-0 lg:mt-6 lg:grid-cols-2 lg:items-start">
          <InviteBanners className="bg-card lg:col-span-2" />

          {/* Accesos rápidos */}
          <nav aria-label="Accesos" className="grid grid-cols-4 gap-3 lg:col-span-2">
            {actions.map((a) => {
              const inner = (
                <>
                  <span className="flex h-[58px] w-[58px] items-center justify-center rounded-[18px] bg-card text-accent shadow-[var(--app-shadow)] lg:h-11 lg:w-11 lg:rounded-[14px] lg:bg-pick lg:shadow-none">
                    <Icon name={a.icon} size={24} />
                  </span>
                  <span className="text-[13px] font-medium text-soft lg:text-[15px] lg:text-ink">{a.label}</span>
                </>
              );
              const cls = 'flex min-h-11 flex-col items-center gap-2 text-center lg:flex-row lg:gap-3 lg:rounded-[20px] lg:bg-card lg:px-4 lg:py-3 lg:text-left lg:shadow-[var(--app-shadow)]';
              return a.external ? (
                <a key={a.label} href={a.href} target="_blank" rel="noopener noreferrer" className={cls}>
                  {inner}
                </a>
              ) : (
                <Link key={a.label} href={a.href} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-col gap-5">
            {/* Ahora en el local */}
            <div className="flex flex-col gap-2.5">
              <SectionHead
                title="Ahora en el local"
                right={
                  live?.open ? (
                    <span className="text-[13px] text-muted">
                      {live.queue.waiting ? `Fila: ${live.queue.waiting} (~${live.queue.waitMin} min)` : 'Sin fila'}
                    </span>
                  ) : undefined
                }
              />
              <section className="flex flex-col rounded-[22px] bg-card px-4 py-1.5 shadow-[var(--app-shadow)]">
                {!live ? (
                  <span className="py-3.5 text-sm font-light text-muted">Cargando…</span>
                ) : !live.open ? (
                  <div className="flex items-center gap-3 py-3">
                    <Tile tone="field">
                      <Icon name="estado" size={22} />
                    </Tile>
                    <span className="flex flex-col">
                      <span className="text-[15px] font-medium">Cerrado ahora</span>
                      {live.nextOpening && (
                        <span className="text-[13px] font-light text-muted">
                          Abrimos {live.nextOpening.label} a las {live.nextOpening.time}
                        </span>
                      )}
                    </span>
                  </div>
                ) : (
                  live.barbers.map((b, i) => {
                    const free = b.state === 'free';
                    const status =
                      b.state === 'cutting'
                        ? b.freeInMin && b.freeInMin > 0
                          ? `Se libera en ${b.freeInMin} min`
                          : 'Terminando'
                        : b.state === 'busy'
                          ? 'Ocupado'
                          : 'Libre';
                    return (
                      <div key={b.id} className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
                        {photos[b.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photos[b.id]} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-[14px] object-cover" />
                        ) : (
                          <Tile>
                            <span className="text-[17px] font-semibold">{b.name.charAt(0).toUpperCase()}</span>
                          </Tile>
                        )}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[16px] font-medium">{b.name}</span>
                          <span className="text-[13px] font-light text-muted">Barbero</span>
                        </span>
                        <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${free ? 'bg-ok/12 text-ok' : 'bg-bad/10 text-bad'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${free ? 'bg-ok' : 'bg-bad'}`} />
                          {status}
                        </span>
                      </div>
                    );
                  })
                )}
              </section>
            </div>

            {/* Servicios: tocás uno y vas directo a elegir el día */}
            <div className="flex flex-col gap-2.5">
              <SectionHead
                title="Servicios"
                right={
                  <Link href="/turno" className="inline-flex min-h-8 items-center text-[13px] font-medium text-accent">
                    Reservar
                  </Link>
                }
              />
              <section className="flex flex-col divide-y divide-line rounded-[22px] bg-card px-2 py-1 shadow-[var(--app-shadow)]">
                {config.services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setDraft({ serviceId: s.id, time: null, barberId: null });
                      router.push('/turno?paso=2');
                    }}
                    className="flex min-h-[64px] w-full items-center gap-3 px-2 py-2.5 text-left text-ink"
                  >
                    <Tile tone="field">
                      <Scissors size={20} />
                    </Tile>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[16px] font-medium">{s.name}</span>
                      <span className="text-[13px] font-light text-muted">{s.duration} min</span>
                    </span>
                    <span className="text-[16px] font-semibold text-accent">{money(s.price)}</span>
                    <Icon name="chevron" size={18} className="text-faint" />
                  </button>
                ))}
              </section>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* Tarjeta de fidelidad con barra de avance */}
            <div className="flex flex-col gap-2.5">
              <SectionHead title="Tu tarjeta" />
              <Link href="/fidelidad" className="flex flex-col gap-3.5 rounded-[22px] bg-card px-4 py-4 shadow-[var(--app-shadow)]">
                <span className="flex items-center gap-3">
                  <Tile>
                    <Icon name="fidelidad" size={22} />
                  </Tile>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[16px] font-medium">Tarjeta de fidelidad</span>
                    <span className="text-[13px] font-light text-muted">{loyaltyText}</span>
                  </span>
                  <span className="text-[20px] font-semibold text-accent">
                    {filled}/{goal}
                  </span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-field">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(4, Math.round((filled / Math.max(1, goal - 1)) * 100))}%` }} />
                </span>
                <span className="flex items-center justify-between text-[12px] text-muted">
                  <span>{doubleOn ? 'Doble sello activo' : 'Cada corte suma un sello'}</span>
                  <span>
                    {goal}.º corte: <span className="font-medium text-ink">{prize.cell}</span>
                  </span>
                </span>
              </Link>
            </div>

            {/* Dónde estamos, en filas como el perfil de una app */}
            {(where || hours.length > 0 || ig || wa) && (
              <div className="flex flex-col gap-2.5">
                <SectionHead title="Dónde estamos" />
                <section className="flex flex-col divide-y divide-line rounded-[22px] bg-card px-2 py-1 shadow-[var(--app-shadow)]">
                  {where && (
                    <InfoRow icon="pin" title={where} sub={maps ? 'Cómo llegar' : undefined} href={maps ?? undefined} />
                  )}
                  {hours.length > 0 && <InfoRow icon="estado" title="Horarios" lines={hours} />}
                  {ig && <InfoRow icon="instagram" title={`@${ig}`} sub="Instagram" href={`https://www.instagram.com/${ig}/`} />}
                  {wa && <InfoRow icon="whatsapp" title={waShown ?? 'WhatsApp'} sub="Escribinos por WhatsApp" href={wa} />}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      <HomeFooter />
    </div>
  );
}

function InfoRow({ icon, title, sub, lines, href }: { icon: IconName; title: string; sub?: string; lines?: string[]; href?: string }) {
  const inner = (
    <>
      <Tile tone="field">
        <Icon name={icon} size={21} />
      </Tile>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-medium">{title}</span>
        {sub && <span className="text-[13px] font-light text-muted">{sub}</span>}
        {lines?.map((l) => (
          <span key={l} className="text-[13px] font-light text-muted">
            {l}
          </span>
        ))}
      </span>
      {href && <Icon name="chevron" size={18} className="shrink-0 text-faint" />}
    </>
  );
  const cls = 'flex min-h-[64px] items-center gap-3 px-2 py-2.5 text-ink';
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
