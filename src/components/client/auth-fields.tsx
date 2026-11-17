'use client';

import { Field } from '@/components/ui';
import { api } from '@/lib/api-client';
import { isEmail, normalizePhone } from '@/lib/format';
import type { Me } from './app-context';

export type AuthMode = 'register' | 'login';
export interface AuthValues {
  name: string;
  phone: string;
  email: string;
}
export const EMPTY_AUTH: AuthValues = { name: '', phone: '', email: '' };

export function authValid(mode: AuthMode, v: AuthValues): boolean {
  const phoneOk = normalizePhone(v.phone) !== null;
  const emailOk = !v.email.trim() || isEmail(v.email.trim());
  if (mode === 'login') return phoneOk && emailOk;
  return /\S+\s+\S+/.test(v.name.trim()) && phoneOk && emailOk;
}

export function authHint(mode: AuthMode, v: AuthValues): string | null {
  if (mode === 'register' && v.name.trim() && !/\S+\s+\S+/.test(v.name.trim())) return 'Poné nombre y apellido.';
  if (v.phone.replace(/\D/g, '').length >= 8 && !normalizePhone(v.phone)) return 'Teléfono: código de área y número, sin 0 ni 15. Ej: 362 549-3647';
  if (v.email.trim() && !isEmail(v.email.trim())) return 'Revisá el correo.';
  return null;
}

export function submitAuth(mode: AuthMode, v: AuthValues, ref?: string | null): Promise<Me> {
  return mode === 'register'
    ? api<Me>('/api/client/register', { name: v.name, phone: v.phone, email: v.email, ref: ref ?? undefined })
    : api<Me>('/api/client/login', { phone: v.phone, email: v.email });
}

export function AuthFields({
  mode,
  setMode,
  values,
  setValues,
  idPrefix,
  title,
}: {
  mode: AuthMode;
  setMode: (m: AuthMode) => void;
  values: AuthValues;
  setValues: (v: AuthValues) => void;
  idPrefix: string;
  title?: string;
}) {
  const hint = authHint(mode, values);
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
        placeholder="Teléfono (ej: 362 549-3647)"
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
      {hint && <span className="px-1 text-[13px] text-muted">{hint}</span>}
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
