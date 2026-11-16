'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApp, type Appt } from '@/components/client/app-context';
import { AuthFields, authValid, EMPTY_AUTH, submitAuth, type AuthMode, type AuthValues } from '@/components/client/auth-fields';
import { Avatar, Chip, Dot, ErrorNote, GhostButton, GREEN, Kicker, OptionRow, RED, SummaryRow, WaLink } from '@/components/ui';
import { api } from '@/lib/api-client';
import { money, PAYMENTS, type Payment } from '@/lib/format';
import { DAY_SHORT, dayLabel, dow } from '@/lib/time';
import { enviarWhatsApp } from '@/lib/whatsapp';

const TITLES = ['', 'Elegí el servicio', 'Elegí día y hora', 'Elegí barbero', '¿Cómo pagás?', 'Revisá y reservá'];

interface Slot {
  time: string;
  start: number;
  free: string[];
}
interface Quote {
  price: number;
  discountPct: number;
  reason: string | null;
  finalPrice: number;
}

export default function Turno() {
  const { config, me, setMe, refreshMe, live, refreshLive, draft, setDraft, resetDraft, referral, clearReferral } = useApp();
  const biz = config.business;
  const short = biz.name.split(/\s+/)[0];
  const [step, setStep] = useState(1);
  const [days, setDays] = useState<{ day: string; available: boolean; closed: string | null }[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [mode, setMode] = useState<AuthMode>('register');
  const [form, setForm] = useState<AuthValues>(EMPTY_AUTH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Appt | null>(null);
  const [waSent, setWaSent] = useState(false);
  const [slotsKey, setSlotsKey] = useState(0);

  const service = config.services.find((s) => s.id === draft.serviceId) ?? null;
  const registered = !!me?.client;

  // ?paso=N desde la portada
  useEffect(() => {
    const p = Number(new URLSearchParams(window.location.search).get('paso'));
    if (p >= 1 && p <= 5) setStep(p);
  }, []);

  useEffect(() => {
    if (!service) return;
    let off = false;
    setDays(null);
    api<{ days: { day: string; available: boolean; closed: string | null }[] }>(`/api/public/days?service=${service.id}`)
      .then((r) => {
        if (off) return;
        setDays(r.days);
        if (!draft.day || !r.days.some((d) => d.day === draft.day && d.available)) {
          setDraft({ day: r.days.find((d) => d.available)?.day ?? null, time: null, barberId: null });
        }
      })
      .catch((e) => !off && setError(e.message));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service?.id]);

  useEffect(() => {
    if (!service || !draft.day) {
      setSlots(null);
      return;
    }
    let off = false;
    setSlots(null);
    api<{ slots: Slot[] }>(`/api/public/slots?service=${service.id}&day=${draft.day}`)
      .then((r) => !off && setSlots(r.slots))
      .catch(() => !off && setSlots([]));
    return () => {
      off = true;
    };
  }, [service, draft.day, slotsKey]);

  useEffect(() => {
    if (!service) return;
    api<Quote>(`/api/client/quote?service=${service.id}`).then(setQuote).catch(() => setQuote(null));
  }, [service, me?.client?.id, me?.client?.stamps]);

  const slot = slots?.find((s) => s.time === draft.time) ?? null;
  const barber = config.barbers.find((b) => b.id === draft.barberId) ?? null;
  const timeOk = !!slot;
  const barberOk = timeOk && !!barber && slot!.free.includes(barber.id);
  const payOk = !!draft.payment;
  const formOk = registered || authValid(mode, form);
  const can: Record<number, boolean> = {
    1: !!service,
    2: timeOk,
    3: barberOk,
    4: payOk,
    5: !!service && timeOk && barberOk && payOk && formOk,
  };

  const products = config.products.filter((p) => draft.productIds.includes(p.id));
  const productsTotal = products.reduce((a, p) => a + (p.price ?? 0), 0);
  const discount = useMemo(() => {
    if (!service) return null;
    if (registered && quote && quote.discountPct > 0) return { pct: quote.discountPct, reason: quote.reason ?? '', final: quote.finalPrice };
    if (!registered && referral && mode === 'register') {
      return {
        pct: referral.percent,
        reason: `${referral.percent}% de bienvenida (te invitó ${referral.name})`,
        final: Math.round((service.price * (100 - referral.percent)) / 100),
      };
    }
    return null;
  }, [service, registered, quote, referral, mode]);
  const servicePrice = discount ? discount.final : (service?.price ?? 0);
  const payName = (p: Payment | null) => (p ? PAYMENTS[p].name : '—');
  const payDesc = (p: Payment) =>
    p === 'transferencia'
      ? biz.transferAlias
        ? `Alias: ${biz.transferAlias}`
        : 'Te pasamos el alias por WhatsApp'
      : p === 'mercadopago' && biz.mpLink
        ? 'Al reservar te damos el link para pagar'
        : PAYMENTS[p].desc;

  function go(n: number) {
    setError(null);
    setStep(n);
    window.scrollTo({ top: 0 });
  }

  async function reserve() {
    if (!service || !barber || !draft.day || !draft.time || !draft.payment) return;
    setBusy(true);
    setError(null);
    try {
      if (!registered) {
        const m = await submitAuth(mode, form, mode === 'register' ? referral?.code : null);
        setMe(m);
        if (mode === 'register') clearReferral();
      }
      const r = await api<{ appointment: Appt }>('/api/client/book', {
        serviceId: service.id,
        day: draft.day,
        time: draft.time,
        barberId: barber.id,
        payment: draft.payment,
        productIds: draft.productIds,
      });
      setBooked(r.appointment);
      setWaSent(false);
      resetDraft();
      refreshMe();
      refreshLive();
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
      setSlotsKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  async function changeBooking() {
    if (!booked) return;
    setBusy(true);
    try {
      await api('/api/client/cancel', { id: booked.id });
      const svc = config.services.find((s) => s.name === booked.serviceName);
      setDraft({ serviceId: svc?.id ?? null, day: booked.day, time: null, barberId: null, payment: booked.payment });
      setBooked(null);
      refreshMe();
      go(svc ? 2 : 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function queueAction() {
    setError(null);
    try {
      if (me?.queue) await api('/api/client/queue', { action: 'leave' });
      else await api('/api/client/queue', { action: 'join' });
      await Promise.all([refreshMe(), refreshLive()]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ------------------------------------------------------------- listo
  if (booked) {
    const clientName = me?.client?.name ?? '';
    const prodNames = booked.products.map((p) => p.name);
    const text =
      `Hola ${short}! Soy ${clientName}. Confirmo mi turno: ${booked.serviceName} con ${booked.barberName}, ` +
      `${booked.dayLabel} a las ${booked.time}. Pago: ${payName(booked.payment)}` +
      (booked.payment === 'transferencia' && biz.transferAlias ? ` (alias ${biz.transferAlias}).` : '.') +
      (prodNames.length ? ` Quiero sumar: ${prodNames.join(', ')}.` : '');
    const wa = biz.whatsapp ? enviarWhatsApp({ to: biz.whatsapp, text }).url : null;
    return (
      <div className="flex flex-col gap-[18px] px-4 pt-7 pb-6">
        <section className="fade-in flex flex-col gap-3.5 rounded-3xl border border-accent bg-card p-6">
          <Kicker>{waSent || !wa ? 'Listo' : 'Último paso'}</Kicker>
          <span className="text-[30px] leading-[1.1] font-semibold">{waSent || !wa ? 'Turno reservado' : 'Confirmalo por WhatsApp'}</span>
          <span className="font-light text-soft">
            {booked.serviceName} con {booked.barberName}
            <br />
            {booked.dayLabel} · {booked.time} · {payName(booked.payment)}
          </span>
          <span className="text-[15px] font-light text-muted">
            Total {money(booked.total)}
            {booked.discountReason ? ` · ${booked.discountReason}` : ''}
          </span>
          {booked.payment === 'transferencia' && biz.transferAlias && booked.total > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-[14px] bg-field px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-light text-muted">Transferí {money(booked.total)} al alias</span>
                <span className="truncate text-[17px] font-semibold">{biz.transferAlias}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(biz.transferAlias ?? '').then(() => setCopied(true)).catch(() => {});
                }}
                className="min-h-11 shrink-0 rounded-full border border-line-2 px-4 text-sm text-ink"
              >
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          )}
          {booked.payment === 'mercadopago' && biz.mpLink && booked.total > 0 && (
            <a
              href={biz.mpLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center justify-center rounded-full border-[1.5px] border-accent text-base font-medium text-ink"
            >
              Pagar {money(booked.total)} con Mercado Pago
            </a>
          )}
          <a href={`/api/client/ics?id=${booked.id}`} className="self-start text-sm text-muted underline">
            Agregar a mi calendario
          </a>
          {wa && !waSent ? (
            <>
              <WaLink
                href={wa}
                onClick={() => {
                  setWaSent(true);
                  api('/api/client/whatsapp', { id: booked.id }).then(refreshMe).catch(() => {});
                }}
              >
                Confirmar por WhatsApp
              </WaLink>
              <GhostButton onClick={changeBooking} disabled={busy}>
                Cambiar turno
              </GhostButton>
            </>
          ) : (
            <Link href="/cuenta" className="flex min-h-14 items-center justify-center rounded-full bg-accent text-[17px] font-semibold text-bg">
              Ver mi cuenta
            </Link>
          )}
        </section>
        <ErrorNote text={error} />
      </div>
    );
  }

  // ------------------------------------------------------------- asistente
  const primaryOk = can[step];
  return (
    <div className="flex flex-col gap-[18px] px-4 pt-7 pb-6">
      <div className="flex flex-col gap-2.5 px-1">
        <Kicker>Paso {step} de 5</Kicker>
        <h1 className="m-0 text-[28px] font-semibold">{TITLES[step]}</h1>
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Ir al paso ${n}`}
              onClick={() => n < step && go(n)}
              className={`h-[3px] rounded-sm border-0 p-0 ${n <= step ? 'bg-accent' : 'bg-line'}`}
            />
          ))}
        </div>
      </div>

      <div className="fade-in flex flex-col gap-2.5" key={step}>
        {step === 1 &&
          config.services.map((s) => (
            <OptionRow
              key={s.id}
              on={draft.serviceId === s.id}
              onClick={() => setDraft({ serviceId: s.id, time: null, barberId: null })}
              title={s.name}
              sub={`${s.duration} min`}
              right={<span className={`text-[17px] font-semibold ${draft.serviceId === s.id ? 'text-accent' : 'text-ink'}`}>{money(s.price)}</span>}
            />
          ))}

        {step === 2 && (
          <div className="flex flex-col gap-3.5">
            {!days ? (
              <span className="text-muted">Buscando días…</span>
            ) : days.length === 0 ? (
              <span className="text-muted">No hay días disponibles.</span>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {days.map((d) => {
                  const on = draft.day === d.day;
                  return (
                    <button
                      key={d.day}
                      type="button"
                      disabled={!d.available}
                      aria-pressed={on}
                      aria-label={dayLabel(d.day)}
                      onClick={() => setDraft({ day: d.day, time: null, barberId: null })}
                      className={`flex min-h-[62px] flex-col items-center justify-center rounded-[14px] border-[1.5px] ${on ? 'border-accent bg-accent text-bg' : 'border-line bg-card text-ink'} ${d.available ? '' : 'opacity-35'}`}
                    >
                      <span className="text-xs">{DAY_SHORT[dow(d.day)]}</span>
                      <span className="text-xl leading-[1.1] font-semibold">{Number(d.day.slice(8))}</span>
                      {d.closed && <span className="text-[10px] leading-none">{d.closed.length > 9 ? 'Cerrado' : d.closed}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {draft.day && (
              <>
                <Kicker className="mt-1.5 tracking-[.14em]">Horarios con barbero libre</Kicker>
                {!slots ? (
                  <span className="text-muted">Buscando horarios…</span>
                ) : slots.length === 0 ? (
                  <span className="text-muted">Ese día no quedan horarios.</span>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((t) => (
                      <Chip key={t.time} on={draft.time === t.time} onClick={() => setDraft({ time: t.time, barberId: draft.barberId && t.free.includes(draft.barberId) ? draft.barberId : null })}>
                        {t.time}
                      </Chip>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <>
            <span className="px-1 text-sm font-light text-muted">
              {draft.day ? dayLabel(draft.day) : '—'} · {draft.time ?? '—'}
            </span>
            {config.barbers.map((b) => {
              const isBusy = !slot || !slot.free.includes(b.id);
              return (
                <OptionRow
                  key={b.id}
                  on={draft.barberId === b.id && !isBusy}
                  disabled={isBusy}
                  onClick={() => setDraft({ barberId: b.id })}
                  left={<Avatar name={b.name} src={b.photoUrl} />}
                  title={b.name}
                  right={
                    <span className="inline-flex items-center gap-2 text-sm text-soft">
                      <Dot color={isBusy ? RED : GREEN} />
                      {isBusy ? 'Ocupado' : 'Libre'}
                    </span>
                  }
                />
              );
            })}
          </>
        )}

        {step === 4 &&
          (Object.keys(PAYMENTS) as Payment[]).map((p) => (
            <OptionRow key={p} on={draft.payment === p} onClick={() => setDraft({ payment: p })} title={PAYMENTS[p].name} sub={payDesc(p)} />
          ))}

        {step === 5 && (
          <div className="flex flex-col gap-3.5">
            <div className="rounded-[20px] border border-line bg-card px-[18px] py-1.5">
              <SummaryRow k="Servicio" v={service?.name ?? '—'} />
              <SummaryRow k="Día" v={draft.day ? dayLabel(draft.day) : '—'} />
              <SummaryRow k="Horario" v={draft.time ?? '—'} />
              <SummaryRow k="Barbero" v={barber?.name ?? '—'} />
              <SummaryRow k="Pago" v={payName(draft.payment)} />
              <SummaryRow
                k="Productos"
                v={
                  products.length ? (
                    products.map((p) => p.name).join(', ')
                  ) : (
                    <Link href="/productos" className="font-light text-muted underline">
                      Ninguno · sumar
                    </Link>
                  )
                }
              />
              {discount && <SummaryRow k="Descuento" v={<span className="text-accent">{discount.reason}</span>} />}
              <div className="flex justify-between gap-3 py-3.5">
                <span className="font-medium">Total</span>
                <span className="text-[22px] font-semibold text-accent">
                  {discount && <span className="mr-2 text-[15px] font-light text-dim line-through">{money((service?.price ?? 0) + productsTotal)}</span>}
                  {money(servicePrice + productsTotal)}
                </span>
              </div>
            </div>
            {products.some((p) => p.price === null) && (
              <span className="px-1 text-[13px] font-light text-muted">Los productos sin precio se consultan en el local.</span>
            )}
            {registered ? (
              <span className="px-1 text-sm font-light text-muted">
                Reservás como <span className="font-medium text-ink">{me?.client?.name}</span>
              </span>
            ) : (
              <AuthFields
                mode={mode}
                setMode={setMode}
                values={form}
                setValues={setForm}
                idPrefix="t"
                title={mode === 'register' ? 'Tus datos, solo la primera vez' : 'Ingresá con tu teléfono'}
              />
            )}
          </div>
        )}
      </div>

      <ErrorNote text={error} />

      <div className="grid grid-cols-[1fr_2fr] gap-2.5">
        <button
          type="button"
          onClick={() => go(Math.max(1, step - 1))}
          disabled={step === 1}
          className={`min-h-14 rounded-full border border-line-2 bg-transparent text-base font-medium ${step === 1 ? 'text-off' : 'text-ink'}`}
        >
          Atrás
        </button>
        <button
          type="button"
          onClick={() => (step < 5 ? go(step + 1) : reserve())}
          disabled={!primaryOk || busy}
          className={`min-h-14 rounded-full border-0 text-[17px] font-semibold ${primaryOk && !busy ? 'bg-accent text-bg' : 'bg-line text-dim'}`}
        >
          {busy ? 'Reservando…' : step < 5 ? 'Siguiente →' : 'Reservar turno'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-dashed border-line-2 px-4 py-3.5 text-sm font-light">
        {me?.queue ? (
          <>
            <span>
              {me.queue.status === 'called'
                ? 'Te llamaron: acercate al local.'
                : `Estás en la fila: número ${me.queue.position} (~${me.queue.waitMin} min)`}
            </span>
            <GhostButton small onClick={queueAction} className="shrink-0 !text-ink">
              Salir
            </GhostButton>
          </>
        ) : live && !live.open ? (
          <span className="text-muted">¿Sin turno? La fila se arma cuando estamos atendiendo.</span>
        ) : (
          <>
            <span>
              {live
                ? live.queue.waiting
                  ? `¿Sin turno? ${live.queue.waiting} en la fila (~${live.queue.waitMin} min)`
                  : '¿Sin turno? No hay nadie en la fila'
                : '¿Sin turno?'}
            </span>
            {registered ? (
              <GhostButton small onClick={queueAction} className="shrink-0 !text-ink">
                Anotarme
              </GhostButton>
            ) : (
              <Link href="/cuenta" className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line-2 px-4 text-sm">
                Crear cuenta
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
