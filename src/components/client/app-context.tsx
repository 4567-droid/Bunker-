'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, storage } from '@/lib/api-client';
import type { Payment } from '@/lib/format';
import type { PublicConfig } from '@/lib/public-config';
import { BottomNav, type NavTab } from '@/components/ui';

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
  queue?: { id: string; status: string; position: number; waitMin: number } | null;
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

  const value = useMemo<Ctx>(
    () => ({ config, me, setMe, refreshMe, live, refreshLive, draft, setDraft, resetDraft, referral, clearReferral }),
    [config, me, refreshMe, live, refreshLive, draft, setDraft, resetDraft, referral, clearReferral],
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
  return <BottomNav tabs={TABS} active={path} />;
}
