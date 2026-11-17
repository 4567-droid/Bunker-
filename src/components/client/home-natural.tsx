'use client';

// Inicio estilo "natural": verde oscuro, dorado y letras con serifa. Título centrado, una barra de reserva
// redonda (como un buscador) y los servicios en pastillas debajo; fondo con manchas de luz suaves y hojas.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/client/app-context';
import { HomeFooter, InviteBanners, LiveCard, LoyaltyLink, NextApptCard, useHome, WhereCard } from '@/components/client/home-cards';
import { Icon } from '@/components/ui';
import { money } from '@/lib/format';
import { dayLabel } from '@/lib/time';

/** Nombre del negocio con serifa: "NAVAJA" grande y "barber club" chiquito abajo */
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

/** Manchas de luz suaves de fondo (verde, verde agua y un poco del dorado del negocio) */
function Glow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 left-[4%] h-[440px] w-[440px] rounded-full opacity-70 blur-[90px]" style={{ background: 'radial-gradient(circle, #2E5A28, transparent 66%)' }} />
      <div className="absolute top-6 right-[2%] h-[380px] w-[380px] rounded-full opacity-30 blur-[100px]" style={{ background: 'radial-gradient(circle, var(--accent), transparent 62%)' }} />
      <div className="absolute -bottom-48 left-[30%] h-[460px] w-[560px] rounded-full opacity-60 blur-[110px]" style={{ background: 'radial-gradient(circle, #1E4B39, transparent 66%)' }} />
    </div>
  );
}

export function HomeNatural() {
  const { biz, config, draft, service, barber, wa } = useHome();
  const { setDraft } = useApp();
  const router = useRouter();
  const city = (biz.city ?? '').replace(/^[A-Z]\d{4}\s*/, '').split(',')[0];

  const parts = [
    { label: 'Servicio', value: service ? service.name : 'Elegí', step: 1 },
    { label: 'Día y hora', value: draft.day && draft.time ? `${dayLabel(draft.day)} ${draft.time}` : 'Cuándo', step: service ? 2 : 1 },
    { label: 'Barbero', value: barber ? barber.name : 'El que quieras', step: service && draft.time ? 3 : 1 },
  ];

  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden bg-hero px-5 pt-5 pb-12 md:px-10 md:pt-24 md:pb-24">
        <Glow />
        <Leaf className="absolute -top-6 -left-10 w-[150px] -rotate-[28deg] text-ink/10 md:top-10 md:left-[4%] md:w-[220px]" />
        <Leaf className="absolute -right-12 bottom-0 w-[170px] rotate-[150deg] text-ink/10 md:right-[5%] md:w-[240px]" />

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

        <div className="relative mx-auto mt-14 flex max-w-[780px] flex-col items-center text-center md:mt-0">
          <span className="text-[12px] font-medium tracking-[.3em] text-accent uppercase">
            {biz.kind}
            {city ? ` · ${city}` : ''}
          </span>
          <h1 className="m-0 mt-4 text-[46px] leading-[1.02] font-semibold md:text-[80px]">
            Tu estilo,
            <br />
            en un espacio natural
          </h1>
          <p className="mt-4 max-w-[520px] text-[17px] font-light text-soft md:text-lg">
            Reservá tu turno en segundos: elegí el servicio, el día y tu barbero.
          </p>

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
              <Link
                href="/turno"
                className="mt-2 flex min-h-14 items-center justify-center gap-2 rounded-full bg-bg px-7 text-[15px] font-semibold text-ink md:mt-0 md:min-h-[52px]"
              >
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
                  router.push('/turno?paso=2');
                }}
                className="inline-flex min-h-10 items-center rounded-full border border-line-2 bg-card/70 px-4 text-sm text-ink backdrop-blur"
              >
                {s.name} · <span className="ml-1 text-accent">{money(s.price)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[1080px] flex-col md:mt-10 md:grid md:grid-cols-2 md:items-start md:gap-4 md:px-10 lg:grid-cols-3">
        <NextApptCard className="mx-4 mt-5 md:mx-0 md:mt-0" />
        <InviteBanners className="mx-4 mt-4 md:mx-0 md:mt-0" />
        <LiveCard className="mx-4 mt-4 md:mx-0 md:mt-0" />
        <LoyaltyLink className="mx-4 mt-4 md:mx-0 md:mt-0" />
        <WhereCard className="mx-4 mt-4 md:mx-0 md:mt-0" />
      </div>

      <HomeFooter />
    </div>
  );
}
