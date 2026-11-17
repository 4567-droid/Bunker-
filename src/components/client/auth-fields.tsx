'use client';

import { Field } from '@/components/ui';
import { api } from '@/lib/api-client';
import { isEmail, normalizePhone, phoneDisplay } from '@/lib/format';
import type { Me } from './app-context';

export type AuthMode = 'register' | 'login';
export interface AuthValues {
  name: string;
  phone: string;
  email: string;
}
export const EMPTY_AUTH: AuthValues = { name: '', phone: '', email: '' };

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
    return `Revisá el teléfono: ${digits.length} números. Escribilo con código de área (ej: 362 549-3647) o solo tu número (ej: 15 549-3647).`;
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
  return typed.length < 10 ? `Queda como ${phoneDisplay(p)}` : null;
}

export function submitAuth(mode: AuthMode, v: AuthValues, ref?: string | null, area?: string | null): Promise<Me> {
  const phone = normalizePhone(v.phone, area) ?? v.phone;
  return mode === 'register'
    ? api<Me>('/api/client/register', { name: v.name, phone, email: v.email, ref: ref ?? undefined })
    : api<Me>('/api/client/login', { phone, email: v.email });
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
      {preview && <span className="px-1 text-[13px] text-muted">{preview}</span>}
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
