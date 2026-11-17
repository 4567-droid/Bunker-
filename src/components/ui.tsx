'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------
// Íconos de línea finos (sin emojis)
// ---------------------------------------------------------------------
export const ICONS = {
  inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  turno: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4',
  fidelidad: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  productos: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0',
  cuenta: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  estado: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  fila: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  nuevo: 'M12 5v14M5 12h14',
  clientes: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3',
  resumen: 'M4 13h4v7H4zM10 8h4v12h-4zM16 4h4v16h-4z',
  ingresos: 'M12 19V5M6 11l6-6 6 6',
  gastos: 'M12 5v14M6 13l6 6 6-6',
  estimado: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  ajustes: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  whatsapp: 'M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6zM9.2 8.4c-.2 1.4.5 3 1.9 4.4s3 2.1 4.4 1.9l.7-1.4-1.9-1-.9.9c-.8-.4-1.6-1.2-2-2l.9-.9-1-1.9z',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01',
  close: 'M6 6l12 12M18 6L6 18',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, className = '', stroke = 1.8 }: { name: IconName; size?: number; className?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Scissors({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="9" cy="26" r="5" />
        <circle cx="25" cy="26" r="5" />
        <path d="M12 22 L27 4" />
        <path d="M22 22 L7 4" />
      </g>
    </svg>
  );
}

export function BrandMark({ name, className = '' }: { name: string; className?: string }) {
  const short = name.trim().split(/\s+/)[0].toUpperCase();
  return (
    <span className={`flex items-center gap-3 text-ink ${className}`}>
      <Scissors />
      <span className="text-sm font-medium tracking-[.32em]">{short}</span>
    </span>
  );
}

// ---------------------------------------------------------------------
// Piezas de diseño
// ---------------------------------------------------------------------
export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`text-[13px] tracking-[.18em] text-muted uppercase ${className}`}>{children}</span>;
}

export function PageTitle({ kicker, title, sub }: { kicker?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-1">
      {kicker && <Kicker>{kicker}</Kicker>}
      <h1 className="m-0 text-[28px] leading-tight font-semibold">{title}</h1>
      {sub && <span className="text-sm font-light text-muted">{sub}</span>}
    </div>
  );
}

export function Card({ children, className = '', accent = false }: { children: ReactNode; className?: string; accent?: boolean }) {
  return (
    <section className={`flex flex-col rounded-[20px] border bg-card ${accent ? 'border-accent' : 'border-line'} ${className}`}>
      {children}
    </section>
  );
}

export function Dot({ color, size = 9, glow = true }: { color: string; size?: number; glow?: boolean }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color, boxShadow: glow ? `0 0 8px ${color}` : undefined }}
    />
  );
}

export const GREEN = '#4CC26A';
export const RED = '#E0533D';

function CheckCircle({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${on ? 'border-accent bg-accent' : 'border-off bg-transparent'}`}
    >
      {on && <Icon name="check" size={14} stroke={4} className="text-bg" />}
    </span>
  );
}

/** Opción que el cliente toca: se marca en amarillo con un tilde */
export function OptionRow({
  on,
  onClick,
  title,
  sub,
  right,
  left,
  disabled,
  className = '',
}: {
  on: boolean;
  onClick: () => void;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  left?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`flex min-h-[68px] w-full items-center gap-3.5 rounded-2xl border-[1.5px] px-4 py-3 text-left text-ink transition-colors ${on ? 'border-accent bg-pick' : 'border-line bg-card'} ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      <CheckCircle on={on} />
      {left}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[17px] font-medium">{title}</span>
        {sub && <span className="text-[13px] font-light text-muted">{sub}</span>}
      </span>
      {right}
    </button>
  );
}

/** Foto redonda (o la inicial si no hay foto) */
export function Avatar({ name, src, size = 44 }: { name: string; src?: string | null; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-field font-semibold text-soft"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

/** Píldora / chip: elegido = fondo amarillo */
export function Chip({
  on,
  onClick,
  children,
  disabled,
  className = '',
  size = 'md',
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`rounded-full border-[1.5px] font-medium transition-colors ${size === 'sm' ? 'min-h-[42px] px-3.5 text-sm' : 'min-h-[50px] px-3 text-base'} ${on ? 'border-accent bg-accent text-bg' : 'border-line bg-card text-ink'} ${disabled ? 'opacity-35' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = '',
  type = 'button',
  busy,
  dimmed,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  busy?: boolean;
  /** Se ve gris pero se puede tocar (para mostrar qué falta completar) */
  dimmed?: boolean;
}) {
  const off = disabled || busy;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={off}
      className={`min-h-14 rounded-full border-0 px-5 text-[17px] font-semibold transition-colors ${off || dimmed ? 'bg-line text-dim' : 'bg-accent text-bg'} ${className}`}
    >
      {busy ? 'Un momento…' : children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className = '',
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border border-line-2 bg-transparent font-medium ${small ? 'min-h-11 px-4 text-[13px] text-muted' : 'min-h-[50px] px-5 text-[15px] text-ink'} ${disabled ? 'text-off' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function WaLink({ href, children, onClick, className = '' }: { href: string; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={`flex min-h-14 items-center justify-center gap-2 rounded-full bg-wa px-5 text-[17px] font-semibold text-wa-ink ${className}`}
    >
      <Icon name="whatsapp" size={20} />
      {children}
    </a>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  inputMode,
  placeholder,
  id,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric';
  placeholder?: string;
  id: string;
  autoFocus?: boolean;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        autoFocus={autoFocus}
        className="min-h-[54px] w-full rounded-[14px] border border-line bg-field px-[18px] text-base text-ink placeholder:text-dim"
      />
    </>
  );
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="m-0 rounded-[14px] border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-soft">
      {text}
    </p>
  );
}

export function OkNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="status" className="m-0 px-1 text-sm text-ok">
      {text}
    </p>
  );
}

/** Tarjeta de sellos: los sellados en amarillo con tilde; la última muestra el premio ("Gratis", "50%", "Premio") */
export function StampGrid({ stamps, goal, mini = false, prize = 'Gratis' }: { stamps: number; goal: number; mini?: boolean; prize?: string }) {
  const filled = Math.min(stamps, goal - 1);
  const cells = Array.from({ length: goal }, (_, i) => i);
  if (mini) {
    return (
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${goal}, minmax(0, 1fr))` }}>
        {cells.map((i) => (
          <span
            key={i}
            className={`aspect-square rounded-full border-[1.5px] ${i < filled ? 'border-accent bg-accent' : i === goal - 1 ? 'border-accent' : 'border-dash'}`}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-5 gap-3">
      {cells.map((i) => {
        const stamped = i < filled;
        const free = i === goal - 1;
        return (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-full border-[1.5px] text-[13px] ${stamped ? 'border-solid border-accent bg-accent' : free ? 'border-solid border-accent' : 'border-dashed border-dash'}`}
          >
            {stamped ? (
              <Icon name="check" size={20} stroke={3.5} className="w-[44%] text-bg" />
            ) : (
              <span className={free ? 'text-accent' : 'text-faint'}>{free ? prize : i + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface NavTab {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
}

/** Menú fijo abajo con íconos de línea; la pestaña activa en amarillo */
export function BottomNav({
  tabs,
  active,
  onPick,
  maxWidth = 480,
  className = '',
}: {
  tabs: NavTab[];
  active: string;
  onPick?: (id: string) => void;
  maxWidth?: number;
  className?: string;
}) {
  return (
    <nav aria-label="Menú" data-nav="bottom" className={`sticky bottom-0 z-10 border-t border-field bg-hero pb-[env(safe-area-inset-bottom)] ${className}`}>
      <div className="mx-auto grid" style={{ maxWidth, gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const on = t.id === active;
          const cls = `flex min-h-[68px] flex-col items-center justify-center gap-1 text-xs ${on ? 'font-semibold text-accent' : 'font-normal text-dim'}`;
          const inner = (
            <>
              <Icon name={t.icon} />
              {t.label}
            </>
          );
          return t.href ? (
            <Link key={t.id} href={t.href} className={cls} aria-current={on ? 'page' : undefined}>
              {inner}
            </Link>
          ) : (
            <button key={t.id} type="button" onClick={() => onPick?.(t.id)} className={`${cls} border-0 bg-transparent`} aria-pressed={on}>
              {inner}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function SummaryRow({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-3 text-[15px]">
      <span className="font-light text-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export function Stat({ value, label, color }: { value: ReactNode; label: string; color?: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-card p-3">
      <span className="text-2xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </span>
      <span className="text-xs font-light text-muted">{label}</span>
    </div>
  );
}

export function LoginShell({ brand, title, sub, children }: { brand: string; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-[420px] flex-col gap-3">
        <BrandMark name={brand} className="mb-6" />
        <h1 className="m-0 text-[30px] font-semibold">{title}</h1>
        <span className="mb-3 text-[15px] font-light text-muted">{sub}</span>
        {children}
        <Link href="/" className="inline-flex min-h-11 items-center self-center text-sm text-dim underline">
          Volver a la web
        </Link>
      </div>
    </div>
  );
}
