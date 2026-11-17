'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BottomNav, Chip, ErrorNote, Field, GhostButton, Icon, Kicker, LoginShell, OkNote, PrimaryButton, type NavTab } from '@/components/ui';
import { api } from '@/lib/api-client';
import { money } from '@/lib/format';
import { prizeInfo } from '@/lib/rules';
import { addDays, DAY_LONG, DAY_SHORT, dow, type Hours } from '@/lib/time';
import { enviarWhatsApp } from '@/lib/whatsapp';
import { BlockForm, BlocksList, PasswordForm, PhotoPicker, TimeField, type Block } from './shared';

interface MoneyRow {
  id: string;
  kind: 'in' | 'out';
  category: string;
  description: string;
  amount: number;
  date: string;
}
interface Finance {
  month: string;
  monthLabel: string;
  isCurrent: boolean;
  today: string;
  income: number;
  serviceIncome: number;
  otherIncome: number;
  expense: number;
  profit: number;
  elapsed: number;
  openDays: number;
  perDay: number;
  projIncome: number;
  projProfit: number;
  booked: { n: number; amount: number };
  goal: number;
  goalPct: number;
  projPct: number;
  missing: number;
  cutsMissing: number;
  barberCards: { id: string; name: string; total: number; parts: { label: string; n: number }[] }[];
  incomes: MoneyRow[];
  expenses: MoneyRow[];
  catTotals: { name: string; total: number }[];
  moves: MoneyRow[];
  incomeCats: string[];
  expenseCats: string[];
}

interface MonthItem {
  month: string;
  label: string;
  isCurrent: boolean;
  income: number;
  serviceIncome: number;
  otherIncome: number;
  expense: number;
  profit: number;
  cuts: number;
  avgTicket: number;
  noShows: number;
  newClients: number;
  profitDiff: number | null;
}
interface MonthsData {
  current: string;
  months: MonthItem[];
  years: { year: string; income: number; expense: number; profit: number; cuts: number; months: number }[];
  best: string | null;
}

// Lo último que se trajo de cada pantalla: al volver se muestra al instante y se actualiza atrás
const financeCache = new Map<string, Finance>();
let monthsCache: MonthsData | null = null;
let settingsCache: Settings | null = null;
function forgetCaches() {
  financeCache.clear();
  monthsCache = null;
  settingsCache = null;
}

const TABS: NavTab[] = [
  { id: 'resumen', label: 'Resumen', icon: 'resumen' },
  { id: 'ingresos', label: 'Ingresos', icon: 'ingresos' },
  { id: 'gastos', label: 'Gastos', icon: 'gastos' },
  { id: 'estimado', label: 'Estimado', icon: 'estimado' },
  { id: 'ajustes', label: 'Ajustes', icon: 'ajustes' },
];
const HEADINGS: Record<string, string> = {
  resumen: 'Resumen del mes',
  ingresos: 'Ingresos',
  gastos: 'Gastos',
  estimado: 'Estimado del mes',
  ajustes: 'Ajustes',
  agenda: 'Turnos',
  clientes: 'Clientes',
  meses: 'Todos los meses',
};
const NO_MONTH = ['ajustes', 'agenda', 'clientes', 'meses'];
const GREEN = '#4CC26A';
const RED = '#E0533D';

function shiftMonth(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function OwnerPanel({ brand }: { brand: string }) {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    api<{ staff: { role: string } | null }>('/api/staff/me')
      .then((r) => setRole(r.staff && (r.staff.role === 'owner' || r.staff.role === 'admin') ? r.staff.role : null))
      .catch(() => setRole(null));
  }, []);
  if (role === undefined) return <div className="p-8 text-muted">Cargando…</div>;
  if (!role) return <OwnerLogin brand={brand} onDone={() => setRole('owner')} />;
  return <OwnerApp isOwner={role === 'owner'} onLogout={() => setRole(null)} />;
}

function OwnerLogin({ brand, onDone }: { brand: string; onDone: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <LoginShell brand={brand} title="Central del dueño" sub="Ingresos, gastos y lo que va a dejar el mes.">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api('/api/staff/login', { role: 'owner', username: user, password: pass });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id="u1" label="Usuario" autoComplete="username" value={user} onChange={setUser} />
        <Field id="u2" label="Contraseña" type="password" autoComplete="current-password" value={pass} onChange={setPass} />
        <ErrorNote text={error} />
        <PrimaryButton type="submit" disabled={!user || !pass} busy={busy} className="mt-2">
          Ingresar
        </PrimaryButton>
      </form>
    </LoginShell>
  );
}

function OwnerApp({ isOwner, onLogout }: { isOwner: boolean; onLogout: () => void }) {
  const [tab, setTab] = useState('resumen');
  const [month, setMonth] = useState<string | null>(null);
  const [f, setF] = useState<Finance | null>(() => financeCache.get('') ?? null);
  const [error, setError] = useState<string | null>(null);
  const wanted = useRef<string | null>(null);

  const load = useCallback(async () => {
    const key = month ?? '';
    wanted.current = key;
    const hit = financeCache.get(key);
    setF((cur) => hit ?? (cur && (cur.month === month || !month) ? cur : null));
    try {
      const r = await api<Finance>(`/api/owner/finance${month ? `?month=${month}` : ''}`);
      financeCache.set(key, r);
      financeCache.set(r.month, r);
      if (wanted.current === key) setF(r);
    } catch (e) {
      if ((e as Error).message.includes('ingresar')) onLogout();
      else setError((e as Error).message);
    }
  }, [month, onLogout]);

  useEffect(() => {
    load();
  }, [load]);

  function openMonth(m: string) {
    setMonth(m);
    setTab('resumen');
  }

  async function logout() {
    await api('/api/staff/logout', {}).catch(() => {});
    forgetCaches();
    onLogout();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-4 pt-5 pb-1">
        <span className="flex flex-col leading-tight">
          <span className="flex items-center gap-1 text-[13px] tracking-[.18em] text-muted uppercase">
            {f && !NO_MONTH.includes(tab) && (
              <button type="button" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(f.month, -1))} className="-ml-2 min-h-9 px-2 text-muted">
                ‹
              </button>
            )}
            {f && !NO_MONTH.includes(tab) ? (
              <button type="button" onClick={() => setTab('meses')} className="min-h-9 tracking-[.18em] text-muted uppercase underline decoration-line-2 underline-offset-4">
                Central · {f.monthLabel}
              </button>
            ) : (
              'Central'
            )}
            {f && !NO_MONTH.includes(tab) && !f.isCurrent && (
              <button type="button" aria-label="Mes siguiente" onClick={() => setMonth(shiftMonth(f.month, 1))} className="min-h-9 px-2 text-muted">
                ›
              </button>
            )}
          </span>
          <span className="text-[26px] font-semibold">{HEADINGS[tab]}</span>
        </span>
        <GhostButton small onClick={logout} className="!px-3.5">
          Salir
        </GhostButton>
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-3.5 px-4 pt-3 pb-6">
        <ErrorNote text={error} />
        {!f && !NO_MONTH.includes(tab) && <span className="text-muted">Cargando…</span>}
        {f && tab === 'resumen' && <Resumen f={f} go={setTab} />}
        {tab === 'meses' && <AllMonths onPick={openMonth} />}
        {f && tab === 'ingresos' && <Ingresos f={f} reload={load} />}
        {f && tab === 'gastos' && <Gastos f={f} reload={load} />}
        {f && tab === 'estimado' && <Estimado f={f} reload={load} />}
        {tab === 'ajustes' && <Ajustes isOwner={isOwner} onSaved={load} />}
        {tab === 'agenda' && <DayAgenda />}
        {tab === 'clientes' && <ClientsList />}
      </main>
      <BottomNav tabs={TABS} active={tab} onPick={setTab} maxWidth={560} />
    </div>
  );
}

function MoneyList({ rows, onDelete }: { rows: MoneyRow[]; onDelete?: (r: MoneyRow) => void }) {
  return (
    <>
      {rows.map((g) => (
        <div key={g.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px]">{g.description}</span>
            <span className="text-xs font-light text-dim">
              {g.category} · {g.date}
            </span>
          </span>
          <span className="text-[15px] font-semibold" style={{ color: g.kind === 'in' ? GREEN : undefined }}>
            {money(g.amount)}
          </span>
          {onDelete && (
            <button
              type="button"
              aria-label={`Borrar ${g.description}`}
              onClick={() => onDelete(g)}
              className="h-11 w-11 shrink-0 rounded-full border border-line-2 bg-transparent text-lg text-dim"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </>
  );
}

function Resumen({ f, go }: { f: Finance; go: (t: string) => void }) {
  return (
    <>
      <button
        type="button"
        onClick={() => go('clientes')}
        className="flex min-h-[54px] items-center gap-3 rounded-[14px] border border-line bg-field px-[18px] text-left text-base text-dim"
      >
        <Icon name="search" size={20} />
        Buscar cliente por nombre o teléfono
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => go('agenda')} className="flex min-h-[52px] items-center justify-center rounded-full border border-line-2 bg-card text-[15px] font-medium text-ink">
          Turnos de hoy
        </button>
        <button type="button" onClick={() => go('clientes')} className="flex min-h-[52px] items-center justify-center rounded-full border border-line-2 bg-card text-[15px] font-medium text-ink">
          Clientes
        </button>
      </div>
      <section className="flex flex-col gap-1 rounded-3xl bg-accent p-[22px] text-bg">
        <span className="text-[13px] font-semibold tracking-[.16em]">{f.isCurrent ? 'GANANCIA HASTA HOY' : 'GANANCIA DEL MES'}</span>
        <span className="text-[38px] leading-[1.1] font-bold">{money(f.profit)}</span>
        <span className="text-sm">
          {f.isCurrent ? `Al ${Number(f.today.slice(8))}/${Number(f.today.slice(5, 7))} · ` : ''}
          {f.elapsed} de {f.openDays} días abiertos
        </span>
      </section>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => go('ingresos')} className="flex flex-col items-start gap-0.5 rounded-[20px] border border-line bg-card p-4 text-left text-ink">
          <span className="text-[13px] font-light text-muted">Ingresos</span>
          <span className="text-[22px] font-semibold" style={{ color: GREEN }}>
            {money(f.income)}
          </span>
        </button>
        <button type="button" onClick={() => go('gastos')} className="flex flex-col items-start gap-0.5 rounded-[20px] border border-line bg-card p-4 text-left text-ink">
          <span className="text-[13px] font-light text-muted">Gastos</span>
          <span className="text-[22px] font-semibold" style={{ color: RED }}>
            {money(f.expense)}
          </span>
        </button>
      </div>
      <button type="button" onClick={() => go('estimado')} className="flex items-center justify-between gap-3 rounded-[20px] border border-accent bg-transparent px-[18px] py-4 text-left text-ink">
        <span className="flex flex-col">
          <span className="text-[13px] font-light text-muted">Estimado de cierre del mes</span>
          <span className="text-xl font-semibold">{money(f.projIncome)}</span>
        </span>
        <span className="text-sm text-accent">Ver →</span>
      </button>
      <button type="button" onClick={() => go('meses')} className="flex items-center justify-between gap-3 rounded-[20px] border border-line bg-card px-[18px] py-4 text-left text-ink">
        <span className="flex flex-col">
          <span className="text-[13px] font-light text-muted">Historial</span>
          <span className="text-lg font-semibold">Todos los meses</span>
          <span className="text-[13px] font-light text-muted">Cómo les fue cada mes: ganancia, ingresos, gastos y cortes</span>
        </span>
        <span className="shrink-0 text-sm text-accent">Ver →</span>
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => go('ingresos')} className="min-h-[52px] rounded-full border border-line-2 bg-card text-[15px] font-medium text-ink">
          + Ingreso
        </button>
        <button type="button" onClick={() => go('gastos')} className="min-h-[52px] rounded-full border border-line-2 bg-card text-[15px] font-medium text-ink">
          + Gasto
        </button>
      </div>
      <Kicker className="px-1 pt-1.5">Últimos movimientos</Kicker>
      <div className="flex flex-col rounded-[20px] border border-line bg-card px-4 py-1">
        {f.moves.length === 0 && <span className="py-3 text-sm text-muted">Todavía no cargaste ingresos ni gastos este mes.</span>}
        {f.moves.map((m) => (
          <div key={m.id} className="flex items-center gap-3 border-b border-field py-3 last:border-0">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.kind === 'in' ? GREEN : RED }} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px]">{m.description}</span>
              <span className="text-xs font-light text-dim">
                {m.category} · {m.date}
              </span>
            </span>
            <span className="text-[15px] font-semibold" style={{ color: m.kind === 'in' ? GREEN : undefined }}>
              {m.kind === 'in' ? '+' : '-'}
              {money(m.amount)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function Change({ diff, prevLabel }: { diff: number | null; prevLabel: string | null }) {
  if (diff === null || !prevLabel) return null;
  const month = prevLabel.split(' ')[0];
  if (diff === 0) return <span className="text-[13px] font-light text-muted">Igual que en {month}</span>;
  const up = diff > 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-light text-muted">
      <span aria-hidden className="text-[10px]" style={{ color: up ? GREEN : RED }}>
        {up ? '▲' : '▼'}
      </span>
      {money(Math.abs(diff))} {up ? 'más' : 'menos'} que en {month}
    </span>
  );
}

/** Ganancia de los últimos 12 meses: una barra por mes (amarilla si ganaron, roja hacia abajo si perdieron) */
function ProfitChart({ months, onPick }: { months: MonthItem[]; onPick: (m: string) => void }) {
  const [sel, setSel] = useState<string>(months[months.length - 1]?.month ?? '');
  const top = Math.max(0, ...months.map((m) => m.profit));
  const bottom = Math.max(0, ...months.map((m) => -m.profit));
  const span = top + bottom || 1;
  const H = 132;
  const upH = Math.round((H * top) / span);
  const downH = H - upH;
  const s = months.find((m) => m.month === sel) ?? months[months.length - 1];
  if (!s) return null;
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-[18px]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-[13px] font-light text-muted">Ganancia · {cap(s.label)}{s.isCurrent ? ' (en curso)' : ''}</span>
          <span className="text-[26px] leading-tight font-semibold" style={{ color: s.profit < 0 ? RED : undefined }}>
            {s.profit < 0 ? `−${money(-s.profit)}` : money(s.profit)}
          </span>
          <span className="text-[13px] font-light text-muted">
            Ingresos {money(s.income)} · Gastos {money(s.expense)}
          </span>
        </span>
        <button type="button" onClick={() => onPick(s.month)} className="min-h-11 shrink-0 rounded-full border border-line-2 px-4 text-sm text-accent">
          Ver mes →
        </button>
      </div>
      <div className="flex items-stretch gap-[2px]" role="group" aria-label="Ganancia de cada mes">
        {months.map((m) => {
          const on = m.month === s.month;
          const h = Math.max(m.profit === 0 ? 0 : 3, Math.round((H * Math.abs(m.profit)) / span));
          return (
            <button
              key={m.month}
              type="button"
              aria-label={`${cap(m.label)}: ganancia ${money(m.profit)}`}
              aria-pressed={on}
              onClick={() => (on ? onPick(m.month) : setSel(m.month))}
              // Con mouse, pasar por encima ya la elige; en el celular el primer toque elige y el segundo abre
              onPointerEnter={(e) => e.pointerType === 'mouse' && setSel(m.month)}
              onFocus={(e) => e.currentTarget.matches(':focus-visible') && setSel(m.month)}
              className="flex min-w-0 flex-1 flex-col items-center rounded-lg pt-1"
              style={{ background: on ? 'var(--color-field)' : 'transparent' }}
            >
              <span className="flex w-full items-end justify-center" style={{ height: upH }}>
                {m.profit > 0 && (
                  <span className="block w-full max-w-[24px] rounded-t-[4px]" style={{ height: h, background: 'var(--accent)', opacity: on ? 1 : 0.55 }} />
                )}
              </span>
              <span className="block h-px w-full bg-line-2" />
              <span className="flex w-full items-start justify-center" style={{ height: downH }}>
                {m.profit < 0 && (
                  <span className="block w-full max-w-[24px] rounded-b-[4px]" style={{ height: h, background: RED, opacity: on ? 1 : 0.55 }} />
                )}
              </span>
              <span className={`pt-1.5 pb-1 text-[11px] ${on ? 'text-ink' : 'text-dim'}`}>{SHORT_MONTHS[Number(m.month.slice(5, 7)) - 1]}</span>
            </button>
          );
        })}
      </div>
      <span className="text-xs font-light text-dim">Tocá una barra para ver ese mes. Tocala de nuevo para abrirlo.</span>
    </section>
  );
}

function AllMonths({ onPick }: { onPick: (m: string) => void }) {
  const [d, setD] = useState<MonthsData | null>(monthsCache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<MonthsData>('/api/owner/months')
      .then((r) => {
        monthsCache = r;
        setD(r);
      })
      .catch((e) => setError((e as Error).message));
  }, []);
  if (!d) return error ? <ErrorNote text={error} /> : <span className="text-muted">Cargando…</span>;
  const chart = d.months.slice(0, 12).reverse();
  return (
    <div className="flex flex-col gap-3">
      <ErrorNote text={error} />
      <ProfitChart months={chart} onPick={onPick} />

      {d.years.map((y) => (
        <section key={y.year} className="flex flex-col gap-2 rounded-[20px] border border-accent px-[18px] py-4">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-lg font-semibold">Año {y.year}</span>
            <span className="text-[13px] font-light text-muted">
              {plural(y.months, 'mes', 'meses')} · {plural(y.cuts, 'corte', 'cortes')}
            </span>
          </span>
          <span className="text-[30px] leading-tight font-bold" style={{ color: y.profit < 0 ? RED : 'var(--accent)' }}>
            {y.profit < 0 ? `−${money(-y.profit)}` : money(y.profit)}
          </span>
          <span className="-mt-1 text-[13px] font-light text-muted">Ganancia del año{y.year === d.current.slice(0, 4) ? ' hasta hoy' : ''}</span>
          <div className="grid grid-cols-2 gap-2">
            <YearStat label="Ingresos" value={y.income} color={GREEN} />
            <YearStat label="Gastos" value={y.expense} color={RED} />
          </div>
        </section>
      ))}

      <Kicker className="px-1 pt-1.5">Mes por mes</Kicker>
      {d.months.map((m, i) => {
        const prev = d.months[i + 1] ?? null;
        const empty = m.income === 0 && m.expense === 0;
        return (
          <button
            key={m.month}
            type="button"
            onClick={() => onPick(m.month)}
            className="flex flex-col gap-2 rounded-[20px] border border-line bg-card px-[18px] py-4 text-left text-ink"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[17px] font-semibold">
                {cap(m.label)}
                {m.isCurrent && <span className="rounded-full border border-line-2 px-2.5 py-0.5 text-xs font-normal text-muted">En curso</span>}
                {d.best === m.month && <span className="rounded-full bg-pick px-2.5 py-0.5 text-xs font-medium text-accent">Mejor mes</span>}
              </span>
              <span className="text-sm text-accent">Ver →</span>
            </span>
            {empty ? (
              <span className="text-sm font-light text-muted">Sin movimientos cargados.</span>
            ) : (
              <>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[24px] leading-tight font-bold" style={{ color: m.profit < 0 ? RED : 'var(--accent)' }}>
                    {m.profit < 0 ? `Perdieron ${money(-m.profit)}` : money(m.profit)}
                  </span>
                  <Change diff={m.profitDiff} prevLabel={prev?.label ?? null} />
                </span>
                <span className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] font-light text-muted">
                  <span>
                    Ingresos <span className="font-medium" style={{ color: GREEN }}>{money(m.income)}</span>
                  </span>
                  <span>
                    Gastos <span className="font-medium" style={{ color: RED }}>{money(m.expense)}</span>
                  </span>
                  <span>{plural(m.cuts, 'corte', 'cortes')}{m.avgTicket ? ` · ${money(m.avgTicket)} c/u` : ''}</span>
                  <span>
                    {plural(m.newClients, 'cliente nuevo', 'clientes nuevos')}
                    {m.noShows ? ` · ${plural(m.noShows, 'no vino', 'no vinieron')}` : ''}
                  </span>
                </span>
              </>
            )}
          </button>
        );
      })}
      <span className="px-1 text-xs font-light text-dim">
        La ganancia es lo cobrado en cortes terminados más los otros ingresos, menos los gastos cargados ese mes.
      </span>
    </div>
  );
}

function YearStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex min-w-0 flex-col rounded-2xl bg-field px-3 py-2.5">
      <span className="text-xs font-light text-muted">{label}</span>
      <span className="truncate text-[15px] font-semibold" style={{ color }}>
        {money(value)}
      </span>
    </span>
  );
}

function AddMoney({ kind, cats, reload }: { kind: 'income' | 'expense'; cats: string[]; reload: () => Promise<void> }) {
  const [cat, setCat] = useState(cats[kind === 'income' ? 0 : 1] ?? cats[0]);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amt = Number(amount.replace(/\D/g, ''));
  const ok = desc.trim().length > 1 && amt > 0;
  return (
    <section className="flex flex-col gap-2.5 rounded-[20px] border border-dashed border-dash p-[18px]">
      <span className="text-base font-semibold">{kind === 'income' ? 'Agregar ingreso' : 'Agregar gasto'}</span>
      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <Chip key={c} size="sm" on={cat === c} onClick={() => setCat(c)}>
            {c}
          </Chip>
        ))}
      </div>
      <Field id={`${kind}-d`} label="Detalle" placeholder={kind === 'income' ? 'Detalle (ej: venta de 2 ceras)' : 'Detalle (ej: factura de luz)'} value={desc} onChange={setDesc} />
      <Field id={`${kind}-a`} label="Monto" placeholder="Monto en $" inputMode="numeric" value={amount} onChange={setAmount} />
      <ErrorNote text={error} />
      <PrimaryButton
        disabled={!ok}
        busy={busy}
        className="!min-h-[52px] !text-base"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(`/api/owner/${kind}`, { category: cat, description: desc, amount: amt });
            setDesc('');
            setAmount('');
            await reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {kind === 'income' ? 'Guardar ingreso' : 'Guardar gasto'}
      </PrimaryButton>
    </section>
  );
}

function Ingresos({ f, reload }: { f: Finance; reload: () => Promise<void> }) {
  const max = Math.max(1, ...f.barberCards.map((b) => b.total));
  const del = async (r: MoneyRow) => {
    if (!window.confirm(`¿Borrar "${r.description}"?`)) return;
    await api('/api/owner/income/delete', { id: r.id }).catch(() => {});
    await reload();
  };
  return (
    <>
      <section className="flex items-baseline justify-between gap-3 rounded-[20px] border border-line bg-card px-5 py-[18px]">
        <span className="text-sm font-light text-muted">Total del mes</span>
        <span className="text-[26px] font-semibold" style={{ color: GREEN }}>
          {money(f.income)}
        </span>
      </section>
      <Kicker className="px-1 pt-0.5">Cortes por barbero</Kicker>
      {f.barberCards.map((b, i) => (
        <section key={b.id} className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-card px-5 py-[18px]">
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="text-lg font-semibold">{b.name}</span>
            <span className="text-xl font-semibold">{money(b.total)}</span>
          </div>
          <div className="h-1.5 rounded-[3px] bg-field">
            <div className="h-1.5 rounded-[3px]" style={{ width: `${Math.round((b.total / max) * 100)}%`, background: i % 2 ? 'var(--color-ink)' : 'var(--accent)' }} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {b.parts.map((p) => (
              <span key={p.label} className="flex flex-col rounded-xl bg-field px-2.5 py-2">
                <span className="text-base font-semibold">{p.n}</span>
                <span className="text-xs font-light text-muted">{p.label}</span>
              </span>
            ))}
          </div>
        </section>
      ))}
      <Kicker className="px-1 pt-1.5">Otros ingresos</Kicker>
      {f.incomes.length === 0 && <span className="px-1 text-sm text-muted">Sin otros ingresos este mes.</span>}
      <MoneyList rows={f.incomes} onDelete={del} />
      <AddMoney kind="income" cats={f.incomeCats} reload={reload} />
      <span className="px-1 text-[13px] font-light text-dim">Los cortes se suman solos cuando el barbero los marca como terminados.</span>
    </>
  );
}

function Gastos({ f, reload }: { f: Finance; reload: () => Promise<void> }) {
  const max = f.catTotals[0]?.total || 1;
  const del = async (r: MoneyRow) => {
    if (!window.confirm(`¿Borrar "${r.description}"?`)) return;
    await api('/api/owner/expense/delete', { id: r.id }).catch(() => {});
    await reload();
  };
  return (
    <>
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-card px-5 py-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-light text-muted">Total del mes</span>
          <span className="text-[26px] font-semibold" style={{ color: RED }}>
            {money(f.expense)}
          </span>
        </div>
        {f.catTotals.map((c) => (
          <div key={c.name} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span>{c.name}</span>
              <span className="font-medium">{money(c.total)}</span>
            </div>
            <div className="h-[5px] rounded-[3px] bg-field">
              <div className="h-[5px] rounded-[3px] bg-ink" style={{ width: `${Math.round((c.total / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </section>
      <AddMoney kind="expense" cats={f.expenseCats} reload={reload} />
      <Kicker className="px-1 pt-0.5">Gastos cargados</Kicker>
      {f.expenses.length === 0 && <span className="px-1 text-sm text-muted">Sin gastos este mes.</span>}
      <MoneyList rows={f.expenses} onDelete={del} />
    </>
  );
}

function Estimado({ f, reload }: { f: Finance; reload: () => Promise<void> }) {
  const options = [3_000_000, 3_500_000, 4_000_000, 5_000_000];
  if (!options.includes(f.goal)) options.push(f.goal);
  const [custom, setCustom] = useState('');
  const setGoal = async (amount: number) => {
    await api('/api/owner/goal', { amount }).catch(() => {});
    await reload();
  };
  return (
    <>
      <section className="flex flex-col gap-1 rounded-3xl border border-accent bg-card p-[22px]">
        <span className="text-[13px] tracking-[.16em] text-muted">SI SIGUE ASÍ, EL MES CIERRA EN</span>
        <span className="text-4xl leading-[1.1] font-bold">{money(f.projIncome)}</span>
        <span className="text-[15px] font-light text-soft">
          de ingresos · ganancia estimada <span className="font-semibold text-accent">{money(f.projProfit)}</span>
        </span>
      </section>
      <div className="flex flex-col rounded-[20px] border border-line bg-card px-[18px] py-1">
        {[
          ['Ingresos hasta hoy', money(f.income)],
          ['Días abiertos', `${f.elapsed} de ${f.openDays}`],
          ['Promedio por día', money(f.perDay)],
          ['Turnos ya reservados', `${f.booked.n} · ${money(f.booked.amount)}`],
          ['Gastos del mes', money(f.expense)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-field py-3 text-[15px] last:border-0">
            <span className="font-light text-muted">{k}</span>
            <span className="text-right font-medium">{v}</span>
          </div>
        ))}
      </div>
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-card px-5 py-[18px]">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="text-base font-semibold">Meta de ingresos</span>
          <span className="text-sm font-light text-muted">{f.goalPct}% logrado</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((g) => (
            <Chip key={g} size="sm" on={f.goal === g} onClick={() => setGoal(g)}>
              {money(g)}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <Field id="goal" label="Otra meta" placeholder="Otra meta en $" inputMode="numeric" value={custom} onChange={setCustom} />
          <GhostButton
            disabled={!Number(custom.replace(/\D/g, ''))}
            onClick={() => {
              setGoal(Number(custom.replace(/\D/g, '')));
              setCustom('');
            }}
            className="shrink-0"
          >
            Usar
          </GhostButton>
        </div>
        <div className="relative h-2.5 rounded-[5px] bg-field">
          <div className="absolute top-0 left-0 h-2.5 rounded-[5px] bg-dash" style={{ width: `${f.projPct}%` }} />
          <div className="absolute top-0 left-0 h-2.5 rounded-[5px] bg-accent" style={{ width: `${f.goalPct}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-light text-muted">
          <span>
            <span className="text-accent">■</span> Hasta hoy
          </span>
          <span>
            <span className="text-dash">■</span> Estimado a fin de mes
          </span>
        </div>
        <span className="text-[15px]">
          {f.missing <= 0
            ? 'Con el ritmo actual la meta se cumple.'
            : `Para llegar a la meta faltan ${money(f.missing)} sobre lo estimado (unos ${f.cutsMissing} cortes más).`}
        </span>
      </section>
      <span className="px-1 text-[13px] font-light text-dim">
        El estimado se calcula con el promedio por día abierto y los gastos ya cargados.
      </span>
    </>
  );
}

// ---------------------------------------------------------------------
// Ajustes: datos, horarios, reglas, barberos, servicios, productos
// ---------------------------------------------------------------------
interface Settings {
  business: {
    name: string;
    address: string | null;
    city: string | null;
    whatsapp: string | null;
    instagram: string | null;
    mapsUrl: string | null;
    transferAlias: string | null;
    mpLink: string | null;
    heroUrl: string | null;
    hours: Hours;
    slotStep: number;
    bookingDays: number;
    cancelLimitMin: number;
    loyaltyGoal: number;
    loyaltyReward: 'free' | 'discount' | 'gift';
    loyaltyRewardPct: number;
    loyaltyRewardText: string;
    doubleStampDays: number;
    referralPercent: number;
    monthlyGoal: number;
  };
  barbers: { id: string; name: string; instagram: string | null; photoUrl: string | null; active: boolean }[];
  services: { id: string; name: string; duration: number; price: number; active: boolean }[];
  products: { id: string; name: string; description: string | null; price: number | null; imageUrl: string | null; active: boolean }[];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-card p-[18px]">
      <span className="text-base font-semibold">{title}</span>
      {children}
    </section>
  );
}

function Small({ label, value, onChange, type = 'text', width = 'flex-1', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; width?: string; placeholder?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${width}`}>
      <span className="text-xs font-light text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={type === 'number' ? 'numeric' : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 w-full rounded-xl border border-line bg-field px-3 text-[15px] text-ink placeholder:text-dim"
      />
    </label>
  );
}

function Ajustes({ isOwner, onSaved }: { isOwner: boolean; onSaved: () => Promise<void> }) {
  const [s, setS] = useState<Settings | null>(settingsCache);
  const [biz, setBiz] = useState<Settings['business'] | null>(settingsCache?.business ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const edited = useRef(false);

  const load = useCallback(async (force = false) => {
    const r = await api<Settings>('/api/owner/settings');
    settingsCache = r;
    setS(r);
    // Si ya empezó a escribir en los datos del negocio, no se le pisa lo que escribió
    if (force || !edited.current) setBiz(r.business);
  }, []);
  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  async function save(path: string, body: Record<string, unknown>, ok = 'Guardado.') {
    setMsg(null);
    setError(null);
    try {
      await api(path, body);
      setMsg(ok);
      edited.current = false;
      await Promise.all([load(true), onSaved()]);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  if (!s || !biz) return error ? <ErrorNote text={error} /> : <span className="text-muted">Cargando…</span>;
  const set = (patch: Partial<Settings['business']>) => {
    edited.current = true;
    setBiz({ ...biz, ...patch });
  };
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="flex flex-col gap-3.5">
      <ErrorNote text={error} />
      <OkNote text={msg} />

      <Section title="Datos del negocio">
        <Small label="Dirección" value={biz.address ?? ''} onChange={(v) => set({ address: v })} placeholder="Ej: Av. Sarmiento 1234" />
        <Small label="Ciudad" value={biz.city ?? ''} onChange={(v) => set({ city: v })} />
        <Small label="WhatsApp de la barbería" value={biz.whatsapp ?? ''} onChange={(v) => set({ whatsapp: v })} placeholder="Ej: 362 412-3456" />
        <Small label="Instagram (usuario o link del perfil)" value={biz.instagram ?? ''} onChange={(v) => set({ instagram: v })} placeholder="Ej: tubarberia" />
        <Small label="Link de Google Maps (opcional: si lo dejás vacío se arma con la dirección)" value={biz.mapsUrl ?? ''} onChange={(v) => set({ mapsUrl: v })} placeholder="https://maps.app.goo.gl/..." />
        <Small label="Alias para transferencias" value={biz.transferAlias ?? ''} onChange={(v) => set({ transferAlias: v })} />
        <Small label="Link de pago de Mercado Pago" value={biz.mpLink ?? ''} onChange={(v) => set({ mpLink: v })} placeholder="https://link.mercadopago.com.ar/..." />
      </Section>

      <Section title="Horarios de atención">
        {order.map((d) => {
          const ranges = biz.hours[String(d)] ?? [];
          const setRanges = (r: [string, string][]) => set({ hours: { ...biz.hours, [String(d)]: r } });
          return (
            <div key={d} className="flex flex-col gap-2 border-b border-field pb-2.5 last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium">{DAY_LONG[d]}</span>
                <Chip size="sm" on={ranges.length === 0} onClick={() => setRanges(ranges.length ? [] : [['10:00', '13:00']])} className="!min-h-9">
                  {ranges.length ? 'Abierto' : 'Cerrado'}
                </Chip>
              </div>
              {ranges.map(([a, b], i) => (
                <div key={i} className="flex items-end gap-2">
                  <TimeField id={`h${d}-${i}a`} label="Abre" value={a} onChange={(v) => setRanges(ranges.map((r, k) => (k === i ? [v, r[1]] : r)))} />
                  <TimeField id={`h${d}-${i}b`} label="Cierra" value={b} onChange={(v) => setRanges(ranges.map((r, k) => (k === i ? [r[0], v] : r)))} />
                  <button type="button" aria-label="Quitar horario" onClick={() => setRanges(ranges.filter((_, k) => k !== i))} className="h-12 w-11 shrink-0 rounded-xl border border-line-2 text-dim">
                    ×
                  </button>
                </div>
              ))}
              {ranges.length > 0 && ranges.length < 3 && (
                <button type="button" onClick={() => setRanges([...ranges, ['16:00', '20:00']])} className="self-start text-[13px] text-muted underline">
                  + agregar horario (corrido o partido)
                </button>
              )}
            </div>
          );
        })}
      </Section>

      <Section title="Reglas">
        <div className="grid grid-cols-2 gap-2.5">
          <Small label="Turnos cada (min)" type="number" value={String(biz.slotStep)} onChange={(v) => set({ slotStep: Number(v) })} />
          <Small label="Días para reservar" type="number" value={String(biz.bookingDays)} onChange={(v) => set({ bookingDays: Number(v) })} />
          <Small label="Cancelar hasta (min antes)" type="number" value={String(biz.cancelLimitMin)} onChange={(v) => set({ cancelLimitMin: Number(v) })} />
          <Small label="Descuento invitación (%)" type="number" value={String(biz.referralPercent)} onChange={(v) => set({ referralPercent: Number(v) })} />
        </div>
      </Section>

      <Section title="Tarjeta de fidelidad">
        <span className="text-[13px] font-light text-muted">Qué se lleva el cliente al completar la tarjeta y cuántos cortes necesita.</span>
        <span className="px-1 text-[13px] font-light text-muted">Premio</span>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['free', 'Corte gratis'],
              ['discount', 'Descuento'],
              ['gift', 'Regalo'],
            ] as const
          ).map(([k, label]) => (
            <Chip key={k} size="sm" on={biz.loyaltyReward === k} onClick={() => set({ loyaltyReward: k })}>
              {label}
            </Chip>
          ))}
        </div>
        {biz.loyaltyReward === 'discount' && (
          <Small label="Descuento del premio (%)" type="number" value={String(biz.loyaltyRewardPct)} onChange={(v) => set({ loyaltyRewardPct: Number(v) })} />
        )}
        {biz.loyaltyReward === 'gift' && (
          <Small label="¿Qué se lleva?" value={biz.loyaltyRewardText ?? ''} onChange={(v) => set({ loyaltyRewardText: v })} placeholder="Ej: una cera mate" />
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Small label="Cortes para el premio" type="number" value={String(biz.loyaltyGoal)} onChange={(v) => set({ loyaltyGoal: Number(v) })} />
          <Small label="Doble sello (días, 0 = no)" type="number" value={String(biz.doubleStampDays)} onChange={(v) => set({ doubleStampDays: Number(v) })} />
        </div>
        <span className="rounded-[14px] bg-field px-4 py-3 text-sm">
          Así lo ven los clientes:{' '}
          <span className="font-medium text-accent">
            {
              prizeInfo({
                kind: biz.loyaltyReward,
                pct: biz.loyaltyRewardPct,
                text: biz.loyaltyRewardText || null,
                goal: Math.max(2, Number(biz.loyaltyGoal) || 2),
              }).title
            }
          </span>
          . Se sellan {Math.max(1, (Number(biz.loyaltyGoal) || 2) - 1)} cortes y el siguiente tiene el premio.
        </span>
      </Section>
      <PrimaryButton onClick={() => save('/api/owner/business', biz, 'Datos, horarios, reglas y tarjeta guardados.')}>Guardar datos, horarios, reglas y tarjeta</PrimaryButton>

      <Section title="Foto de portada">
        <span className="text-[13px] font-light text-muted">Se ve de fondo en el inicio de la web. Mejor una foto del local, horizontal y oscura.</span>
        <PhotoPicker
          current={biz.heroUrl}
          label="Subir foto"
          max={1600}
          shape="wide"
          onUpload={async (data) => {
            await save('/api/owner/image', { target: 'hero', data }, 'Foto de portada actualizada.');
          }}
          onRemove={async () => {
            await save('/api/owner/image/delete', { target: 'hero' }, 'Foto de portada quitada.');
          }}
        />
      </Section>

      <ClosedDays barbers={s.barbers.filter((b) => b.active)} />

      <Section title="Barberos">
        {s.barbers.map((b) => (
          <BarberRow key={b.id} b={b} save={save} />
        ))}
        <NewBarber save={save} />
      </Section>

      <Section title="Servicios y precios">
        {s.services.map((sv) => (
          <ServiceRow key={sv.id} sv={sv} save={save} />
        ))}
        <ServiceRow save={save} />
      </Section>

      <Section title="Productos">
        {s.products.map((p) => (
          <ProductRow key={p.id} p={p} save={save} />
        ))}
        <ProductRow save={save} />
      </Section>

      {isOwner && <PasswordForm />}
    </div>
  );
}

type Save = (path: string, body: Record<string, unknown>, ok?: string) => Promise<boolean>;

function BarberRow({ b, save }: { b: Settings['barbers'][number]; save: Save }) {
  const [code, setCode] = useState('');
  return (
    <div className="flex flex-col gap-2 border-b border-field pb-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[15px] font-medium ${b.active ? '' : 'text-dim line-through'}`}>{b.name}</span>
        <Chip size="sm" on={b.active} onClick={() => save('/api/owner/barber/update', { id: b.id, active: !b.active }, b.active ? `${b.name} quedó inactivo.` : `${b.name} volvió a estar activo.`)} className="!min-h-9">
          {b.active ? 'Activo' : 'Inactivo'}
        </Chip>
      </div>
      <PhotoPicker
        current={b.photoUrl}
        label="Subir foto"
        shape="round"
        max={600}
        onUpload={async (data) => {
          await save('/api/owner/image', { target: 'barber', id: b.id, data }, `Foto de ${b.name} actualizada.`);
        }}
        onRemove={async () => {
          await save('/api/owner/image/delete', { target: 'barber', id: b.id }, `Foto de ${b.name} quitada.`);
        }}
      />
      <div className="flex items-end gap-2">
        <Small label="Nuevo código" type="password" value={code} onChange={setCode} placeholder="Mínimo 4" />
        <GhostButton
          disabled={code.length < 4}
          onClick={async () => {
            if (await save('/api/owner/barber/update', { id: b.id, code }, `Código de ${b.name} cambiado.`)) setCode('');
          }}
          className="shrink-0 !min-h-12"
        >
          Cambiar
        </GhostButton>
      </div>
    </div>
  );
}

function NewBarber({ save }: { save: Save }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  return (
    <div className="flex flex-col gap-2 pt-1">
      <span className="text-[13px] text-muted">Dar de alta un barbero</span>
      <div className="flex gap-2">
        <Small label="Nombre" value={name} onChange={setName} />
        <Small label="Código para entrar" type="password" value={code} onChange={setCode} />
      </div>
      <GhostButton
        disabled={name.trim().length < 2 || code.length < 4}
        onClick={async () => {
          if (await save('/api/owner/barber', { name, code }, `${name} ya puede entrar al panel con su nombre y código.`)) {
            setName('');
            setCode('');
          }
        }}
      >
        Agregar barbero
      </GhostButton>
    </div>
  );
}

function ServiceRow({ sv, save }: { sv?: Settings['services'][number]; save: Save }) {
  const [name, setName] = useState(sv?.name ?? '');
  const [duration, setDuration] = useState(String(sv?.duration ?? 30));
  const [price, setPrice] = useState(sv ? String(sv.price) : '');
  const isNew = !sv;
  return (
    <div className="flex flex-col gap-2 border-b border-field pb-2.5 last:border-0">
      {isNew && <span className="text-[13px] text-muted">Nuevo servicio</span>}
      <Small label="Nombre" value={name} onChange={setName} />
      <div className="flex items-end gap-2">
        <Small label="Minutos" type="number" value={duration} onChange={setDuration} />
        <Small label="Precio $" type="number" value={price} onChange={setPrice} />
      </div>
      <div className="flex gap-2">
        <GhostButton
          disabled={name.trim().length < 2 || !price}
          onClick={async () => {
            const ok = await save(isNew ? '/api/owner/service' : '/api/owner/service/update', { id: sv?.id, name, duration: Number(duration), price: Number(price), active: sv?.active ?? true });
            if (ok && isNew) {
              setName('');
              setPrice('');
            }
          }}
          className="flex-1 !min-h-11"
        >
          {isNew ? 'Agregar servicio' : 'Guardar'}
        </GhostButton>
        {sv && (
          <Chip size="sm" on={sv.active} onClick={() => save('/api/owner/service/update', { id: sv.id, name: sv.name, duration: sv.duration, price: sv.price, active: !sv.active })} className="!min-h-11">
            {sv.active ? 'Visible' : 'Oculto'}
          </Chip>
        )}
      </div>
    </div>
  );
}

function ProductRow({ p, save }: { p?: Settings['products'][number]; save: Save }) {
  const [name, setName] = useState(p?.name ?? '');
  const [description, setDescription] = useState(p?.description ?? '');
  const [price, setPrice] = useState(p?.price !== null && p?.price !== undefined ? String(p.price) : '');
  const isNew = !p;
  return (
    <div className="flex flex-col gap-2 border-b border-field pb-2.5 last:border-0">
      {isNew && <span className="text-[13px] text-muted">Nuevo producto</span>}
      {p && (
        <PhotoPicker
          current={p.imageUrl}
          label="Subir foto"
          max={800}
          onUpload={async (data) => {
            await save('/api/owner/image', { target: 'product', id: p.id, data }, `Foto de ${p.name} actualizada.`);
          }}
          onRemove={async () => {
            await save('/api/owner/image/delete', { target: 'product', id: p.id }, `Foto de ${p.name} quitada.`);
          }}
        />
      )}
      <Small label="Nombre" value={name} onChange={setName} />
      <Small label="Para qué sirve" value={description} onChange={setDescription} />
      <Small label="Precio $ (vacío = consultar)" type="number" value={price} onChange={setPrice} />
      <div className="flex gap-2">
        <GhostButton
          disabled={name.trim().length < 2}
          onClick={async () => {
            const ok = await save(isNew ? '/api/owner/product' : '/api/owner/product/update', {
              id: p?.id,
              name,
              description,
              price: price === '' ? null : Number(price),
              active: p?.active ?? true,
            });
            if (ok && isNew) {
              setName('');
              setDescription('');
              setPrice('');
            }
          }}
          className="flex-1 !min-h-11"
        >
          {isNew ? 'Agregar producto' : 'Guardar'}
        </GhostButton>
        {p && (
          <Chip size="sm" on={p.active} onClick={() => save('/api/owner/product/update', { id: p.id, name: p.name, description: p.description, price: p.price, active: !p.active })} className="!min-h-11">
            {p.active ? 'Visible' : 'Oculto'}
          </Chip>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Días cerrados (feriados) y vacaciones de los barberos
// ---------------------------------------------------------------------
function ClosedDays({ barbers }: { barbers: { id: string; name: string }[] }) {
  const [data, setData] = useState<{ today: string; blocks: Block[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ today: string; blocks: Block[] }>('/api/owner/blocks').then(setData).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);
  return (
    <Section title="Feriados, vacaciones y horarios bloqueados">
      <span className="text-[13px] font-light text-muted">
        Cerrá el local un día (feriado) o bloqueá a un barbero (vacaciones, franco). En esos horarios la web no deja reservar.
      </span>
      <OkNote text={msg} />
      <ErrorNote text={error} />
      {data && (
        <BlocksList
          blocks={data.blocks}
          empty="No hay días ni horarios bloqueados."
          canDelete={() => true}
          onDelete={async (b) => {
            setError(null);
            setMsg(null);
            try {
              await api('/api/owner/blocks/delete', { id: b.id });
              setMsg('Bloqueo quitado.');
              load();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}
      {data && open ? (
        <BlockForm
          endpoint="/api/owner/blocks"
          today={data.today}
          barbers={barbers}
          reasons={['Feriado', 'Vacaciones', 'Franco', 'Evento']}
          onDone={(m) => {
            setOpen(false);
            setMsg(m);
            load();
          }}
        />
      ) : (
        <GhostButton onClick={() => setOpen(true)}>Bloquear días u horarios</GhostButton>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------
// Turnos del día de todos los barberos
// ---------------------------------------------------------------------
interface OwnerAgenda {
  day: string;
  dayLabel: string;
  today: string;
  days: string[];
  barbers: {
    id: string;
    name: string;
    rows: { id: string; time: string; clientName: string; clientPhone: string; serviceName: string; status: string; source: string; confirmed: boolean; total: number }[];
    blocks: Block[];
  }[];
  closures: Block[];
  totals: { booked: number; done: number; noShow: number; amount: number };
}

const STATUS_TEXT: Record<string, string> = {
  booked: 'Reservado',
  in_progress: 'Cortando',
  completed: 'Atendido',
  no_show: 'No vino',
};

function DayAgenda() {
  const [day, setDay] = useState<string | null>(null);
  const [a, setA] = useState<OwnerAgenda | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<OwnerAgenda>(`/api/owner/agenda${day ? `?day=${day}` : ''}`).then(setA).catch((e) => setError((e as Error).message));
  }, [day]);
  if (!a) return error ? <ErrorNote text={error} /> : <span className="text-muted">Cargando…</span>;
  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {a.days.map((d) => (
          <Chip key={d} size="sm" on={d === a.day} onClick={() => setDay(d)} className="shrink-0">
            {d === a.today ? 'Hoy' : d === addDays(a.today, 1) ? 'Mañana' : d === addDays(a.today, -1) ? 'Ayer' : `${DAY_SHORT[dow(d)]} ${Number(d.slice(8))}`}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat value={a.totals.booked} label="Por venir" />
        <MiniStat value={a.totals.done} label="Atendidos" />
        <MiniStat value={a.totals.noShow} label="No vinieron" />
      </div>
      <span className="px-1 text-sm font-light text-muted">
        {a.dayLabel} · {money(a.totals.amount)} entre turnos y productos
      </span>
      {a.closures.map((c) => (
        <span key={c.id} className="rounded-2xl border border-dashed border-dash px-4 py-3 text-sm text-muted">
          Local cerrado {c.allDay ? 'todo el día' : `de ${c.from} a ${c.to}`}
          {c.reason ? ` · ${c.reason}` : ''}
        </span>
      ))}
      {a.barbers.map((b) => (
        <Section key={b.id} title={`${b.name} · ${plural(b.rows.filter((r) => r.source !== 'fila').length, 'turno', 'turnos')}`}>
          {b.blocks.map((x) => (
            <span key={x.id} className="text-[13px] text-muted">
              Bloqueado {x.allDay ? 'todo el día' : `de ${x.from} a ${x.to}`}
              {x.reason ? ` · ${x.reason}` : ''}
            </span>
          ))}
          {b.rows.length === 0 && <span className="text-sm text-muted">Sin turnos.</span>}
          {b.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-field py-2 last:border-0">
              <span className="min-w-[48px] text-[15px] font-semibold">{r.time}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate text-[15px] ${r.status === 'no_show' ? 'text-dim line-through' : ''}`}>{r.clientName}</span>
                <span className="truncate text-xs font-light text-muted">
                  {r.serviceName}
                  {r.clientPhone ? ` · ${r.clientPhone}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-[13px]">{money(r.total)}</span>
                <span className="text-[11px] text-muted">
                  {r.source === 'fila' ? 'Sin turno' : r.status === 'booked' && r.confirmed ? 'Confirmó' : STATUS_TEXT[r.status] ?? r.status}
                </span>
              </span>
            </div>
          ))}
        </Section>
      ))}
    </div>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-card py-3">
      <span className="text-[22px] font-semibold">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Clientes del negocio
// ---------------------------------------------------------------------
interface ClientItem {
  id: string;
  name: string;
  phone: string;
  phoneDisplay: string;
  email: string | null;
  stamps: number;
  visits: number;
  lastVisitOn: string | null;
  noShows: number;
  invited: number;
  nextDay: string | null;
}

function ClientsList() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ goal: number; total: number; clients: ClientItem[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ goal: number; total: number; clients: ClientItem[] }>(`/api/owner/clients?q=${encodeURIComponent(q)}`)
        .then(setData)
        .catch(() => setData({ goal: 10, total: 0, clients: [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const fmt = (d: string | null) => (d ? `${Number(d.slice(8))}/${Number(d.slice(5, 7))}` : '—');
  return (
    <div className="flex flex-col gap-2.5">
      <Field id="oq" label="Buscar" type="search" placeholder="Buscar por nombre, teléfono o correo" value={q} onChange={setQ} autoFocus />
      {q.trim() && <span className="px-1 text-[13px] font-light text-muted">Sin importar tildes ni cómo esté escrito el teléfono (con 0, 15 o +54 9).</span>}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-muted">{data ? `${data.total}${data.total === 500 ? '+' : ''} clientes` : 'Cargando…'}</span>
        <a href={`/api/owner/clients?format=csv&q=${encodeURIComponent(q)}`} className="text-sm text-accent underline">
          Descargar planilla (Excel)
        </a>
      </div>
      {data?.clients.map((c) => (
        <div key={c.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-card px-4 py-3">
          <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="flex items-center gap-3 bg-transparent p-0 text-left text-ink" aria-expanded={open === c.id}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-medium">{c.name}</span>
              <span className="truncate text-[13px] font-light text-muted">
                {c.visits} {c.visits === 1 ? 'visita' : 'visitas'} · último corte {fmt(c.lastVisitOn)}
                {c.noShows ? ` · faltó ${c.noShows}` : ''}
              </span>
            </span>
            <span className="text-base font-semibold text-accent">
              {Math.min(c.stamps, (data?.goal ?? 10) - 1)}/{data?.goal ?? 10}
            </span>
          </button>
          {open === c.id && (
            <div className="flex flex-col gap-1.5 border-t border-field pt-2 text-sm font-light text-soft">
              <a href={`tel:${c.phone}`} className="underline">
                {c.phoneDisplay}
              </a>
              {c.email && <span>{c.email}</span>}
              <span>Próximo turno: {c.nextDay ? fmt(c.nextDay) : 'ninguno'}</span>
              <span>Invitó a {c.invited} {c.invited === 1 ? 'amigo' : 'amigos'}</span>
              <a
                href={enviarWhatsApp({ to: c.phone, text: `Hola ${c.name.split(' ')[0]}! ` }).url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                Escribirle por WhatsApp
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
