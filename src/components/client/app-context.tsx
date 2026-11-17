'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, storage } from '@/lib/api-client';
import type { Payment } from '@/lib/format';
import type { PublicConfig } from '@/lib/public-config';
import Link from 'next/link';
import { BottomNav, Icon, Scissors, type NavTab } from '@/components/ui';

export interface Appt {
  id: string;
  day: string;
  dayLabel: string;
  time: string;
  start: number;
  projectedTime: string | null;
  serviceName: string;
  barberId: string;
  barberName: string | null;
  status: string;
  payment: Payment | null;
  price: number;
  discountPct: number;
  discountReason: string | null;
  finalPrice: number;
  products: { id: string; name: string; price: number | null }[];
  productsTotal: number;
  total: number;
  waSent: boolean;
  confirmed: boolean;
  reminded?: boolean;
}

export interface PastCut {
  id: string;
  dayLabel: string;
  serviceName: string;
  barberName: string;
  status: string;
  stampsAdded: number;
  free: boolean;
  discountPct: number;
  paid: number;
}

export interface Me {
  client: {
    id: string;
    name: string;
    firstName: string;
    phone: string;
    phoneDisplay: string;
    email: string | null;
    referralCode: string;
    stamps: number;
    visits: number;
    lastVisitOn: string | null;
    nextFree: boolean;
  } | null;
  upcoming?: Appt[];
  history?: PastCut[];
  rewards?: { id: string; kind: string; percent: number; status: string; from: string | null }[];
  referrals?: { invited: number; rewarded: number };
  /** canUse: todavía puede cargar el código de un amigo (nunca se cortó y no usó otro) */
  invite?: { canUse: boolean; by: string | null; percent: number };
  queue?: { id: string; status: string; position: number; waitMin: number } | null;
  /** Aviso para mostrar después de entrar o de cargar un código */
  notice?: string | null;
}

export interface Live {
  open: boolean;
  closesAt: string | null;
  nextOpening: { day: string; label: string; time: string } | null;
  barbers: { id: string; name: string; state: 'free' | 'busy' | 'cutting'; freeInMin: number | null }[];
  queue: { waiting: number; waitMin: number; avgMin: number };
}

export interface Draft {
  serviceId: string | null;
  day: string | null;
  time: string | null;
  barberId: string | null;
  payment: Payment | null;
  productIds: string[];
}

const EMPTY: Draft = { serviceId: null, day: null, time: null, barberId: null, payment: null, productIds: [] };

interface Ctx {
  config: PublicConfig;
  me: Me | null; // null mientras carga
  setMe: (m: Me) => void;
  refreshMe: () => Promise<void>;
  live: Live | null;
  refreshLive: () => Promise<void>;
  draft: Draft;
  setDraft: (patch: Partial<Draft>) => void;
  resetDraft: () => void;
  referral: { code: string; name: string; percent: number } | null;
  /** Guarda un código ya validado (del link o escrito a mano) */
  setReferral: (r: { code: string; name: string; percent: number }) => void;
  clearReferral: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fuera de ClientApp');
  return c;
}

export function ClientApp({ config, children }: { config: PublicConfig; children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [draft, setDraftState] = useState<Draft>(EMPTY);
  const [referral, setReferral] = useState<Ctx['referral']>(null);

  useEffect(() => {
    const raw = storage('session').get('bk_draft');
    if (raw) {
      try {
        setDraftState({ ...EMPTY, ...JSON.parse(raw) });
      } catch {
        /* ignorar */
      }
    }
  }, []);

  const setDraft = useCallback((patch: Partial<Draft>) => {
    setDraftState((d) => {
      const next = { ...d, ...patch };
      storage('session').set('bk_draft', JSON.stringify(next));
      return next;
    });
  }, []);

  const resetDraft = useCallback(() => {
    storage('session').set('bk_draft', null);
    setDraftState(EMPTY);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api<Me>('/api/client/me'));
    } catch {
      setMe((m) => m ?? { client: null });
    }
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      setLive(await api<Live>('/api/public/live'));
    } catch {
      /* se reintenta solo */
    }
  }, []);

  useEffect(() => {
    refreshMe();
    refreshLive();
    // Con la pestaña en segundo plano no se consulta (ahorra batería y pedidos); al volver se actualiza
    const t = setInterval(() => document.visibilityState === 'visible' && refreshLive(), 15_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        refreshLive();
        refreshMe();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshMe, refreshLive]);

  // Tiempo real con Supabase (si está configurado): apenas un barbero cambia su luz, se actualiza
  useEffect(() => {
    if (!config.realtime) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import('@supabase/supabase-js').then(({ createClient }) => {
      if (cancelled || !config.realtime) return;
      const sb = createClient(config.realtime.url, config.realtime.key, { auth: { persistSession: false } });
      const channel = sb
        .channel(`estado-${config.business.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_status', filter: `business_id=eq.${config.business.id}` }, () => {
          refreshLive();
        })
        .subscribe();
      cleanup = () => {
        sb.removeChannel(channel);
      };
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [config.realtime, config.business.id, refreshLive]);

  // Invitación: /?ref=CODIGO queda guardada hasta que se registre
  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get('ref');
    if (code && /^[A-Za-z0-9]{3,20}$/.test(code)) storage('local').set('bk_ref', code.toUpperCase());
    const stored = storage('local').get('bk_ref');
    if (!stored) return;
    api<{ valid: boolean; code: string; name: string; percent: number }>(`/api/public/referral?code=${encodeURIComponent(stored)}`)
      .then((r) => {
        if (r.valid) setReferral({ code: r.code, name: r.name, percent: r.percent });
        else storage('local').set('bk_ref', null);
      })
      .catch(() => {});
  }, []);

  const clearReferral = useCallback(() => {
    storage('local').set('bk_ref', null);
    setReferral(null);
  }, []);

  const saveReferral = useCallback((r: { code: string; name: string; percent: number }) => {
    storage('local').set('bk_ref', r.code);
    setReferral(r);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ config, me, setMe, refreshMe, live, refreshLive, draft, setDraft, resetDraft, referral, setReferral: saveReferral, clearReferral }),
    [config, me, refreshMe, live, refreshLive, draft, setDraft, resetDraft, referral, saveReferral, clearReferral],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

const TABS: NavTab[] = [
  { id: '/', label: 'Inicio', icon: 'inicio', href: '/' },
  { id: '/turno', label: 'Turno', icon: 'turno', href: '/turno' },
  { id: '/fidelidad', label: 'Fidelidad', icon: 'fidelidad', href: '/fidelidad' },
  { id: '/productos', label: 'Productos', icon: 'productos', href: '/productos' },
  { id: '/cuenta', label: 'Cuenta', icon: 'cuenta', href: '/cuenta' },
];

export function ClientNav() {
  const path = usePathname();
  const { config } = useApp();
  const short = config.business.name.split(/\s+/)[0].toUpperCase();

  // Estilos "moderno" y "natural": links a la izquierda, la marca en el medio y "Mi cuenta" + "Sacar turno" a la derecha
  const theme = config.business.theme;
  if (theme === 'natural' || theme === 'moderno') {
    // En "moderno" el botón principal va con el color del negocio (Bunker: amarillo)
    const ctaCls = theme === 'moderno' ? 'bg-accent text-bg' : 'bg-ink text-bg';
    const [first, ...rest] = config.business.name.split(/\s+/);
    const left = TABS.filter((t) => t.id === '/turno' || t.id === '/fidelidad' || t.id === '/productos');
    const linkCls = (on: boolean) => `inline-flex min-h-10 items-center rounded-full px-3 text-sm whitespace-nowrap ${on ? 'font-semibold text-accent' : 'text-soft hover:text-ink'}`;
    return (
      <>
        <header className="sticky top-0 z-30 order-first hidden border-b border-line/60 bg-hero/85 backdrop-blur md:block">
          <div className="mx-auto grid h-[68px] max-w-[1080px] grid-cols-[1fr_auto_1fr] items-center px-10">
            <nav aria-label="Menú" className="flex items-center gap-1">
              {left.map((t) => (
                <Link key={t.id} href={t.href ?? '/'} aria-current={t.id === path ? 'page' : undefined} className={linkCls(t.id === path)}>
                  {t.label}
                </Link>
              ))}
            </nav>
            <Link href="/" aria-label="Inicio" className="flex flex-col items-center leading-none">
              <span className="font-display text-[24px] font-semibold tracking-[.2em]">{first.toUpperCase()}</span>
              {rest.length > 0 && <span className="mt-1 text-[9px] font-medium tracking-[.42em] text-muted uppercase">{rest.join(' ')}</span>}
            </Link>
            <div className="flex items-center justify-end gap-2">
              <Link href="/cuenta" aria-current={path === '/cuenta' ? 'page' : undefined} className={linkCls(path === '/cuenta')}>
                Mi cuenta
              </Link>
              {path !== '/turno' && (
                <Link href="/turno" className={`inline-flex min-h-10 items-center rounded-full px-5 text-sm font-semibold whitespace-nowrap ${ctaCls}`}>
                  Sacar turno
                </Link>
              )}
            </div>
          </div>
        </header>
        <BottomNav tabs={TABS} active={path} className="md:hidden" />
      </>
    );
  }

  return (
    <>
      {/* PC: barra arriba con la marca, el menú y "Sacar turno" */}
      <header className="sticky top-0 z-30 order-first hidden border-b border-field bg-hero/95 backdrop-blur md:block">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-4 px-10 lg:gap-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Inicio">
            <Scissors size={26} />
            <span className="text-sm font-medium tracking-[.32em]">{short}</span>
          </Link>
          <nav aria-label="Menú" className="flex flex-1 items-center justify-center gap-1">
            {TABS.map((t) => {
              const on = t.id === path;
              return (
                <Link
                  key={t.id}
                  href={t.href ?? '/'}
                  aria-current={on ? 'page' : undefined}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm whitespace-nowrap lg:px-4 ${on ? 'font-semibold text-accent' : 'text-muted hover:text-ink'}`}
                >
                  <Icon name={t.icon} size={18} />
                  {t.label}
                </Link>
              );
            })}
          </nav>
          {path !== '/turno' ? (
            <Link href="/turno" className="hidden min-h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold whitespace-nowrap text-bg lg:inline-flex">
              Sacar turno
            </Link>
          ) : (
            <span className="hidden w-[118px] lg:block" />
          )}
        </div>
      </header>
      {/* Celular: menú fijo abajo */}
      <BottomNav tabs={TABS} active={path} className="md:hidden" />
    </>
  );
}
