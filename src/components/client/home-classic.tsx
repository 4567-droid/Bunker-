'use client';

// Inicio estilo "clásico" (el de Bunker): portada con el título a la izquierda y la tarjeta "Reservá tu turno".
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HomeFooter, InviteBanners, LiveCard, LoyaltyLink, NextApptCard, useHome, WhereCard } from '@/components/client/home-cards';
import { Icon, Scissors } from '@/components/ui';

function ChairArt() {
  return (
    <svg width="300" height="420" viewBox="0 0 300 420" aria-hidden="true" className="absolute top-10 -right-[70px] opacity-55 md:hidden">
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

export function HomeClassic() {
  const { biz, short, rows, wa, where, nextAppt } = useHome();
  const router = useRouter();

  const bookingCard = (className: string) => (
    <section className={`relative flex flex-col gap-3 rounded-3xl border border-line bg-card p-[22px] ${className}`}>
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
  );

  return (
    <div className="flex flex-col">
      <section
        className="relative overflow-hidden bg-hero px-6 pt-6 pb-[120px] md:px-10 md:pt-16 md:pb-20"
        style={
          biz.heroUrl
            ? { backgroundImage: `linear-gradient(180deg, rgba(14,14,13,.55), rgba(14,14,13,.92)), url("${encodeURI(biz.heroUrl)}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {!biz.heroUrl && <ChairArt />}
        <div className="relative mx-auto w-full max-w-[1000px] lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-14">
          <div>
            <div className="relative flex items-center justify-between md:hidden">
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
            <div className="relative mt-[84px] flex flex-col gap-1.5 md:mt-0">
              <h1 className="m-0 flex flex-col leading-[1.05]">
                <span className="text-[clamp(38px,11vw,48px)] font-bold tracking-[.02em] md:text-[68px]">TU ESTILO,</span>
                <span className="text-[clamp(34px,10vw,44px)] font-light tracking-[.16em] text-muted md:text-[60px]">NUESTRA</span>
                <span className="text-[clamp(34px,10vw,44px)] font-light tracking-[.16em] text-muted md:text-[60px]">PASIÓN.</span>
              </h1>
              <span className="mt-[18px] mb-3 h-[3px] w-12 bg-accent md:mt-6 md:w-16" />
              <span className="text-[17px] font-light text-soft md:text-xl">
                Cortes de calidad,
                <br />
                con atención personalizada.
              </span>
              {where && <span className="mt-4 hidden text-[15px] font-light text-muted md:block">{where}</span>}
            </div>
          </div>
          <div className="hidden md:mt-10 md:flex md:max-w-[520px] md:flex-col md:gap-4 lg:mt-0 lg:max-w-none">
            <NextApptCard />
            {bookingCard('')}
          </div>
        </div>
      </section>

      {/* Celular: las tarjetas se montan sobre la portada */}
      <div className="flex flex-col md:hidden">
        <NextApptCard className="relative z-[1] mx-4 -mt-[84px]" />
        {bookingCard(`mx-4 ${nextAppt ? 'mt-4' : '-mt-[84px]'}`)}
      </div>

      <div className="mx-auto flex w-full max-w-[1080px] flex-col md:mt-10 md:grid md:grid-cols-2 md:items-start md:gap-4 md:px-10 lg:grid-cols-3">
        <InviteBanners className="mx-4 mt-4 md:mx-0 md:mt-0" />
        <LiveCard className="mx-4 mt-4 md:mx-0 md:mt-0" />
        <LoyaltyLink className="mx-4 mt-4 md:mx-0 md:mt-0" />
        <WhereCard className="mx-4 mt-4 md:mx-0 md:mt-0" />
      </div>

      <HomeFooter />
    </div>
  );
}
