'use client';

// Inicio con el armado "centrado" (estilos "moderno" y "natural"): título grande centrado con serifa, una barra
// de reserva redonda (como un buscador) y los servicios en pastillas debajo.
//  - moderno: con los colores del negocio (Bunker: negro y amarillo), su logo arriba y el sillón dibujado
//  - natural: verde oscuro y dorado, con hojas; si el negocio tiene foto del local va de fondo, y suma círculos
//    como los destacados de Instagram y un panel con horario, dirección y contacto como el de Google (Bosco)
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/client/app-context';
import { HomeFooter, InviteBanners, LiveCard, LoyaltyLink, NextApptCard, useHome, WhereCard } from '@/components/client/home-cards';
import { Icon, Scissors, type IconName } from '@/components/ui';
import { money } from '@/lib/format';
import { dayLabel } from '@/lib/time';

export type CenteredVariant = 'moderno' | 'natural';

/** Nombre del negocio con serifa: "BUNKER" grande y "barber club" chiquito abajo */
export function Wordmark({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const [first, ...rest] = name.split(/\s+/);
  return (
    <span className="flex flex-col items-center leading-none">
      <span className={`font-display font-semibold tracking-[.2em] ${size === 'lg' ? 'text-[30px]' : 'text-[24px]'}`}>{first.toUpperCase()}</span>
      {rest.length > 0 && <span className="mt-1 text-[10px] font-medium tracking-[.42em] text-muted uppercase">{rest.join(' ')}</span>}
    </span>
  );
}

function Leaf({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 260" aria-hidden="true" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M100 250 C 40 200 10 130 30 60 C 45 20 80 5 100 5 C 120 5 155 20 170 60 C 190 130 160 200 100 250 Z" />
        <path d="M100 248 V 22" />
        <path d="M100 200 C 80 186 56 170 40 150 M100 200 C 120 186 144 170 160 150 M100 150 C 82 136 62 116 50 96 M100 150 C 118 136 138 116 150 96 M100 102 C 88 90 78 74 72 56 M100 102 C 112 90 122 74 128 56" />
      </g>
    </svg>
  );
}

/** El sillón y la lámpara de la portada clásica, en línea fina */
function Chair({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 420" aria-hidden="true" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M150 0 v70" />
        <path d="M110 70 h80 l18 30 h-116 z" />
        <rect x="150" y="170" width="110" height="130" rx="22" />
        <rect x="110" y="290" width="170" height="44" rx="14" />
        <path d="M120 245 h40 M270 245 h20" />
        <path d="M195 334 v50 M150 400 h90" />
      </g>
      <ellipse cx="150" cy="104" rx="46" ry="8" fill="var(--accent)" opacity=".25" />
    </svg>
  );
}

/** Luces suaves de fondo: verdes en "natural"; en "moderno", el color del negocio sobre negro */
function Glow({ variant }: { variant: CenteredVariant }) {
  const spots =
    variant === 'natural'
      ? [
          { cls: '-top-40 left-[4%] h-[440px] w-[440px] opacity-70 blur-[90px]', color: '#2E5A28' },
          { cls: 'top-6 right-[2%] h-[380px] w-[380px] opacity-30 blur-[100px]', color: 'var(--accent)' },
          { cls: '-bottom-48 left-[30%] h-[460px] w-[560px] opacity-60 blur-[110px]', color: '#1E4B39' },
        ]
      : [
          { cls: '-top-44 left-[18%] h-[420px] w-[520px] opacity-[.22] blur-[100px]', color: 'var(--accent)' },
          { cls: 'top-24 -right-24 h-[360px] w-[360px] opacity-[.14] blur-[100px]', color: 'var(--accent)' },
          { cls: '-bottom-56 left-[24%] h-[420px] w-[620px] opacity-80 blur-[110px]', color: '#2A2A27' },
        ];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {spots.map((s, i) => (
        <div key={i} className={`absolute rounded-full ${s.cls}`} style={{ background: `radial-gradient(circle, ${s.color}, transparent 64%)` }} />
      ))}
    </div>
  );
}

const TEXTS: Record<CenteredVariant, { title: [string, string]; sub: string }> = {
  moderno: { title: ['Tu estilo,', 'nuestra pasión.'], sub: 'Cortes de calidad, con atención personalizada. Reservá tu turno en segundos.' },
  natural: { title: ['Tu estilo,', 'en un espacio natural'], sub: 'Reservá tu turno en segundos: elegí el servicio, el día y tu barbero.' },
};

export function HomeCentered({ variant }: { variant: CenteredVariant }) {
  const { biz, config, draft, service, barber, wa, multi, location } = useHome();
  const { setDraft } = useApp();
  const router = useRouter();
  const city = (biz.city ?? '').replace(/^[A-Z]\d{4}\s*/, '').split(',')[0];
  const t = TEXTS[variant];

  // Con varias sucursales la barra empieza por "Sucursal" y, sin elegirla, todo lleva a ese paso
  const noPlace = multi && !location;
  const parts = [
    ...(multi ? [{ label: 'Sucursal', value: location ? location.name : 'Elegí', step: 'lugar' }] : []),
    { label: 'Servicio', value: service ? service.name : 'Elegí', step: noPlace ? 'lugar' : 'servicio' },
    { label: 'Día y hora', value: draft.day && draft.time ? `${dayLabel(draft.day)} ${draft.time}` : 'Cuándo', step: noPlace ? 'lugar' : service ? 'hora' : 'servicio' },
    { label: 'Barbero', value: barber ? barber.name : 'El que quieras', step: noPlace ? 'lugar' : service && draft.time ? 'barbero' : 'servicio' },
  ];
  // En "moderno" el botón principal va con el color del negocio (en Bunker, amarillo)
  const reserveCls = variant === 'moderno' ? 'bg-accent text-bg' : 'bg-bg text-ink';

  // "natural" con foto del local: la foto de fondo, oscurecida para que se lea el título
  const photo = variant === 'natural' && biz.heroUrl ? biz.heroUrl : null;

  return (
    <div className="flex flex-col">
      <section
        className="relative overflow-hidden bg-hero bg-cover px-5 pt-5 pb-12 md:px-10 md:pt-20 md:pb-24"
        style={
          photo
            ? {
                backgroundImage: `linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 62%, transparent) 0%, color-mix(in srgb, var(--color-bg) 80%, transparent) 55%, var(--color-bg) 100%), url("${encodeURI(photo)}")`,
                backgroundPosition: 'center 30%',
              }
            : undefined
        }
      >
        {!photo && <Glow variant={variant} />}
        {photo ? null : variant === 'natural' ? (
          <>
            <Leaf className="absolute -top-6 -left-10 w-[150px] -rotate-[28deg] text-ink/10 md:top-10 md:left-[4%] md:w-[220px]" />
            <Leaf className="absolute -right-12 bottom-0 w-[170px] rotate-[150deg] text-ink/10 md:right-[5%] md:w-[240px]" />
          </>
        ) : (
          <Chair className="absolute top-16 -right-24 w-[260px] text-line-2 opacity-70 md:top-10 md:right-[4%] md:w-[300px] md:opacity-80" />
        )}

        {/* Celular: la marca arriba (en la PC está en el menú) */}
        <div className="relative flex items-center justify-between md:hidden">
          <span className="w-11" />
          <Wordmark name={biz.name} />
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2">
              <Icon name="whatsapp" size={20} />
            </a>
          ) : (
            <span className="w-11" />
          )}
        </div>

        <div className="relative mx-auto mt-10 flex max-w-[780px] flex-col items-center text-center md:mt-0">
          {biz.logoUrl && (variant === 'moderno' || variant === 'natural') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={biz.logoUrl} alt={biz.name} width={88} height={88} className="mb-5 h-[76px] w-[76px] rounded-full md:h-[96px] md:w-[96px]" />
          )}
          <span className="text-[12px] font-medium tracking-[.3em] text-accent uppercase">
            {biz.kind}
            {city ? ` · ${city}` : ''}
          </span>
          <h1 className="m-0 mt-4 text-[46px] leading-[1.02] font-semibold md:text-[80px]">
            {t.title[0]}
            <br />
            {t.title[1]}
          </h1>
          {variant === 'moderno' && <span className="mt-5 h-[3px] w-14 bg-accent" />}
          <p className="mt-4 max-w-[540px] text-[17px] font-light text-balance text-soft md:max-w-[660px] md:text-lg">{t.sub}</p>

          {/* Barra de reserva, redonda como un buscador */}
          <div className="mt-8 w-full max-w-[720px] rounded-[26px] bg-ink p-2 text-bg shadow-[0_20px_60px_rgba(0,0,0,.35)] md:rounded-full md:p-1.5">
            <div className="flex flex-col md:flex-row md:items-center">
              {parts.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => router.push(`/turno?paso=${p.step}`)}
                  className={`flex min-h-14 min-w-0 flex-1 flex-col items-start justify-center rounded-[20px] px-5 text-left md:rounded-full ${i > 0 ? 'border-t border-black/10 md:border-t-0 md:border-l' : ''}`}
                >
                  <span className="text-[11px] font-medium tracking-[.14em] text-black/50 uppercase">{p.label}</span>
                  <span className="w-full truncate text-[15px] font-medium">{p.value}</span>
                </button>
              ))}
              <Link href="/turno" className={`mt-2 flex min-h-14 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold md:mt-0 md:min-h-[52px] ${reserveCls}`}>
                <Icon name="calendar" size={18} />
                Reservar
              </Link>
            </div>
          </div>

          {/* Servicios en pastillas: tocás uno y vas directo a elegir el día */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="w-full text-[13px] text-muted md:w-auto">Lo más pedido:</span>
            {config.services.slice(0, 4).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setDraft({ serviceId: s.id, time: null, barberId: null });
                  router.push(noPlace ? '/turno?paso=lugar' : '/turno?paso=hora');
                }}
                className="inline-flex min-h-10 items-center rounded-full border border-line-2 bg-card/70 px-4 text-sm text-ink backdrop-blur"
              >
                {s.name} · <span className="ml-1 text-accent">{money(s.price)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {variant === 'natural' ? (
        <>
          <Highlights />
          {/* En la PC: a la izquierda turno, barberos y tarjeta; a la derecha la ficha del local */}
          <div className="mx-auto flex w-full max-w-[1080px] flex-col md:mt-10 md:grid md:grid-cols-2 md:items-start md:gap-4 md:px-10">
            <div className="flex flex-col md:gap-4">
              <NextApptCard className="mx-4 mt-5 md:mx-0 md:mt-0" />
              <InviteBanners className="mx-4 mt-4 md:mx-0 md:mt-0" />
              <LiveCard className="mx-4 mt-4 md:mx-0 md:mt-0" />
              <LoyaltyLink className="mx-4 mt-4 md:mx-0 md:mt-0" />
            </div>
            <PlacePanel className="mx-4 mt-4 md:mx-0 md:mt-0" />
          </div>
        </>
      ) : (
        <div className="mx-auto flex w-full max-w-[1080px] flex-col md:mt-10 md:grid md:grid-cols-2 md:items-start md:gap-4 md:px-10 lg:grid-cols-3">
          <NextApptCard className="mx-4 mt-5 md:mx-0 md:mt-0" />
          <InviteBanners className="mx-4 mt-4 md:mx-0 md:mt-0" />
          <LiveCard className="mx-4 mt-4 md:mx-0 md:mt-0" />
          <LoyaltyLink className="mx-4 mt-4 md:mx-0 md:mt-0" />
          <WhereCard className="mx-4 mt-4 md:mx-0 md:mt-0" />
        </div>
      )}

      <HomeFooter />
    </div>
  );
}

/** Círculos como los destacados de Instagram: Servicios, Horarios, Ubicación, Productos */
function Highlights() {
  const { maps, ig, multi } = useHome();
  const items: { label: string; icon: IconName | 'scissors'; href: string; external?: boolean }[] = [
    { label: 'Servicios', icon: 'scissors', href: '/turno' },
    { label: 'Horarios', icon: 'estado', href: '#donde' },
    ...(multi
      ? [{ label: 'Sucursales', icon: 'pin' as const, href: '#donde' }]
      : maps
        ? [{ label: 'Ubicación', icon: 'pin' as const, href: maps, external: true }]
        : []),
    { label: 'Productos', icon: 'productos', href: '/productos' },
    ...(ig ? [{ label: 'Experiencias', icon: 'instagram' as const, href: `https://www.instagram.com/${ig}/`, external: true }] : []),
  ];
  return (
    <nav aria-label="Destacados" className="no-scrollbar mx-auto mt-1 flex w-full max-w-[1080px] gap-4 overflow-x-auto px-5 pt-1 pb-1 md:mt-8 md:justify-center md:gap-8 md:px-10">
      {items.map((it) => {
        const inner = (
          <>
            <span className="flex h-[70px] w-[70px] items-center justify-center rounded-full border-[1.5px] border-accent/70 p-[3px]">
              <span className="flex h-full w-full items-center justify-center rounded-full bg-field text-accent">
                {it.icon === 'scissors' ? <Scissors size={26} /> : <Icon name={it.icon} size={26} stroke={1.6} />}
              </span>
            </span>
            <span className="text-[13px] text-soft">{it.label}</span>
          </>
        );
        const cls = 'flex min-w-[70px] shrink-0 flex-col items-center gap-1.5';
        return it.external ? (
          <a key={it.label} href={it.href} target="_blank" rel="noopener noreferrer" className={cls}>
            {inner}
          </a>
        ) : (
          <Link key={it.label} href={it.href} className={cls}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}

/** Ficha del local como la de Google: botones redondos arriba y filas con ícono (horario, servicios, dirección…) */
function PlacePanel({ className = '' }: { className?: string }) {
  const { live, where, maps, ig, wa, waShown, hours, config, multi, locations, locMaps } = useHome();
  const { setDraft } = useApp();
  const router = useRouter();
  const actions: { label: string; icon: IconName; href: string; external?: boolean }[] = [
    { label: 'Turno', icon: 'calendar', href: '/turno' },
    // Con varias sucursales, cada una tiene su "Cómo llegar" más abajo
    ...(maps && !multi ? [{ label: 'Cómo llegar', icon: 'pin' as const, href: maps, external: true }] : []),
    ...(wa ? [{ label: 'WhatsApp', icon: 'whatsapp' as const, href: wa, external: true }] : []),
    ...(ig ? [{ label: 'Instagram', icon: 'instagram' as const, href: `https://www.instagram.com/${ig}/`, external: true }] : []),
  ];
  const open = live
    ? live.open
      ? { on: true, text: live.closesAt ? `Cierra a las ${live.closesAt}` : 'Abierto ahora' }
      : { on: false, text: live.nextOpening ? `Abre ${live.nextOpening.label} a las ${live.nextOpening.time}` : 'Cerrado ahora' }
    : null;
  const rows: { icon: IconName | 'scissors'; title: ReactNode; sub?: ReactNode; href?: string; external?: boolean }[] = [
    {
      icon: 'estado',
      title: open ? (
        <>
          <span className={open.on ? 'text-ok' : 'text-bad'}>{open.on ? 'Abierto' : 'Cerrado'}</span> · {open.text}
        </>
      ) : (
        'Horarios'
      ),
      sub: hours.length ? (
        <>
          {hours.map((h) => (
            <span key={h} className="block">
              {h}
            </span>
          ))}
        </>
      ) : undefined,
    },
    {
      icon: 'scissors',
      title: (
        <>
          <span className="font-semibold">Servicios:</span> {config.services.map((sv) => sv.name).join(', ')}
        </>
      ),
      href: '/turno',
    },
    ...(where && !multi ? [{ icon: 'pin' as const, title: where, sub: maps ? 'Cómo llegar' : undefined, href: maps ?? undefined, external: true }] : []),
    ...(ig ? [{ icon: 'instagram' as const, title: `@${ig}`, sub: 'Instagram', href: `https://www.instagram.com/${ig}/`, external: true }] : []),
    ...(wa ? [{ icon: 'whatsapp' as const, title: waShown ?? 'WhatsApp', sub: 'WhatsApp', href: wa, external: true }] : []),
  ];
  return (
    <section id="donde" className={`flex scroll-mt-24 flex-col rounded-[20px] border border-line bg-card ${className}`}>
      <span className="px-5 pt-[18px] text-[13px] tracking-[.18em] text-muted uppercase">{multi ? 'Nuestros locales' : 'Dónde estamos'}</span>
      <div className="flex justify-around gap-2 border-b border-line px-3 pt-4 pb-4">
        {actions.map((a) => {
          const inner = (
            <>
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-accent/60 text-accent">
                <Icon name={a.icon} size={22} />
              </span>
              <span className="text-[13px] text-accent">{a.label}</span>
            </>
          );
          const cls = 'flex min-w-[64px] flex-col items-center gap-1.5';
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
      </div>
      {multi && (
        <div className="flex flex-col divide-y divide-line border-b border-line px-3">
          {locations.map((l) => {
            const href = locMaps(l);
            const names = config.barbers.filter((b) => b.locationId === l.id).map((b) => b.name);
            return (
              <div key={l.id} className="flex min-h-[72px] items-center gap-3 px-2 py-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-field text-accent">
                  <Icon name="pin" size={21} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] leading-snug font-medium">{l.name}</span>
                  {names.length > 0 && <span className="text-[13px] font-light text-muted">Con {names.join(', ')}</span>}
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center self-start text-[13px] text-accent underline">
                      Cómo llegar
                    </a>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ locationId: l.id, time: null, barberId: null });
                    router.push('/turno?paso=servicio');
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-accent/70 px-4 text-sm font-medium text-accent"
                >
                  Reservar acá
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-col divide-y divide-line px-3 pb-1.5">
        {rows.map((r, i) => {
          const inner = (
            <>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-field text-accent">
                {r.icon === 'scissors' ? <Scissors size={20} /> : <Icon name={r.icon} size={21} />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] leading-snug">{r.title}</span>
                {r.sub && <span className="text-[13px] font-light text-muted">{r.sub}</span>}
              </span>
              {r.href && <Icon name="chevron" size={18} className="shrink-0 text-faint" />}
            </>
          );
          const cls = 'flex min-h-[64px] items-center gap-3 px-2 py-3 text-ink';
          if (!r.href) return <div key={i} className={cls}>{inner}</div>;
          return r.external ? (
            <a key={i} href={r.href} target="_blank" rel="noopener noreferrer" className={cls}>
              {inner}
            </a>
          ) : (
            <Link key={i} href={r.href} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
