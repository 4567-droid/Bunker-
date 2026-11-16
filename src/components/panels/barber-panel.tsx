'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BottomNav,
  Chip,
  Dot,
  ErrorNote,
  Field,
  GREEN,
  GhostButton,
  Kicker,
  LoginShell,
  OkNote,
  PrimaryButton,
  RED,
  Stat,
  StampGrid,
  WaLink,
  type NavTab,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { firstName, money } from '@/lib/format';
import { addDays, DAY_SHORT, dayLabel, dow, toMin } from '@/lib/time';
import { enviarWhatsApp } from '@/lib/whatsapp';
import { BlockForm, BlocksList, SectionTitle, type Block } from './shared';

interface Service {
  id: string;
  name: string;
  duration: number;
  price: number;
}
interface Staff {
  id: string;
  name: string;
  role: string;
}
interface Row {
  id: string;
  time: string;
  projectedTime: string | null;
  start: number;
  serviceName: string;
  clientName: string;
  status: string;
  source: string;
  confirmed: boolean;
  reminded: boolean;
  total: number;
  discountReason: string | null;
  client: {
    id: string | null;
    phone: string | null;
    phoneDisplay: string;
    email: string | null;
    stamps: number | null;
    nextFree: boolean;
    doubleStamp: boolean;
    visits: number;
    noShows: number;
  };
}
interface Agenda {
  day: string;
  today: string;
  now: string;
  goal: number;
  barber: { id: string; name: string };
  status: { state: 'free' | 'busy' | 'cutting'; freeInMin: number | null };
  counters: { total: number; confirmed: number; done: number; noShow: number };
  rows: Row[];
  blocks: (Block & { start: number; end: number })[];
  cutting: { id: string; leftMin: number; endTime: string } | null;
  next: { id: string; name: string; phone: string | null; time: string; newTime: string | null } | null;
}
interface Queue {
  waiting: { id: string; name: string; position: number; hasAccount: boolean }[];
  called: { id: string; name: string; phone: string | null; phoneDisplay: string; hasAccount: boolean }[];
}

const TABS: NavTab[] = [
  { id: 'agenda', label: 'Agenda', icon: 'turno' },
  { id: 'estado', label: 'Estado', icon: 'estado' },
  { id: 'fila', label: 'Fila', icon: 'fila' },
  { id: 'nuevo', label: 'Nuevo', icon: 'nuevo' },
  { id: 'clientes', label: 'Clientes', icon: 'clientes' },
];
const EST = [10, 15, 20, 30, 45];

export function BarberPanel({ brand, services, today }: { brand: string; services: Service[]; today: string }) {
  const [staff, setStaff] = useState<Staff | null | undefined>(undefined);
  useEffect(() => {
    api<{ staff: Staff | null }>('/api/staff/me')
      .then((r) => setStaff(r.staff?.role === 'barber' ? r.staff : null))
      .catch(() => setStaff(null));
  }, []);
  if (staff === undefined) return <div className="p-8 text-muted">Cargando…</div>;
  if (!staff) return <BarberLogin brand={brand} onDone={setStaff} />;
  return <BarberApp staff={staff} brand={brand} services={services} initialToday={today} onLogout={() => setStaff(null)} />;
}

function BarberLogin({ brand, onDone }: { brand: string; onDone: (s: Staff) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ staff: Staff }>('/api/staff/login', { role: 'barber', username: name, password: code });
      onDone(r.staff);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LoginShell brand={brand} title="Panel del barbero" sub="Entrás con tu nombre y tu código. Solo ves tus turnos.">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field id="b1" label="Tu nombre" autoComplete="username" value={name} onChange={setName} />
        <Field id="b2" label="Contraseña o código" type="password" autoComplete="current-password" value={code} onChange={setCode} />
        <ErrorNote text={error} />
        <PrimaryButton type="submit" disabled={!name.trim() || !code} busy={busy} className="mt-2">
          Ingresar
        </PrimaryButton>
      </form>
    </LoginShell>
  );
}

function BarberApp({ staff, brand, services, initialToday, onLogout }: { staff: Staff; brand: string; services: Service[]; initialToday: string; onLogout: () => void }) {
  const [tab, setTab] = useState('agenda');
  const [day, setDay] = useState(initialToday);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [est, setEst] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const today = agenda?.today ?? initialToday;

  const loadAgenda = useCallback(async (d: string) => {
    try {
      const a = await api<Agenda>(`/api/barber/agenda?day=${d}`);
      setAgenda(a);
      setSel((s) => (s && a.rows.some((r) => r.id === s) ? s : (a.rows.find((r) => r.status === 'in_progress' || r.status === 'booked')?.id ?? a.rows[0]?.id ?? null)));
    } catch (e) {
      if ((e as Error).message.includes('ingresar')) onLogout();
    }
  }, [onLogout]);

  const loadQueue = useCallback(async () => {
    try {
      setQueue(await api<Queue>('/api/barber/queue'));
    } catch {
      /* reintenta */
    }
  }, []);

  useEffect(() => {
    loadAgenda(day);
    const t = setInterval(() => loadAgenda(day), 30_000);
    return () => clearInterval(t);
  }, [day, loadAgenda]);

  useEffect(() => {
    loadQueue();
    const t = setInterval(loadQueue, 15_000);
    return () => clearInterval(t);
  }, [loadQueue]);

  async function act(path: string, body: Record<string, unknown>, okText?: string, after?: () => void) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const r = await api<Record<string, unknown>>(path, body);
      if (okText) setOk(okText);
      after?.();
      await Promise.all([loadAgenda(day), loadQueue()]);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function complete(id?: string) {
    const r = await act('/api/barber/complete', id ? { id } : {});
    if (r) {
      const added = Number(r.added ?? 0);
      setOk(r.free ? 'Listo: era su corte gratis. La tarjeta vuelve a empezar.' : added ? `Corte registrado: +${added} ${added === 2 ? 'sellos (doble sello)' : 'sello'}.` : 'Corte registrado.');
    }
  }

  function pick(t: string) {
    setTab(t);
    setError(null);
    setOk(null);
    if (t === 'estado' && day !== today) setDay(today);
  }

  async function logout() {
    await api('/api/staff/logout', {}).catch(() => {});
    onLogout();
  }

  const state = agenda?.status.state ?? 'free';
  const cutting = agenda?.cutting ?? null;
  const stShort = state === 'cutting' ? 'Cortando' : state === 'busy' ? 'Ocupado' : 'Libre';
  const stDot = state === 'free' ? GREEN : RED;
  const selRow = agenda?.rows.find((r) => r.id === sel) ?? null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-4 pt-5 pb-2">
        <span className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-xl font-semibold text-bg">{staff.name.charAt(0).toUpperCase()}</span>
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-semibold">Hola, {staff.name}</span>
            <span className="text-[13px] font-light text-muted">{dayLabel(today)}</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-2 text-[13px]">
          <Dot color={stDot} />
          {stShort}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-3.5 px-4 pt-3 pb-6">
        <ErrorNote text={error} />
        <OkNote text={ok} />

        {tab === 'agenda' && agenda && (
          <>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((d, i) => (
                <Chip key={d} size="sm" on={d === day} onClick={() => setDay(d)} className="shrink-0">
                  {i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${DAY_SHORT[dow(d)]} ${Number(d.slice(8))}`}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={agenda.counters.total} label={day === today ? 'Turnos hoy' : 'Turnos'} />
              <Stat value={agenda.counters.confirmed} label="Confirmaron" color={GREEN} />
              <Stat value={agenda.counters.done} label="Atendidos" />
            </div>
            <Kicker className="px-1 pt-1">{day === today ? 'Mis turnos de hoy' : `Mis turnos · ${dayLabel(day)}`}</Kicker>
            {agenda.rows.length === 0 && agenda.blocks.length === 0 && <span className="text-muted">No tenés turnos {day === today ? 'hoy' : 'ese día'}.</span>}
            {agenda.blocks
              .filter((b) => b.allDay)
              .map((b) => (
                <BlockRow key={b.id} b={b} />
              ))}
            {[...agenda.rows.map((r) => ({ at: r.start, r, b: null })), ...agenda.blocks.filter((b) => !b.allDay).map((b) => ({ at: b.start, r: null, b }))]
              .sort((x, y) => x.at - y.at)
              .map(({ r, b }) => {
              if (b) return <BlockRow key={b.id} b={b} />;
              if (!r) return null;
              const on = r.id === sel;
              const st =
                r.status === 'completed'
                  ? { t: r.source === 'fila' ? 'Sin turno · atendido' : 'Atendido', dot: '#6E6B63', c: 'text-dim' }
                  : r.status === 'no_show'
                    ? { t: 'No vino', dot: '#6E6B63', c: 'text-dim' }
                  : r.status === 'in_progress'
                    ? { t: 'Cortando', dot: RED, c: 'text-ink' }
                    : r.confirmed
                      ? { t: 'Confirmó', dot: GREEN, c: 'text-soft' }
                      : { t: 'Sin confirmar', dot: 'var(--accent)', c: 'text-muted' };
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSel(r.id)}
                  aria-pressed={on}
                  className={`flex min-h-[68px] w-full items-center gap-3.5 rounded-2xl border-[1.5px] px-4 py-2.5 text-left text-ink ${on ? 'border-accent bg-pick' : 'border-line bg-card'}`}
                >
                  <span className="flex min-w-[52px] flex-col leading-[1.1]">
                    <span className="text-lg font-semibold">{r.projectedTime ?? r.time}</span>
                    {r.projectedTime && <span className="text-xs text-dim line-through">{r.time}</span>}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base font-medium">{r.clientName}</span>
                    <span className="text-[13px] font-light text-muted">{r.serviceName}</span>
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs ${st.c}`}>
                    <Dot color={st.dot} size={8} glow={false} />
                    {st.t}
                  </span>
                </button>
              );
            })}

            {selRow && (
              <section className="flex flex-col gap-3.5 rounded-3xl border border-accent bg-card p-5">
                <div className="flex flex-col">
                  <Kicker>Cliente · {selRow.projectedTime ?? selRow.time}</Kicker>
                  <span className="text-2xl font-semibold">{selRow.clientName}</span>
                  <span className="text-sm font-light text-muted">
                    {selRow.serviceName}
                    {selRow.client.phoneDisplay ? (
                      <>
                        {' · '}
                        <a href={`tel:${selRow.client.phone}`} className="underline">
                          {selRow.client.phoneDisplay}
                        </a>
                      </>
                    ) : null}
                  </span>
                  <span className="text-sm font-light text-muted">
                    Cobrar {money(selRow.total)}
                    {selRow.discountReason ? ` · ${selRow.discountReason}` : ''}
                  </span>
                  {selRow.client.id && (
                    <span className="text-sm font-light text-muted">
                      {selRow.client.visits === 0 ? 'Primera vez en el local' : `${selRow.client.visits} ${selRow.client.visits === 1 ? 'visita' : 'visitas'}`}
                      {selRow.client.noShows > 0 && <span className="text-bad"> · faltó {selRow.client.noShows} {selRow.client.noShows === 1 ? 'vez' : 'veces'}</span>}
                    </span>
                  )}
                  {(selRow.status === 'booked' || selRow.status === 'in_progress') && selRow.source !== 'fila' && (
                    <span className="mt-1 inline-flex items-center gap-2 text-sm">
                      <Dot color={selRow.confirmed ? GREEN : 'var(--accent)'} size={8} glow={false} />
                      {selRow.confirmed ? 'Confirmó que viene' : 'Todavía no confirmó'}
                    </span>
                  )}
                </div>
                {selRow.client.id ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-light text-muted">
                      Tarjeta: {Math.min(selRow.client.stamps ?? 0, agenda.goal - 1)} de {agenda.goal}
                    </span>
                    <StampGrid stamps={selRow.client.stamps ?? 0} goal={agenda.goal} mini />
                  </div>
                ) : (
                  <span className="text-[13px] font-light text-muted">Sin cuenta: este corte no suma sellos.</span>
                )}
                {selRow.status !== 'completed' && selRow.client.nextFree && (
                  <span className="text-sm text-accent">Con este corte completa la tarjeta: es gratis.</span>
                )}
                {selRow.status !== 'completed' && !selRow.client.nextFree && selRow.client.doubleStamp && (
                  <span className="text-sm text-accent">Volvió antes de 30 días: suma doble sello.</span>
                )}
                {selRow.status === 'booked' && day === today && !cutting && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-light text-muted">¿Cuánto tardás?</span>
                    <div className="grid grid-cols-5 gap-1.5">
                      {EST.map((n) => (
                        <Chip key={n} size="sm" on={est === n} onClick={() => setEst(n)} className="!min-h-11 !px-0">
                          {n}&apos;
                        </Chip>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act('/api/barber/start', { id: selRow.id, minutes: est }, undefined, () => setTab('estado'))}
                      className="min-h-[52px] rounded-full border-[1.5px] border-accent bg-transparent text-base font-medium text-ink"
                    >
                      Empezar corte · {est} min
                    </button>
                  </div>
                )}
                {cutting?.id === selRow.id && <span className="text-sm text-bad">Cortando ahora · terminás a las {cutting.endTime}</span>}
                {selRow.status === 'booked' && selRow.client.phone && isUpcoming(selRow, agenda) && (
                  <ReminderButton row={selRow} agenda={agenda} brand={brand} me={staff.name} onSent={() => act('/api/barber/remind', { id: selRow.id })} />
                )}
                {selRow.status === 'no_show' ? (
                  <span className="text-sm text-muted">Marcado como ausente: el horario quedó libre.</span>
                ) : (
                  <PrimaryButton onClick={() => complete(selRow.id)} disabled={selRow.status === 'completed'} busy={busy} className="!text-base">
                    {selRow.status === 'completed' ? 'Corte registrado' : 'Vino · marcar y sellar'}
                  </PrimaryButton>
                )}
                {selRow.status === 'booked' && !isUpcoming(selRow, agenda) && (
                  <GhostButton
                    small
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`¿Marcar que ${selRow.clientName} no vino?`)) act('/api/barber/noshow', { id: selRow.id }, 'Anotado: no vino. El horario quedó libre.');
                    }}
                  >
                    No vino
                  </GhostButton>
                )}
                {(selRow.status === 'booked' || selRow.status === 'in_progress') && (
                  <GhostButton
                    small
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`¿Cancelar el turno de ${selRow.clientName}?`)) act('/api/barber/cancel', { id: selRow.id }, 'Turno cancelado.');
                    }}
                  >
                    Cancelar turno
                  </GhostButton>
                )}
              </section>
            )}
          </>
        )}

        {tab === 'estado' && agenda && (
          <>
            <section
              className="flex flex-col items-center gap-2.5 rounded-3xl border bg-card px-5 py-7 text-center"
              style={{ borderColor: state === 'free' ? GREEN : state === 'cutting' ? RED : '#2A2A27' }}
            >
              <span className="h-[22px] w-[22px] rounded-full" style={{ background: stDot, boxShadow: `0 0 18px ${stDot}` }} />
              <span className="text-[26px] font-semibold">
                {cutting ? `Cortando · libre a las ${cutting.endTime}` : state === 'free' ? 'Estás libre' : 'Estás ocupado'}
              </span>
              <span className="text-sm font-light text-muted">
                {cutting ? `En la web se ve: ${staff.name} se libera en ${cutting.leftMin} min.` : 'Así te ven los clientes en la web ahora.'}
              </span>
            </section>
            {!cutting ? (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['free', 'busy'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      aria-pressed={state === s}
                      onClick={() => act('/api/barber/status', { state: s })}
                      className="flex min-h-16 items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] text-base font-medium text-ink"
                      style={{
                        borderColor: state === s ? (s === 'free' ? GREEN : RED) : '#2A2A27',
                        background: state === s ? (s === 'free' ? '#132416' : '#2A1512') : '#1A1A18',
                      }}
                    >
                      <Dot color={s === 'free' ? GREEN : RED} size={10} glow={false} />
                      {s === 'free' ? 'Estoy libre' : 'Estoy ocupado'}
                    </button>
                  ))}
                </div>
                <span className="px-1 text-sm font-light text-muted">Para avisar cuánto tardás, empezá el corte desde Agenda.</span>
              </>
            ) : (
              <CuttingCard agenda={agenda} me={staff.name} busy={busy} onFinish={() => complete()} />
            )}
            <MyBlocks today={today} onChange={(msg) => { setOk(msg); loadAgenda(day); }} />
          </>
        )}

        {tab === 'fila' && (
          <QueueTab queue={queue} services={services} me={staff.name} busy={busy} act={act} />
        )}

        {tab === 'nuevo' && <NewAppointment services={services} today={today} act={act} />}

        {tab === 'clientes' && <ClientsTab onLogout={logout} />}
      </main>

      <BottomNav tabs={TABS} active={tab} onPick={pick} maxWidth={560} />
    </div>
  );
}

function CuttingCard({ agenda, me, busy, onFinish }: { agenda: Agenda; me: string; busy: boolean; onFinish: () => void }) {
  const next = agenda.next;
  const left = agenda.cutting?.leftMin ?? 0;
  const delay = next?.newTime ? toMin(next.newTime) - toMin(next.time) : 0;
  const note = !next
    ? 'No tenés más turnos después de este.'
    : delay > 0
      ? `Venís ${delay} min demorado: los turnos que siguen se corren solos.`
      : 'Llegás a tiempo: los turnos que siguen no se mueven.';
  const msg = next
    ? `Hola ${next.name}! ${me} se libera en ${left} minutos. ` +
      (delay > 0 ? `Tu turno de las ${next.time} pasa a las ${next.newTime}.` : `Te esperamos a las ${next.time}.`)
    : '';
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-5">
      <span className="text-[15px]">{note}</span>
      {next && (
        <>
          <span className="rounded-[14px] bg-field px-3.5 py-3 text-sm font-light text-soft">{msg}</span>
          {next.phone ? (
            <WaLink href={enviarWhatsApp({ to: next.phone, text: msg }).url} className="!min-h-[52px] !text-[15px]">
              Avisar a {next.name} por WhatsApp
            </WaLink>
          ) : (
            <span className="text-[13px] text-muted">{next.name} no dejó teléfono.</span>
          )}
        </>
      )}
      <PrimaryButton onClick={onFinish} busy={busy} className="!text-base">
        Terminé · sellar tarjeta
      </PrimaryButton>
    </section>
  );
}

type Act = (path: string, body: Record<string, unknown>, okText?: string, after?: () => void) => Promise<Record<string, unknown> | null>;

function QueueTab({ queue, services, me, busy, act }: { queue: Queue | null; services: Service[]; me: string; busy: boolean; act: Act }) {
  const [svc, setSvc] = useState<Record<string, string>>({});
  const [walkIn, setWalkIn] = useState('');
  if (!queue) return <span className="text-muted">Cargando…</span>;
  const n = queue.waiting.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <Kicker>Fila sin turno</Kicker>
        <span className="text-[22px] font-semibold">{n} esperando</span>
      </div>
      {queue.waiting.map((q) => (
        <div key={q.id} className="flex min-h-14 items-center gap-3.5 rounded-2xl border border-line bg-card px-4">
          <span className="min-w-[22px] text-lg font-semibold text-accent">{q.position}</span>
          <span className="flex-1 text-base">{q.name}</span>
          {q.hasAccount && <span className="text-xs text-muted">con cuenta</span>}
        </div>
      ))}
      {n === 0 && <span className="px-1 text-muted">No hay nadie en la fila.</span>}

      {queue.called.map((c) => {
        const chosen = svc[c.id] ?? services[0]?.id;
        const wa = c.phone ? enviarWhatsApp({ to: c.phone, text: `Hola ${firstName(c.name)}! Ya te toca, ${me} te espera.` }).url : null;
        return (
          <section key={c.id} className="flex flex-col gap-2.5 rounded-[20px] border border-accent p-[18px]">
            <span>
              Le toca a <span className="font-semibold">{c.name}</span>
            </span>
            {wa && <WaLink href={wa} className="!min-h-[50px] !text-[15px]">Avisarle por WhatsApp</WaLink>}
            <span className="text-[13px] font-light text-muted">¿Qué se hizo?</span>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <Chip key={s.id} size="sm" on={chosen === s.id} onClick={() => setSvc({ ...svc, [c.id]: s.id })}>
                  {s.name}
                </Chip>
              ))}
            </div>
            <PrimaryButton
              busy={busy}
              disabled={!chosen}
              onClick={() => act('/api/barber/queue/serve', { id: c.id, serviceId: chosen }, c.hasAccount ? 'Corte registrado y sellado.' : 'Corte registrado.')}
              className="!text-base"
            >
              Terminé · registrar corte
            </PrimaryButton>
            <GhostButton small onClick={() => act('/api/barber/queue/leave', { id: c.id })}>
              No vino
            </GhostButton>
          </section>
        );
      })}

      <PrimaryButton onClick={() => act('/api/barber/queue/call', {})} disabled={n === 0} busy={busy}>
        Llamar al siguiente
      </PrimaryButton>

      <div className="mt-2 flex flex-col gap-2 rounded-[20px] border border-dashed border-dash p-4">
        <span className="text-[15px] font-medium">Anotar a alguien que llegó</span>
        <Field id="walkin" label="Nombre" value={walkIn} onChange={setWalkIn} />
        <GhostButton
          disabled={walkIn.trim().length < 2 || busy}
          onClick={() => act('/api/barber/queue/add', { name: walkIn }, 'Anotado en la fila.', () => setWalkIn(''))}
        >
          Anotar en la fila
        </GhostButton>
      </div>
    </div>
  );
}

function NewAppointment({ services, today, act }: { services: Service[]; today: string; act: Act }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [day, setDay] = useState(today);
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<{ time: string }[] | null>(null);
  const [done, setDone] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!serviceId) return;
    setSlots(null);
    api<{ slots: { time: string }[] }>(`/api/barber/slots?service=${serviceId}&day=${day}`)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]));
  }, [serviceId, day, reload]);

  const can = name.trim().length > 2 && !!time && !!slots?.some((s) => s.time === time);
  return (
    <div className="flex flex-col gap-3">
      <Kicker className="px-1">Crear turno a mano</Kicker>
      <Field id="n1" label="Nombre y apellido del cliente" value={name} onChange={(v) => { setName(v); setDone(false); }} />
      <Field id="n2" label="Teléfono (opcional, para sumar sellos)" type="tel" inputMode="tel" value={phone} onChange={setPhone} />
      <span className="px-1 pt-1 text-[13px] font-light text-muted">Servicio</span>
      {services.map((s) => {
        const on = s.id === serviceId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setServiceId(s.id);
              setTime('');
            }}
            aria-pressed={on}
            className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl border-[1.5px] px-4 text-base text-ink ${on ? 'border-accent bg-pick' : 'border-line bg-card'}`}
          >
            <span>{s.name}</span>
            <span className={on ? 'text-accent' : 'text-muted'}>{money(s.price)}</span>
          </button>
        );
      })}
      <span className="px-1 pt-1 text-[13px] font-light text-muted">Día</span>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d, i) => (
          <Chip key={d} size="sm" on={d === day} onClick={() => { setDay(d); setTime(''); }} className="shrink-0">
            {i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${DAY_SHORT[dow(d)]} ${Number(d.slice(8))}`}
          </Chip>
        ))}
      </div>
      <span className="px-1 pt-1 text-[13px] font-light text-muted">Horario libre</span>
      {!slots ? (
        <span className="text-muted">Buscando…</span>
      ) : slots.length === 0 ? (
        <span className="text-muted">No te quedan horarios libres ese día.</span>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((t) => (
            <Chip key={t.time} size="sm" on={time === t.time} onClick={() => setTime(t.time)} className="!min-h-12">
              {t.time}
            </Chip>
          ))}
        </div>
      )}
      <PrimaryButton
        disabled={!can}
        onClick={async () => {
          const r = await act('/api/barber/appointments', { name, phone, serviceId, day, time });
          if (r) {
            setDone(true);
            setName('');
            setPhone('');
            setTime('');
          }
          setReload((k) => k + 1);
        }}
        className="mt-1.5 !text-base"
      >
        Agregar turno
      </PrimaryButton>
      {done && <span className="px-1 text-sm text-ok">Turno agregado a tu agenda.</span>}
    </div>
  );
}

function ClientsTab({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<{ goal: number; clients: { id: string; name: string; phoneDisplay: string; email: string | null; stamps: number }[] } | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    api<typeof data>('/api/barber/clients').then(setData).catch(() => setData({ goal: 10, clients: [] }));
  }, []);
  const list = (data?.clients ?? []).filter((c) => !q || `${c.name} ${c.phoneDisplay}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-2.5">
      <Kicker className="px-1">Mis clientes</Kicker>
      <Field id="cq" label="Buscar" placeholder="Buscar por nombre o teléfono" value={q} onChange={setQ} />
      {!data && <span className="text-muted">Cargando…</span>}
      {data && list.length === 0 && <span className="px-1 text-muted">Todavía no hay clientes.</span>}
      {list.map((c) => (
        <div key={c.id} className="flex items-center gap-3.5 rounded-2xl border border-line bg-card px-4 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-medium">{c.name}</span>
            <span className="truncate text-[13px] font-light text-muted">
              {c.phoneDisplay}
              {c.email ? ` · ${c.email}` : ''}
            </span>
          </span>
          <span className="text-base font-semibold text-accent">
            {Math.min(c.stamps, (data?.goal ?? 10) - 1)}/{data?.goal ?? 10}
          </span>
        </div>
      ))}
      <GhostButton small onClick={onLogout} className="mt-3 self-start">
        Salir
      </GhostButton>
    </div>
  );
}

function BlockRow({ b }: { b: Block }) {
  return (
    <div className="flex min-h-12 items-center gap-3.5 rounded-2xl border border-dashed border-dash px-4 py-2 text-muted">
      <span className="min-w-[52px] text-[15px] font-medium">{b.allDay ? 'Todo' : b.from}</span>
      <span className="flex-1 text-sm">
        {b.barberId ? 'Bloqueado' : 'Local cerrado'}
        {b.allDay ? ' todo el día' : ` hasta las ${b.to}`}
        {b.reason ? ` · ${b.reason}` : ''}
      </span>
    </div>
  );
}

/** El turno todavía no empezó (se puede recordar) o ya pasó la hora (se puede marcar "No vino") */
function isUpcoming(r: Row, agenda: Agenda): boolean {
  if (agenda.day !== agenda.today) return agenda.day > agenda.today;
  return r.start > toMin(agenda.now);
}

function ReminderButton({ row, agenda, brand, me, onSent }: { row: Row; agenda: Agenda; brand: string; me: string; onSent: () => void }) {
  const when =
    agenda.day === agenda.today ? 'hoy' : agenda.day === addDays(agenda.today, 1) ? 'mañana' : `el ${dayLabel(agenda.day).toLowerCase()}`;
  const link = typeof window !== 'undefined' ? `${window.location.origin}/cuenta` : '';
  const text =
    `Hola ${firstName(row.clientName)}! Te recordamos tu turno en ${brand}: ${when} a las ${row.time} con ${me} (${row.serviceName}). ` +
    `Confirmá tu asistencia acá: ${link} . Si no podés venir, avisanos por este medio.`;
  return (
    <div className="flex flex-col gap-1.5">
      <WaLink href={enviarWhatsApp({ to: row.client.phone, text }).url} onClick={onSent} className="!min-h-[50px] !text-[15px]">
        {row.reminded ? 'Recordar de nuevo por WhatsApp' : 'Recordar turno por WhatsApp'}
      </WaLink>
      {row.reminded && <span className="px-1 text-xs text-muted">Ya le mandaste el recordatorio.</span>}
    </div>
  );
}

function MyBlocks({ today, onChange }: { today: string; onChange: (msg: string) => void }) {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ blocks: Block[] }>('/api/barber/blocks').then((r) => setBlocks(r.blocks)).catch(() => setBlocks([]));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="flex flex-col gap-2.5">
      <SectionTitle>Horarios bloqueados</SectionTitle>
      <span className="px-1 text-sm font-light text-muted">Almuerzo, franco o vacaciones: en esos horarios nadie te puede reservar.</span>
      <ErrorNote text={error} />
      {blocks && (
        <BlocksList
          blocks={blocks}
          empty="No tenés horarios bloqueados."
          canDelete={(b) => !!b.mine}
          onDelete={async (b) => {
            setError(null);
            try {
              await api('/api/barber/block/delete', { id: b.id });
              load();
              onChange('Bloqueo quitado: ese horario vuelve a estar disponible.');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}
      {open ? (
        <BlockForm
          endpoint="/api/barber/block"
          today={today}
          reasons={['Almuerzo', 'Franco', 'Trámite', 'Vacaciones']}
          onDone={(msg) => {
            setOpen(false);
            load();
            onChange(msg);
          }}
        />
      ) : (
        <GhostButton onClick={() => setOpen(true)}>Bloquear un horario</GhostButton>
      )}
    </div>
  );
}
