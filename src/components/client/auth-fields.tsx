'use client';

import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/ui';
import { api } from '@/lib/api-client';
import { isEmail, normalizePhone, PHONE_MIN, phoneDisplay } from '@/lib/format';
import { useApp, type Me } from './app-context';

export type AuthMode = 'register' | 'login';
export interface AuthValues {
  name: string;
  phone: string;
  email: string;
  /** Código de invitación de un amigo (opcional) */
  ref: string;
}
export const EMPTY_AUTH: AuthValues = { name: '', phone: '', email: '', ref: '' };

/** "ana 7kq" → "ANA7KQ" (igual que en el servidor) */
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);

/** Qué le falta al formulario, en palabras simples. null = está todo bien. */
export function authProblem(mode: AuthMode, v: AuthValues, area?: string | null): string | null {
  const name = v.name.trim();
  if (mode === 'register') {
    if (!name) return 'Escribí tu nombre y apellido.';
    if (!/\S+\s+\S+/.test(name)) return 'Falta tu apellido: escribí nombre y apellido (ej: Juan Pérez).';
  }
  const digits = v.phone.replace(/\D/g, '');
  if (!digits) return 'Escribí tu teléfono.';
  if (!normalizePhone(v.phone, area)) {
    return digits.length < PHONE_MIN
      ? `El teléfono es muy corto (${digits.length} números). Escribilo completo, por ejemplo 362 412-3456.`
      : `El teléfono es muy largo (${digits.length} números). Revisá que no esté repetido.`;
  }
  if (v.email.trim() && !isEmail(v.email.trim())) return 'Revisá el correo (ej: nombre@gmail.com) o dejalo vacío: es opcional.';
  return null;
}

export function authValid(mode: AuthMode, v: AuthValues, area?: string | null): boolean {
  return authProblem(mode, v, area) === null;
}

/** El teléfono completo como va a quedar (para mostrarlo debajo del campo) */
export function phonePreview(v: AuthValues, area?: string | null): string | null {
  const p = normalizePhone(v.phone, area);
  if (!p) return null;
  const typed = v.phone.replace(/\D/g, '');
  return typed.length < 10 && p.length === 10 && p !== typed ? `Queda como ${phoneDisplay(p)}` : null;
}

export function submitAuth(mode: AuthMode, v: AuthValues, area?: string | null): Promise<Me> {
  const phone = normalizePhone(v.phone, area) ?? v.phone;
  return mode === 'register'
    ? api<Me>('/api/client/register', { name: v.name, phone, email: v.email, ref: cleanCode(v.ref) || undefined })
    : api<Me>('/api/client/login', { phone, email: v.email });
}

type RefCheck = { state: 'idle' | 'checking' | 'ok' | 'bad'; name?: string; percent?: number };

/**
 * Campo "Código de invitación": viene escrito si entró por el link de un amigo, y avisa
 * al momento si el código existe ("Te invitó Ana: 20%…") o si está mal escrito.
 */
function InviteCodeField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { referral, setReferral, clearReferral } = useApp();
  const [check, setCheck] = useState<RefCheck>({ state: 'idle' });
  const touched = useRef(false);

  // Si llegó por el link de invitación, el código ya aparece escrito
  useEffect(() => {
    if (!touched.current && !value && referral?.code) onChange(referral.code);
  }, [referral?.code, value, onChange]);

  useEffect(() => {
    const code = cleanCode(value);
    if (code.length < 3) {
      setCheck({ state: 'idle' });
      return;
    }
    if (referral && referral.code === code) {
      setCheck({ state: 'ok', name: referral.name, percent: referral.percent });
      return;
    }
    setCheck({ state: 'checking' });
    let off = false;
    const t = setTimeout(() => {
      api<{ valid: boolean; code: string; name: string; percent: number }>(`/api/public/referral?code=${encodeURIComponent(code)}`)
        .then((r) => {
          if (off) return;
          if (r.valid) {
            setReferral({ code: r.code, name: r.name, percent: r.percent });
            setCheck({ state: 'ok', name: r.name, percent: r.percent });
          } else {
            setCheck({ state: 'bad' });
          }
        })
        .catch(() => !off && setCheck({ state: 'idle' }));
    }, 450);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [value, referral, setReferral]);

  return (
    <>
      <Field
        id={id}
        label="Código de invitación"
        placeholder="Código de invitación (opcional)"
        autoComplete="off"
        value={value}
        onChange={(v) => {
          touched.current = true;
          if (!v.trim() && referral) clearReferral();
          onChange(v.toUpperCase());
        }}
      />
      {check.state === 'ok' && (
        <span className="px-1 text-[13px] text-accent">
          Te invitó {check.name}: tenés {check.percent}% en tu primer corte.
        </span>
      )}
      {check.state === 'bad' && <span className="px-1 text-[13px] text-bad">Ese código no existe. Revisalo o dejalo vacío.</span>}
      {check.state === 'checking' && <span className="px-1 text-[13px] text-muted">Revisando el código…</span>}
    </>
  );
}

export function AuthFields({
  mode,
  setMode,
  values,
  setValues,
  idPrefix,
  title,
  area,
}: {
  mode: AuthMode;
  setMode: (m: AuthMode) => void;
  values: AuthValues;
  setValues: (v: AuthValues) => void;
  idPrefix: string;
  title?: string;
  area?: string | null;
}) {
  const preview = phonePreview(values, area);
  return (
    <form className="flex flex-col gap-2.5" onSubmit={(e) => e.preventDefault()}>
      {title && <span className="px-1 text-[15px] font-medium">{title}</span>}
      {mode === 'register' && (
        <Field id={`${idPrefix}-name`} label="Nombre y apellido" autoComplete="name" value={values.name} onChange={(name) => setValues({ ...values, name })} />
      )}
      <Field
        id={`${idPrefix}-phone`}
        label="Teléfono"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="Teléfono (ej: 362 412-3456)"
        value={values.phone}
        onChange={(phone) => setValues({ ...values, phone })}
      />
      <Field
        id={`${idPrefix}-email`}
        label="Correo electrónico"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder={mode === 'register' ? 'Correo electrónico (opcional)' : 'Correo (si lo cargaste)'}
        value={values.email}
        onChange={(email) => setValues({ ...values, email })}
      />
      {preview && <span className="px-1 text-[13px] text-muted">{preview}</span>}
      {mode === 'register' && <InviteCodeField id={`${idPrefix}-ref`} value={values.ref} onChange={(ref) => setValues({ ...values, ref })} />}
      <button
        type="button"
        onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
        className="inline-flex min-h-11 items-center self-start px-1 text-sm text-muted underline"
      >
        {mode === 'register' ? 'Ya tengo cuenta: ingresar' : 'Soy nuevo: crear cuenta'}
      </button>
    </form>
  );
}
