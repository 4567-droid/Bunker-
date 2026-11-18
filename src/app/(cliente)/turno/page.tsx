'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApp, type Appt } from '@/components/client/app-context';
import { AuthFields, authProblem, cleanCode, EMPTY_AUTH, submitAuth, type AuthMode, type AuthValues } from '@/components/client/auth-fields';
import { Avatar, Chip, Dot, ErrorNote, GhostButton, GREEN, Icon, Kicker, OptionRow, RED, SummaryRow, WaLink } from '@/components/ui';
import { api } from '@/lib/api-client';
import { areaFromWhatsapp, money, PAYMENTS, type Payment } from '@/lib/format';
import { DAY_SHORT, dayLabel, dow } from '@/lib/time';
import { enviarWhatsApp } from '@/lib/whatsapp';

// Los pasos. Con dos o más sucursales, el primero es elegir dónde: así los horarios y barberos son los de ese local.
type Kind = 'lugar' | 'servicio' | 'hora' | 'barbero' | 'pago' | 'resumen';
const BASE: Kind[] = ['servicio', 'hora', 'barbero', 'pago', 'resumen'];
const WITH_PLACE: Kind[] = ['lugar', ...BASE];
const TITLES: Record<Kind, string> = {
  lugar: '¿A qué sucursal vas?',
  servicio: 'Elegí el servicio',
  hora: 'Elegí día y hora',
  barbero: 'Elegí barbero',
  pago: '¿Cómo pagás?',
  resumen: 'Revisá y reservá',
};
/** "Mateo, Joaco y Bruno" */
const joinNames = (n: string[]) => (n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}` : (n[0] ?? ''));

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
  const [notice, setNotice] = useState<string | null>(null);

  const service = config.services.find((s) => s.id === draft.serviceId) ?? null;
  const registered = !!me?.client;
  const upcoming = (me?.upcoming ?? []).filter((a) => a.status === 'booked');
  // Sucursales
  const locations = config.locations;
  const multi = locations.length > 1;
  const KINDS = multi ? WITH_PLACE : BASE;
  const total = KINDS.length;
  const kind = KINDS[Math.min(step, total) - 1];
  const idx = (k: Kind) => KINDS.indexOf(k) + 1;
  const location = multi ? (locations.find((l) => l.id === draft.locationId) ?? null) : null;
  const locOk = !multi || !!location;
  const locQ = location ? `&location=${location.id}` : '';
  const here = location ? config.barbers.filter((b) => b.locationId === location.id) : config.barbers;

  // ?paso=hora (o el número de siempre: 1 servicio, 2 día y hora, 3 barbero) desde la portada
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('paso') ?? '';
    const k = (KINDS as string[]).includes(raw) ? (raw as Kind) : BASE[Number(raw) - 1];
    if (k) setStep(KINDS.indexOf(k) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!service || !locOk) return;
    let off = false;
    setDays(null);
    api<{ days: { day: string; available: boolean; closed: string | null }[] }>(`/api/public/days?service=${service.id}${locQ}`)
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
  }, [service?.id, location?.id]);

  useEffect(() => {
    if (!service || !draft.day || !locOk) {
      setSlots(null);
      return;
    }
    let off = false;
    setSlots(null);
    api<{ slots: Slot[] }>(`/api/public/slots?service=${service.id}&day=${draft.day}${locQ}`)
      .then((r) => !off && setSlots(r.slots))
      .catch(() => !off && setSlots([]));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, draft.day, slotsKey, location?.id]);

  useEffect(() => {
    if (!service) return;
    api<Quote>(`/api/client/quote?service=${service.id}`).then(setQuote).catch(() => setQuote(null));
  }, [service, me?.client?.id, me?.client?.stamps]);

  const slot = slots?.find((s) => s.time === draft.time) ?? null;
  const barber = config.barbers.find((b) => b.id === draft.barberId) ?? null;
  const timeOk = !!slot;
  const barberOk = timeOk && !!barber && slot!.free.includes(barber.id);
  const payOk = !!draft.payment;
  const area = areaFromWhatsapp(biz.whatsapp);
  const formProblem = registered ? null : authProblem(mode, form, area);
  const formOk = !formProblem;
  const can: Record<Kind, boolean> = {
    lugar: locOk,
    servicio: locOk && !!service,
    hora: locOk && timeOk,
    barbero: locOk && barberOk,
    pago: payOk,
    resumen: locOk && !!service && timeOk && barberOk && payOk && formOk,
  };

  const products = config.products.filter((p) => draft.productIds.includes(p.id));
  const productsTotal = products.reduce((a, p) => a + (p.price ?? 0), 0);
  const discount = useMemo(() => {
    if (!service) return null;
    if (registered && quote && quote.discountPct > 0) return { pct: quote.discountPct, reason: quote.reason ?? '', final: quote.finalPrice };
    if (!registered && referral && mode === 'register' && cleanCode(form.ref) === referral.code) {
      return {
        pct: referral.percent,
        reason: `${referral.percent}% de bienvenida (te invitó ${referral.name})`,
        final: Math.round((service.price * (100 - referral.percent)) / 100),
      };
    }
    return null;
  }, [service, registered, quote, referral, mode, form.ref]);
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
        const m = await submitAuth(mode, form, area);
        setMe(m);
        setNotice(m.notice ?? null);
        if (mode === 'register') clearReferral();
      }
      const r = await api<{ appointment: Appt }>('/api/client/book', {
        locationId: location?.id,
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
      const code = (e as Error & { code?: string }).code;
      if (code === 'needs_email') setMode('login');
      else if (code !== 'bad_ref' && code !== 'ref_not_new') setSlotsKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  async function changeBooking() {
    if (!booked) return;
    if (!window.confirm('Se libera este horario para que elijas otro. ¿Seguimos?')) return;
    setBusy(true);
    try {
      await api('/api/client/cancel', { id: booked.id });
      const svc = config.services.find((s) => s.name === booked.serviceName);
      setDraft({ serviceId: svc?.id ?? null, day: booked.day, time: null, barberId: null, payment: booked.payment });
      setBooked(null);
      refreshMe();
      go(idx(svc ? 'hora' : 'servicio'));
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
      else await api('/api/client/queue', { action: 'join', locationId: location?.id });
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
      `${booked.dayLabel} a las ${booked.time}${booked.locationName ? `, en ${booked.locationName}` : ''}. Pago: ${payName(booked.payment)}` +
      (booked.payment === 'transferencia' && biz.transferAlias ? ` (alias ${biz.transferAlias}).` : '.') +
      (prodNames.length ? ` Quiero sumar: ${prodNames.join(', ')}.` : '');
    const wa = biz.whatsapp ? enviarWhatsApp({ to: biz.whatsapp, text }).url : null;
    return (
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-[18px] px-4 pt-7 pb-6">
        <section className="fade-in flex flex-col gap-3.5 rounded-3xl border border-accent bg-card p-6">
          <Kicker>{waSent || !wa ? 'Listo' : 'Último paso'}</Kicker>
          <span className="text-[30px] leading-[1.1] font-semibold">{waSent || !wa ? 'Turno reservado' : 'Confirmalo por WhatsApp'}</span>
          <span className="font-light text-soft">
            {booked.serviceName} con {booked.barberName}
            <br />
            {booked.dayLabel} · {booked.time} · {payName(booked.payment)}
            {booked.locationName && (
              <>
                <br />
                En {booked.locationName}
              </>
            )}
          </span>
          <span className="text-[15px] font-light text-muted">
            Total {money(booked.total)}
            {booked.discountReason ? ` · ${booked.discountReason}` : ''}
          </span>
          {notice && <span className="text-sm text-accent">{notice}</span>}
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
  const primaryOk = can[kind];
  /** Por qué no se puede seguir (se muestra al tocar el botón gris) */
  function whyNot(): { text: string; goTo?: number } | null {
    if (!locOk) return { text: 'Elegí la sucursal.', goTo: idx('lugar') };
    if (kind === 'lugar') return null;
    if (!service) return { text: 'Elegí un servicio.', goTo: idx('servicio') };
    if (kind === 'servicio') return null;
    if (!draft.day || !draft.time) return { text: 'Elegí el día y el horario.', goTo: idx('hora') };
    if (!slots) return { text: 'Estamos buscando los horarios libres, esperá un segundo.' };
    if (!timeOk) return { text: `El horario de las ${draft.time} ya no está libre. Elegí otro.`, goTo: idx('hora') };
    if (kind === 'hora') return null;
    if (!barberOk) return { text: barber ? `${barber.name} ya no está libre a esa hora. Elegí otro barbero u otro horario.` : 'Elegí un barbero.', goTo: idx('barbero') };
    if (kind === 'barbero') return null;
    if (!payOk) return { text: 'Elegí cómo vas a pagar.', goTo: idx('pago') };
    if (kind === 'pago') return null;
    if (formProblem) return { text: formProblem };
    return null;
  }
  function primary() {
    if (busy) return;
    if (!primaryOk) {
      const w = whyNot();
      setError(w?.text ?? 'Completá este paso para seguir.');
      if (w?.goTo && w.goTo < step) setStep(w.goTo);
      return;
    }
    if (step < total) go(step + 1);
    else reserve();
  }
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-[18px] px-4 pt-7 pb-6">
      <div className="flex flex-col gap-2.5 px-1">
        <Kicker>
          Paso {step} de {total}
        </Kicker>
        <h1 className="m-0 text-[28px] font-semibold">{TITLES[kind]}</h1>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {KINDS.map((_, i) => i + 1).map((n) => (
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

      {step === 1 && upcoming.length > 0 && (
        <Link href="/cuenta" className="flex flex-col gap-0.5 rounded-2xl border border-line-2 bg-card px-4 py-3">
          <span className="text-sm font-light text-muted">{upcoming.length > 1 ? 'Ya tenés 2 turnos' : 'Ya tenés turno'}</span>
          {upcoming.map((a) => (
            <span key={a.id} className="text-[15px] font-medium">
              {a.dayLabel} · {a.time} con {a.barberName}
              {a.locationName ? ` (${a.locationName})` : ''}
            </span>
          ))}
          <span className="text-[13px] font-light text-muted">
            {upcoming.length > 1 ? 'Para sacar otro, cancelá uno desde Cuenta →' : 'Podés sacar otro más. Verlo en Cuenta →'}
          </span>
        </Link>
      )}

      <div className="fade-in flex flex-col gap-2.5" key={step}>
        {kind === 'lugar' &&
          locations.map((l) => {
            const names = config.barbers.filter((b) => b.locationId === l.id).map((b) => b.name);
            const free = live?.barbers.filter((b) => b.locationId === l.id && b.state === 'free').length ?? 0;
            const extra = l.address && l.address.startsWith(l.name) ? l.address.slice(l.name.length).replace(/^[,\s·-]+/, '') : l.address;
            return (
              <OptionRow
                key={l.id}
                on={draft.locationId === l.id}
                onClick={() => draft.locationId !== l.id && setDraft({ locationId: l.id, time: null, barberId: null })}
                left={
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-field text-accent">
                    <Icon name="pin" size={20} />
                  </span>
                }
                title={l.name}
                sub={[extra, names.length ? `Con ${joinNames(names)}` : null].filter(Boolean).join(' · ')}
                right={
                  live?.open ? (
                    <span className="inline-flex shrink-0 items-center gap-2 text-sm text-soft">
                      <Dot color={free ? GREEN : RED} />
                      {free ? `${free} libre${free > 1 ? 's' : ''}` : 'Ocupados'}
                    </span>
                  ) : undefined
                }
              />
            );
          })}

        {kind !== 'lugar' && !locOk && (
          <button type="button" onClick={() => go(idx('lugar'))} className="flex min-h-14 items-center justify-between rounded-2xl border border-accent bg-card px-4 text-left text-ink">
            <span>Primero elegí a qué sucursal vas</span>
            <Icon name="chevron" size={18} className="text-accent" />
          </button>
        )}

        {kind === 'servicio' &&
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

        {kind === 'hora' && locOk && (
          <div className="flex flex-col gap-3.5">
            {location && (
              <span className="inline-flex items-center gap-1.5 px-1 text-sm font-light text-muted">
                <Icon name="pin" size={16} className="text-accent" />
                En {location.name}
              </span>
            )}
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

        {kind === 'barbero' && locOk && (
          <>
            <span className="px-1 text-sm font-light text-muted">
              {draft.day ? dayLabel(draft.day) : '—'} · {draft.time ?? '—'}
              {location ? ` · ${location.name}` : ''}
            </span>
            {here.map((b) => {
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

        {kind === 'pago' &&
          (Object.keys(PAYMENTS) as Payment[]).map((p) => (
            <OptionRow key={p} on={draft.payment === p} onClick={() => setDraft({ payment: p })} title={PAYMENTS[p].name} sub={payDesc(p)} />
          ))}

        {kind === 'resumen' && (
          <div className="flex flex-col gap-3.5">
            <div className="rounded-[20px] border border-line bg-card px-[18px] py-1.5">
              {multi && <SummaryRow k="Sucursal" v={location?.name ?? '—'} />}
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
                area={area}
                title={mode === 'register' ? 'Tus datos, solo la primera vez' : 'Ingresá con tu teléfono'}
              />
            )}
          </div>
        )}
      </div>

      {/* Atrás / Siguiente quedan siempre a mano, arriba del menú */}
      <div
        className="sticky bottom-[calc(69px+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2.5 bg-gradient-to-t from-bg from-70% to-transparent px-4 pt-4 pb-3 md:bottom-0"
      >
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
            onClick={primary}
            disabled={busy}
            className={`min-h-14 rounded-full border-0 text-[17px] font-semibold ${primaryOk && !busy ? 'bg-accent text-bg' : 'bg-line text-dim'}`}
          >
            {busy ? 'Reservando…' : step < total ? 'Siguiente →' : 'Reservar turno'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-dashed border-line-2 px-4 py-3.5 text-sm font-light">
        {me?.queue ? (
          <>
            <span>
              {me.queue.status === 'called'
                ? `Te llamaron: acercate al local${me.queue.location ? ` de ${me.queue.location}` : ''}.`
                : `Estás en la fila${me.queue.location ? ` de ${me.queue.location}` : ''}: número ${me.queue.position} (~${me.queue.waitMin} min)`}
            </span>
            <GhostButton small onClick={queueAction} className="shrink-0 !text-ink">
              Salir
            </GhostButton>
          </>
        ) : live && !live.open ? (
          <span className="text-muted">¿Sin turno? La fila se arma cuando estamos atendiendo.</span>
        ) : multi && !location ? (
          <span className="text-muted">¿Sin turno? Elegí la sucursal y te mostramos cuántos hay en su fila.</span>
        ) : (
          <>
            <span>
              {(() => {
                const q = location ? live?.locations?.find((l) => l.id === location.id) : live?.queue;
                const where = location ? ` de ${location.name}` : '';
                if (!live || !q) return '¿Sin turno?';
                return q.waiting ? `¿Sin turno? ${q.waiting} en la fila${where} (~${q.waitMin} min)` : `¿Sin turno? No hay nadie en la fila${where}`;
              })()}
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
