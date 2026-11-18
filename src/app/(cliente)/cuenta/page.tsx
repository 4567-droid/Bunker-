'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useApp, type Appt } from '@/components/client/app-context';
import { AuthFields, authProblem, EMPTY_AUTH, submitAuth, type AuthMode, type AuthValues } from '@/components/client/auth-fields';
import { Card, Dot, ErrorNote, Field, GhostButton, GREEN, Kicker, OkNote, PrimaryButton, WaLink } from '@/components/ui';
import { api } from '@/lib/api-client';
import { areaFromWhatsapp, money, PAYMENTS } from '@/lib/format';
import { prizeInfo } from '@/lib/rules';
import { enviarWhatsApp } from '@/lib/whatsapp';

function NextAppt({ a, onChange }: { a: Appt; onChange: () => Promise<void> }) {
  const { config, me } = useApp();
  const biz = config.business;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pay = a.payment ? PAYMENTS[a.payment].name : '';
  const short = biz.name.split(/\s+/)[0];
  const wa = biz.whatsapp
    ? enviarWhatsApp({
        to: biz.whatsapp,
        text: `Hola ${short}! Soy ${me?.client?.name}. Confirmo mi turno: ${a.serviceName} con ${a.barberName}, ${a.dayLabel} a las ${a.time}${a.locationName ? `, en ${a.locationName}` : ''}. Pago: ${pay}.`,
      }).url
    : null;
  const label = a.status === 'in_progress' ? 'Te están atendiendo' : !a.waSent && wa ? 'Falta confirmar por WhatsApp' : a.confirmed ? 'Asistencia confirmada' : 'Falta confirmar tu asistencia';
  const dot = a.confirmed || a.status === 'in_progress' ? GREEN : 'var(--accent)';

  async function run(path: string) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { id: a.id });
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xl font-semibold">
        {a.dayLabel} · {a.projectedTime ?? a.time}
      </span>
      {a.projectedTime && (
        <span className="text-sm text-accent">
          Tu turno de las {a.time} pasa a las {a.projectedTime}: {a.barberName} viene un poco demorado.
        </span>
      )}
      <span className="text-sm font-light text-muted">
        {a.serviceName} con {a.barberName} · {pay} · {money(a.total)}
        {a.locationName && (
          <>
            <br />
            En {a.locationName}
          </>
        )}
        {a.discountReason ? ` (${a.discountReason})` : ''}
      </span>
      <span className="inline-flex items-center gap-2 text-sm">
        <Dot color={dot} glow={false} />
        {label}
      </span>
      {a.status === 'booked' &&
        (!a.waSent && wa ? (
          <WaLink href={wa} onClick={() => setTimeout(() => run('/api/client/whatsapp'), 300)}>
            Confirmar por WhatsApp
          </WaLink>
        ) : (
          <PrimaryButton onClick={() => run('/api/client/confirm')} disabled={a.confirmed} busy={busy}>
            {a.confirmed ? 'Asistencia confirmada' : 'Confirmar asistencia'}
          </PrimaryButton>
        ))}
      {a.status === 'booked' && (
        <div className="flex flex-wrap gap-x-5">
          <a href={`/api/client/ics?id=${a.id}`} className="inline-flex min-h-11 items-center text-sm text-muted underline">
            Agregar a mi calendario
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm('¿Cancelar este turno?')) run('/api/client/cancel');
            }}
            className="inline-flex min-h-11 items-center text-sm text-muted underline"
          >
            Cancelar turno
          </button>
        </div>
      )}
      <ErrorNote text={error} />
    </div>
  );
}

export default function Cuenta() {
  const { config, me, setMe, refreshMe, refreshLive, clearReferral, resetDraft } = useApp();
  const [mode, setMode] = useState<AuthMode>('register');
  const [form, setForm] = useState<AuthValues>(EMPTY_AUTH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const c = me?.client ?? null;
  const area = areaFromWhatsapp(config.business.whatsapp);
  const problem = authProblem(mode, form, area);

  async function submit() {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const m = await submitAuth(mode, form, area);
      setMe(m);
      setNotice(m.notice ?? null);
      if (mode === 'register') clearReferral();
      setForm(EMPTY_AUTH);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error & { code?: string }).code === 'needs_email') setMode('login');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api('/api/client/logout', {}).catch(() => {});
    resetDraft();
    setMe({ client: null });
  }

  async function leaveQueue() {
    await api('/api/client/queue', { action: 'leave' }).catch(() => {});
    await Promise.all([refreshMe(), refreshLive()]);
  }

  if (!me) return <div className="mx-auto w-full max-w-[480px] px-5 pt-10 text-muted">Cargando…</div>;

  if (!c) {
    return (
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3.5 px-4 pt-7 pb-6">
        <div className="flex flex-col gap-1 px-1">
          <Kicker>Mi cuenta</Kicker>
          <h1 className="m-0 text-[28px] font-semibold">{mode === 'register' ? 'Creá tu cuenta' : 'Ingresá'}</h1>
          <span className="pb-1.5 text-sm font-light text-muted">
            {mode === 'register' ? 'Una sola vez. Después la página te reconoce.' : 'Con el teléfono con el que te registraste.'}
          </span>
        </div>
        <AuthFields mode={mode} setMode={setMode} values={form} setValues={setForm} idPrefix="c" area={area} />
        <ErrorNote text={error} />
        <PrimaryButton onClick={submit} busy={busy} dimmed={!!problem}>
          {mode === 'register' ? 'Crear cuenta' : 'Ingresar'}
        </PrimaryButton>
      </div>
    );
  }

  const next = me.upcoming ?? [];
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3.5 px-4 pt-7 pb-6">
      <OkNote text={notice} />
      <Card className="flex-row items-center gap-3.5 px-5 py-[18px]">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-accent text-[22px] font-semibold text-bg">
          {c.firstName.charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-lg font-semibold">{c.name}</span>
          <span className="truncate text-sm font-light text-muted">
            {c.phoneDisplay}
            {c.email ? ` · ${c.email}` : ''}
          </span>
        </span>
      </Card>

      <Card className="gap-2.5 px-5 py-[18px]">
        <Kicker>{next.length > 1 ? 'Próximos turnos' : 'Próximo turno'}</Kicker>
        {next.length === 0 ? (
          <Link href="/turno" className="flex min-h-[52px] items-center justify-center rounded-full bg-accent text-base font-semibold text-bg">
            Sacar turno
          </Link>
        ) : (
          next.map((a, i) => (
            <div key={a.id} className={i > 0 ? 'border-t border-line pt-3' : ''}>
              <NextAppt a={a} onChange={refreshMe} />
            </div>
          ))
        )}
      </Card>

      {me.queue && (
        <Card accent className="gap-2.5 px-5 py-[18px]">
          <Kicker>Fila sin turno</Kicker>
          <span className="text-lg font-semibold">
            {me.queue.status === 'called' ? 'Te llamaron: acercate al local' : `Sos el número ${me.queue.position}`}
            {me.queue.location ? ` · ${me.queue.location}` : ''}
          </span>
          {me.queue.status === 'waiting' && <span className="text-sm font-light text-muted">Espera estimada: ~{me.queue.waitMin} min</span>}
          <GhostButton small onClick={leaveQueue} className="self-start">
            Salir de la fila
          </GhostButton>
        </Card>
      )}

      <Link href="/fidelidad" className="flex items-center justify-between gap-3 rounded-[20px] border border-line bg-card px-5 py-[18px]">
        <span className="flex flex-col">
          <span className="text-base font-medium">Tarjeta de fidelidad</span>
          <span className="text-sm font-light text-muted">
            {c.nextFree
              ? prizeInfo({ kind: config.business.loyaltyReward, pct: config.business.loyaltyRewardPct, text: config.business.loyaltyRewardText, goal: config.business.loyaltyGoal }).next
              : `Código para invitar: ${c.referralCode}`}
          </span>
        </span>
        <span className="text-xl font-semibold text-accent">
          {Math.min(c.stamps, config.business.loyaltyGoal - 1)}/{config.business.loyaltyGoal}
        </span>
      </Link>

      {(me.history?.length ?? 0) > 0 && (
        <Card className="gap-1 px-5 py-[18px]">
          <Kicker>Mis últimos cortes</Kicker>
          {me.history!.map((h) => (
            <div key={h.id} className="flex items-center gap-3 border-b border-field py-2.5 last:border-0">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`text-[15px] ${h.status === 'no_show' ? 'text-dim' : ''}`}>{h.dayLabel}</span>
                <span className="truncate text-[13px] font-light text-muted">
                  {h.serviceName} con {h.barberName}
                </span>
              </span>
              <span className="shrink-0 text-right text-[13px]">
                {h.status === 'no_show' ? (
                  <span className="text-dim">No fuiste</span>
                ) : h.free ? (
                  <span className="text-accent">{h.discountPct >= 100 ? 'Gratis' : h.discountPct > 0 ? `Premio ${h.discountPct}%` : 'Premio'}</span>
                ) : h.stampsAdded ? (
                  <span className="text-accent">+{h.stampsAdded} {h.stampsAdded === 1 ? 'sello' : 'sellos'}</span>
                ) : (
                  <span className="text-muted">Atendido</span>
                )}
              </span>
            </div>
          ))}
        </Card>
      )}

      <MyData />

      <GhostButton small onClick={logout} className="self-start">
        Cerrar sesión
      </GhostButton>
    </div>
  );
}

/** Editar nombre y correo, y borrar la cuenta (los datos personales son del cliente) */
function MyData() {
  const { me, setMe, resetDraft } = useApp();
  const c = me?.client;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(c?.name ?? '');
  const [email, setEmail] = useState(c?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  if (!c) return null;

  async function save() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      setMe(await api('/api/client/update', { name, email }));
      setOk('Datos guardados.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('¿Borrar tu cuenta? Se cancelan tus turnos y perdés los sellos de la tarjeta. No se puede deshacer.')) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/client/delete', { confirm: true });
      resetDraft();
      setMe({ client: null });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center self-start px-1 text-sm text-muted underline">
        Editar mis datos
      </button>
    );
  }
  return (
    <Card className="gap-2.5 px-5 py-[18px]">
      <Kicker>Mis datos</Kicker>
      <Field id="md-name" label="Nombre y apellido" value={name} onChange={setName} autoComplete="name" />
      <Field id="md-email" label="Correo (opcional)" type="email" inputMode="email" value={email} onChange={setEmail} autoComplete="email" />
      <span className="px-1 text-[13px] font-light text-muted">
        El teléfono ({c.phoneDisplay}) es tu forma de entrar: para cambiarlo, escribile a la barbería.
        {c.email ? ' Si cambiás el correo, la próxima vez entrás con el nuevo.' : ''}
      </span>
      <ErrorNote text={error} />
      <OkNote text={ok} />
      <PrimaryButton onClick={save} busy={busy} disabled={name.trim().split(/\s+/).length < 2} className="!text-base">
        Guardar
      </PrimaryButton>
      <button type="button" onClick={remove} disabled={busy} className="inline-flex min-h-11 items-center self-start text-sm text-bad underline">
        Borrar mi cuenta
      </button>
    </Card>
  );
}
