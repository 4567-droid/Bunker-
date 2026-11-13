'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BottomNav, Chip, ErrorNote, Field, GhostButton, Kicker, LoginShell, OkNote, PrimaryButton, type NavTab } from '@/components/ui';
import { api } from '@/lib/api-client';
import { money } from '@/lib/format';
import { DAY_LONG, type Hours } from '@/lib/time';

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
};
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
  const [f, setF] = useState<Finance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setF(await api<Finance>(`/api/owner/finance${month ? `?month=${month}` : ''}`));
    } catch (e) {
      if ((e as Error).message.includes('ingresar')) onLogout();
      else setError((e as Error).message);
    }
  }, [month, onLogout]);

  useEffect(() => {
    load();
  }, [load]);

  async function logout() {
    await api('/api/staff/logout', {}).catch(() => {});
    onLogout();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-4 pt-5 pb-1">
        <span className="flex flex-col leading-tight">
          <span className="flex items-center gap-1 text-[13px] tracking-[.18em] text-muted uppercase">
            {f && tab !== 'ajustes' && (
              <button type="button" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(f.month, -1))} className="-ml-2 min-h-9 px-2 text-muted">
                ‹
              </button>
            )}
            Central{f ? ` · ${f.monthLabel}` : ''}
            {f && tab !== 'ajustes' && !f.isCurrent && (
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
        {!f && tab !== 'ajustes' && <span className="text-muted">Cargando…</span>}
        {f && tab === 'resumen' && <Resumen f={f} go={setTab} />}
        {f && tab === 'ingresos' && <Ingresos f={f} reload={load} />}
        {f && tab === 'gastos' && <Gastos f={f} reload={load} />}
        {f && tab === 'estimado' && <Estimado f={f} reload={load} />}
        {tab === 'ajustes' && <Ajustes isOwner={isOwner} onSaved={load} />}
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
            <div className="h-1.5 rounded-[3px]" style={{ width: `${Math.round((b.total / max) * 100)}%`, background: i % 2 ? '#EDEAE2' : 'var(--accent)' }} />
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
    hours: Hours;
    slotStep: number;
    bookingDays: number;
    cancelLimitMin: number;
    loyaltyGoal: number;
    doubleStampDays: number;
    referralPercent: number;
    monthlyGoal: number;
  };
  barbers: { id: string; name: string; instagram: string | null; active: boolean }[];
  services: { id: string; name: string; duration: number; price: number; active: boolean }[];
  products: { id: string; name: string; description: string | null; price: number | null; active: boolean }[];
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
  const [s, setS] = useState<Settings | null>(null);
  const [biz, setBiz] = useState<Settings['business'] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<Settings>('/api/owner/settings');
    setS(r);
    setBiz(r.business);
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
      await load();
      await onSaved();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  if (!s || !biz) return error ? <ErrorNote text={error} /> : <span className="text-muted">Cargando…</span>;
  const set = (patch: Partial<Settings['business']>) => setBiz({ ...biz, ...patch });
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="flex flex-col gap-3.5">
      <ErrorNote text={error} />
      <OkNote text={msg} />

      <Section title="Datos del negocio">
        <Small label="Dirección" value={biz.address ?? ''} onChange={(v) => set({ address: v })} placeholder="Ej: Av. Sarmiento 1234" />
        <Small label="Ciudad" value={biz.city ?? ''} onChange={(v) => set({ city: v })} />
        <Small label="WhatsApp (con 549)" value={biz.whatsapp ?? ''} onChange={(v) => set({ whatsapp: v })} placeholder="5493625493647" />
        <Small label="Instagram" value={biz.instagram ?? ''} onChange={(v) => set({ instagram: v })} />
        <Small label="Link de Google Maps" value={biz.mapsUrl ?? ''} onChange={(v) => set({ mapsUrl: v })} />
        <Small label="Alias para transferencias" value={biz.transferAlias ?? ''} onChange={(v) => set({ transferAlias: v })} />
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
                  <Small label="Abre" type="time" value={a} onChange={(v) => setRanges(ranges.map((r, k) => (k === i ? [v, r[1]] : r)))} />
                  <Small label="Cierra" type="time" value={b} onChange={(v) => setRanges(ranges.map((r, k) => (k === i ? [r[0], v] : r)))} />
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
          <Small label="Sellos de la tarjeta" type="number" value={String(biz.loyaltyGoal)} onChange={(v) => set({ loyaltyGoal: Number(v) })} />
          <Small label="Doble sello (días)" type="number" value={String(biz.doubleStampDays)} onChange={(v) => set({ doubleStampDays: Number(v) })} />
          <Small label="Descuento invitación (%)" type="number" value={String(biz.referralPercent)} onChange={(v) => set({ referralPercent: Number(v) })} />
        </div>
      </Section>
      <PrimaryButton onClick={() => save('/api/owner/business', biz, 'Datos, horarios y reglas guardados.')}>Guardar datos, horarios y reglas</PrimaryButton>

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

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title="Cambiar mi contraseña">
      <Small label="Contraseña actual" type="password" value={current} onChange={setCurrent} />
      <Small label="Contraseña nueva (mínimo 8)" type="password" value={next} onChange={setNext} />
      <ErrorNote text={error} />
      <OkNote text={msg} />
      <GhostButton
        disabled={!current || next.length < 8}
        onClick={async () => {
          setError(null);
          setMsg(null);
          try {
            await api('/api/owner/password', { current, next });
            setMsg('Contraseña cambiada.');
            setCurrent('');
            setNext('');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Cambiar contraseña
      </GhostButton>
    </Section>
  );
}
