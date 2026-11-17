'use client';

import { useRef, useState } from 'react';
import { Chip, ErrorNote, Field, GhostButton, Kicker, PrimaryButton } from '@/components/ui';
import { api } from '@/lib/api-client';
import { addDays, dayLabel } from '@/lib/time';

export interface Block {
  id: string;
  day: string;
  dayLabel: string;
  barberId: string | null;
  barberName: string | null;
  allDay: boolean;
  from: string;
  to: string;
  reason: string | null;
  mine?: boolean;
}

const TIMES = Array.from({ length: (24 - 6) * 4 + 1 }, (_, i) => {
  const m = 6 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}).filter((t) => t <= '24:00');

const inputCls =
  'min-h-[54px] w-full rounded-[14px] border border-line bg-field px-[14px] text-base text-ink [color-scheme:dark]';

export function SelectField({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label htmlFor={id} className="flex flex-1 flex-col gap-1">
      <span className="px-1 text-[13px] font-light text-muted">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateField({ id, label, value, onChange, min }: { id: string; label: string; value: string; onChange: (v: string) => void; min?: string }) {
  return (
    <label htmlFor={id} className="flex flex-1 flex-col gap-1">
      <span className="px-1 text-[13px] font-light text-muted">{label}</span>
      <input id={id} type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}

/**
 * Bloquear horario: almuerzo, franco, vacaciones (barbero) o feriado / cierre del local (dueño).
 * Si hay turnos reservados en ese horario, el servidor no bloquea y dice cuáles son.
 */
export function BlockForm({
  endpoint,
  today,
  barbers,
  reasons,
  onDone,
}: {
  endpoint: string;
  today: string;
  barbers?: { id: string; name: string }[];
  reasons: string[];
  onDone: (msg: string) => void;
}) {
  const [who, setWho] = useState<string>(''); // '' = todo el local (solo dueño)
  const [day, setDay] = useState(today);
  const [multi, setMulti] = useState(false);
  const [toDay, setToDay] = useState(addDays(today, 6));
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState('13:00');
  const [to, setTo] = useState('14:00');
  const [reason, setReason] = useState(reasons[0] ?? '');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ days: number }>(endpoint, {
        barberId: barbers ? who || null : undefined,
        day,
        toDay: multi ? toDay : undefined,
        allDay,
        from,
        to,
        reason: reason === 'Otro' ? other : reason,
      });
      const when = r.days > 1 ? `${r.days} días` : dayLabel(day);
      onDone(`Listo: bloqueado ${when}${allDay ? '' : ` de ${from} a ${to}`}. Nadie puede reservar en ese horario.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-5">
      {barbers && (
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[13px] font-light text-muted">¿Quién no atiende?</span>
          <div className="flex flex-wrap gap-2">
            <Chip size="sm" on={who === ''} onClick={() => setWho('')}>
              Todo el local
            </Chip>
            {barbers.map((b) => (
              <Chip key={b.id} size="sm" on={who === b.id} onClick={() => setWho(b.id)}>
                {b.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <DateField id="bf-day" label={multi ? 'Desde el día' : 'Día'} value={day} min={today} onChange={(v) => { setDay(v); if (toDay < v) setToDay(v); }} />
        {multi && <DateField id="bf-to" label="Hasta el día" value={toDay} min={day} onChange={setToDay} />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Chip size="sm" on={!multi} onClick={() => setMulti(false)}>
          Un día
        </Chip>
        <Chip size="sm" on={multi} onClick={() => setMulti(true)}>
          Varios días
        </Chip>
        <Chip size="sm" on={allDay} onClick={() => setAllDay(true)}>
          Todo el día
        </Chip>
        <Chip size="sm" on={!allDay} onClick={() => setAllDay(false)}>
          Un horario
        </Chip>
      </div>
      {!allDay && (
        <div className="flex gap-2">
          <SelectField id="bf-from" label="Desde" value={from} onChange={setFrom} options={TIMES.map((t) => ({ value: t, label: t }))} />
          <SelectField id="bf-tohour" label="Hasta" value={to} onChange={setTo} options={TIMES.map((t) => ({ value: t, label: t }))} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="px-1 text-[13px] font-light text-muted">Motivo (lo ven solo ustedes)</span>
        <div className="flex flex-wrap gap-2">
          {[...reasons, 'Otro'].map((r) => (
            <Chip key={r} size="sm" on={reason === r} onClick={() => setReason(r)}>
              {r}
            </Chip>
          ))}
        </div>
        {reason === 'Otro' && <Field id="bf-other" label="Motivo" value={other} onChange={setOther} />}
      </div>
      <ErrorNote text={error} />
      <PrimaryButton onClick={submit} busy={busy} disabled={multi && toDay < day} className="!text-base">
        Bloquear
      </PrimaryButton>
    </div>
  );
}

export function BlocksList({ blocks, canDelete, onDelete, empty }: { blocks: Block[]; canDelete: (b: Block) => boolean; onDelete: (b: Block) => void; empty: string }) {
  if (!blocks.length) return <span className="px-1 text-sm font-light text-muted">{empty}</span>;
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b) => (
        <div key={b.id} className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-dash bg-card px-4 py-2.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-medium">
              {b.dayLabel} · {b.allDay ? 'todo el día' : `${b.from} a ${b.to}`}
            </span>
            <span className="truncate text-[13px] font-light text-muted">
              {[b.mine ? null : b.barberId ? (b.barberName ?? 'Barbero') : 'Todo el local', b.reason].filter(Boolean).join(' · ') || 'Bloqueado'}
            </span>
          </span>
          {canDelete(b) && (
            <GhostButton small onClick={() => onDelete(b)} className="!min-h-11 shrink-0 !px-4">
              Quitar
            </GhostButton>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Fotos: se achican en el celular (máx. `max` px) y se suben como WebP o JPEG
// ---------------------------------------------------------------------
async function shrink(file: File, max: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo abrir esa foto. Probá con otra (JPG o PNG).'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Tu navegador no puede preparar la foto.');
    ctx.drawImage(img, 0, 0, w, h);
    const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
    let blob = await toBlob('image/webp', 0.82);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
    if (!blob) throw new Error('No se pudo preparar la foto.');
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('No se pudo leer la foto.'));
      fr.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoPicker({
  current,
  label,
  max = 900,
  shape = 'square',
  onUpload,
  onRemove,
}: {
  current: string | null;
  label: string;
  max?: number;
  shape?: 'square' | 'round' | 'wide';
  onUpload: (dataUrl: string) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = shape === 'wide' ? 'h-[84px] w-[140px] rounded-[14px]' : shape === 'round' ? 'h-16 w-16 rounded-full' : 'h-16 w-16 rounded-[14px]';

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(await shrink(f, max));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className={`flex shrink-0 items-center justify-center overflow-hidden border border-line bg-field ${box}`}>
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[11px] text-dim">Sin foto</span>
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <GhostButton small disabled={busy} onClick={() => input.current?.click()} className="!min-h-11 !px-4">
            {busy ? 'Subiendo…' : current ? 'Cambiar foto' : label}
          </GhostButton>
          {current && onRemove && (
            <GhostButton
              small
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onRemove();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
              className="!min-h-11 !px-4"
            >
              Quitar
            </GhostButton>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <ErrorNote text={error} />
    </div>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Kicker className="px-1 pt-2">{children}</Kicker>;
}

/** Cambiar la propia contraseña (dueño, admin) o código (barbero). Pega a /api/staff/password. */
export function PasswordForm({ code = false }: { code?: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const what = code ? 'código' : 'contraseña';
  const min = code ? 4 : 8;
  return (
    <section className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-card p-[18px]">
      <span className="text-base font-semibold">Cambiar mi {what}</span>
      <Field id="pw-cur" label={`${code ? 'Código' : 'Contraseña'} actual`} type="password" autoComplete="current-password" value={current} onChange={setCurrent} />
      <Field id="pw-new" label={`${code ? 'Código' : 'Contraseña'} nuevo${code ? '' : 'a'} (mínimo ${min})`} type="password" autoComplete="new-password" value={next} onChange={setNext} />
      <ErrorNote text={error} />
      {msg && <p className="m-0 rounded-[14px] border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-soft">{msg}</p>}
      <GhostButton
        disabled={!current || next.length < min}
        onClick={async () => {
          setError(null);
          setMsg(null);
          try {
            await api('/api/staff/password', { current, next });
            setMsg(`Listo: ${what} cambiad${code ? 'o' : 'a'}.`);
            setCurrent('');
            setNext('');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Cambiar {what}
      </GhostButton>
    </section>
  );
}
