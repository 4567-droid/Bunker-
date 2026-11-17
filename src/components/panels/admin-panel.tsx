'use client';

import { useCallback, useEffect, useState } from 'react';
import { Chip, ErrorNote, Field, GhostButton, Kicker, LoginShell, OkNote, PrimaryButton, Stat } from '@/components/ui';
import { api } from '@/lib/api-client';
import { DEMO_ACCESS, DEMO_SLUG } from '@/lib/demo';
import { PasswordForm } from './shared';

interface Biz {
  id: string;
  slug: string;
  name: string;
  kind: string;
  domain: string | null;
  status: string;
  accent: string;
  logoUrl: string | null;
  heroUrl: string | null;
  theme?: string;
  clients: number;
  owners: { id: string; name: string; username: string; active: boolean }[];
  staff: { id: string; name: string; active: boolean }[];
}
interface Data {
  businesses: Biz[];
  totals: { businesses: number; owners: number; staff: number };
}

const STATUS: Record<string, string> = { activo: 'Activo', demo: 'Demo', por_armar: 'Por armar', pausado: 'Pausado' };

export function AdminPanel() {
  const [ok, setOk] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    api<{ staff: { role: string } | null }>('/api/staff/me')
      .then((r) => setOk(r.staff?.role === 'admin'))
      .catch(() => setOk(false));
  }, []);
  if (ok === undefined) return <div className="p-8 text-muted">Cargando…</div>;
  if (!ok) return <AdminLogin onDone={() => setOk(true)} />;
  return <AdminApp onLogout={() => setOk(false)} />;
}

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <LoginShell brand="Panel" title="Administrador general" sub="Todos los negocios en un solo lugar.">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api('/api/staff/login', { role: 'admin', username: user, password: pass });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id="a1" label="Usuario" autoComplete="username" value={user} onChange={setUser} />
        <Field id="a2" label="Contraseña" type="password" autoComplete="current-password" value={pass} onChange={setPass} />
        <ErrorNote text={error} />
        <PrimaryButton type="submit" disabled={!user || !pass} busy={busy} className="mt-2">
          Ingresar
        </PrimaryButton>
      </form>
    </LoginShell>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-light text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 w-full rounded-xl border border-line bg-field px-3 text-[15px] text-ink placeholder:text-dim"
      />
    </label>
  );
}

function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Data>('/api/admin/businesses');
      setData(d);
      setSel((s) => s ?? d.businesses[0]?.id ?? null);
    } catch (e) {
      if ((e as Error).message.includes('ingresar')) onLogout();
      else setError((e as Error).message);
    }
  }, [onLogout]);
  useEffect(() => {
    load();
  }, [load]);

  async function save(path: string, body: Record<string, unknown>, ok: string) {
    setMsg(null);
    setError(null);
    try {
      await api(path, body);
      setMsg(ok);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  const cur = data?.businesses.find((b) => b.id === sel) ?? null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[960px] flex-col gap-5 px-4 pt-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Kicker>Un solo panel, varios negocios</Kicker>
          <h1 className="m-0 text-[30px] leading-tight font-semibold">Todos los negocios</h1>
        </div>
        <div className="flex gap-2">
          <PrimaryButton onClick={() => setCreating((c) => !c)} className="!min-h-12 !text-[15px]">
            {creating ? 'Cerrar' : 'Agregar negocio'}
          </PrimaryButton>
          <GhostButton
            small
            onClick={async () => {
              await api('/api/staff/logout', {}).catch(() => {});
              onLogout();
            }}
            className="!min-h-12"
          >
            Salir
          </GhostButton>
        </div>
      </header>
      <ErrorNote text={error} />
      <OkNote text={msg} />

      {data && (
        <div className="grid grid-cols-3 gap-2.5">
          <Stat value={data.totals.businesses} label="Negocios" />
          <Stat value={data.totals.owners} label="Dueños" />
          <Stat value={data.totals.staff} label="Barberos y profesionales" />
        </div>
      )}

      {creating && <NewBusiness save={save} onDone={() => setCreating(false)} />}

      {data && <DemoCard demo={data.businesses.find((b) => b.slug === DEMO_SLUG) ?? null} save={save} />}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-start">
        <section className="flex flex-col gap-2.5">
          <Kicker className="px-1">Negocios cargados</Kicker>
          {data?.businesses.map((b) => {
            const on = b.id === sel;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSel(b.id)}
                aria-pressed={on}
                className={`flex min-h-[88px] w-full flex-col gap-2 rounded-[20px] border-[1.5px] px-5 py-4 text-left text-ink ${on ? 'border-accent bg-pick' : 'border-line bg-card'}`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-xl font-semibold">
                    <span className="h-3 w-3 rounded-full" style={{ background: b.accent }} />
                    {b.name}
                  </span>
                  <span className={`text-xs font-semibold tracking-[.1em] uppercase ${b.status === 'activo' || b.status === 'demo' ? 'text-accent' : 'text-muted'}`}>
                    {STATUS[b.status] ?? b.status}
                  </span>
                </span>
                <span className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm font-light text-muted">
                  <span>
                    {b.kind} · {b.clients} clientes
                  </span>
                  <span>{b.domain ?? 'sin dominio'}</span>
                </span>
              </button>
            );
          })}
        </section>
        {cur && <BusinessDetail key={cur.id} b={cur} save={save} />}
      </div>

      <div className="max-w-[480px]">
        <PasswordForm />
      </div>
    </div>
  );
}

/** Negocio de muestra: links para mostrar, accesos y "dejar como nuevo" */
function DemoCard({ demo, save }: { demo: Biz | null; save: (p: string, body: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  async function run(reset: boolean) {
    if (reset && !window.confirm('¿Dejar la muestra como nueva? Se borran los turnos y clientes que hayan cargado al probarla.')) return;
    setBusy(true);
    await save(
      '/api/admin/demo',
      { reset },
      reset ? 'Listo: la muestra quedó como nueva, con turnos desde hoy.' : 'Listo: el negocio de muestra está creado.',
    );
    setBusy(false);
  }
  if (!demo) {
    return (
      <section className="flex flex-col gap-3 rounded-[20px] border border-dashed border-line-2 px-5 py-4">
        <span className="text-lg font-semibold">Negocio de muestra</span>
        <span className="text-sm font-light text-muted">
          Una barbería de ejemplo, con clientes, turnos y 4 meses de números, para mostrarle el sistema a otros negocios.
        </span>
        <PrimaryButton onClick={() => run(false)} busy={busy} className="!min-h-12 self-start !px-6 !text-[15px]">
          Crear negocio de muestra
        </PrimaryButton>
      </section>
    );
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = demo.domain ? `https://${demo.domain}` : origin;
  const q = demo.domain ? '' : `?negocio=${demo.slug}`;
  const links = [
    { label: 'Web de clientes', href: `${base}/${q}` },
    { label: 'Central del dueño', href: `${base}/central${q}` },
    { label: 'Panel de barberos', href: `${base}/barbero${q}` },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border-[1.5px] px-5 py-4" style={{ borderColor: demo.accent }}>
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2.5 text-lg font-semibold">
          <span className="h-3 w-3 rounded-full" style={{ background: demo.accent }} />
          {demo.name} · muestra
        </span>
        <span className="text-sm font-light text-muted">{demo.clients} clientes de ejemplo</span>
      </span>
      <span className="text-sm font-light text-muted">
        Copia de Bunker con otro nombre, para mostrarle el sistema a otros negocios. Es un negocio aparte: lo que hagan ahí
        no toca a Bunker. Al dejarla como nueva vuelve a copiar precios y configuración de Bunker.
      </span>
      <div className="flex flex-col gap-2">
        {links.map((l) => (
          <div key={l.label} className="flex items-center gap-3 rounded-[14px] bg-field px-4 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] font-light text-muted">{l.label}</span>
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="truncate text-[15px] underline">
                {l.href.replace(/^https?:\/\//, '')}
              </a>
            </span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(l.href).then(() => setCopied(l.label)).catch(() => {})}
              className="min-h-10 shrink-0 rounded-full border border-line-2 px-4 text-sm"
            >
              {copied === l.label ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 rounded-[14px] border border-line px-4 py-3 text-sm sm:grid-cols-2">
        <span>
          <span className="font-light text-muted">Central: </span>
          usuario <b>{DEMO_ACCESS.owner.user}</b> · contraseña <b>{DEMO_ACCESS.owner.password}</b>
        </span>
        <span>
          <span className="font-light text-muted">Barberos: </span>
          {DEMO_ACCESS.barbers.map((b, i) => (
            <span key={b.name}>
              {i > 0 ? ' · ' : ''}
              <b>{b.name}</b> código <b>{b.code}</b>
            </span>
          ))}
        </span>
      </div>
      <span className="text-[13px] font-light text-muted">
        Consejo: en la Central de la muestra (Ajustes) cargá tu WhatsApp, así los interesados te escriben a vos.
      </span>
      <GhostButton onClick={() => run(true)} disabled={busy} className="!min-h-12 self-start !text-[15px]">
        {busy ? 'Armando…' : 'Dejar la muestra como nueva'}
      </GhostButton>
    </section>
  );
}

function BusinessDetail({ b, save }: { b: Biz; save: (p: string, body: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ name: b.name, kind: b.kind, domain: b.domain ?? '', accent: b.accent, logoUrl: b.logoUrl ?? '', heroUrl: b.heroUrl ?? '', status: b.status, theme: b.theme ?? 'clasico' });
  const [owner, setOwner] = useState({ name: b.owners[0]?.name ?? '', username: b.owners[0]?.username ?? '', password: '' });
  const centralHref = b.domain ? `https://${b.domain}/central` : `/central?negocio=${b.slug}`;
  const webHref = b.domain ? `https://${b.domain}/` : `/?negocio=${b.slug}`;
  const tree = [
    { label: 'Administrador general', role: 'Nivel 1', indent: 0, on: true },
    ...(b.owners.length ? b.owners : [{ id: 'x', name: 'Sin dueño cargado', username: '', active: true }]).map((o) => ({ label: o.name + (o.username ? ` (${o.username})` : ''), role: 'Dueño · Nivel 2', indent: 24, on: false })),
    ...b.staff.map((s) => ({ label: s.name + (s.active ? '' : ' (inactivo)'), role: 'Barbero · Nivel 3', indent: 56, on: false })),
  ];
  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-col gap-1">
        <Kicker>Quién maneja qué</Kicker>
        <span className="text-[28px] leading-tight font-semibold">{b.name}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tree.map((n, i) => (
          <div key={i} className="flex items-center gap-2.5" style={{ marginLeft: n.indent }}>
            {n.indent > 0 && <span className="h-px w-[18px] shrink-0 bg-dash" />}
            <div className={`flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-2xl border px-4 py-3 ${n.on ? 'border-accent bg-field' : 'border-line bg-card'}`}>
              <span className="font-medium">{n.label}</span>
              <span className="text-xs tracking-[.12em] text-muted uppercase">{n.role}</span>
            </div>
          </div>
        ))}
        {b.staff.length === 0 && <span className="text-sm font-light text-muted">Todavía no se cargaron barberos o profesionales. Los da de alta el dueño desde su Central.</span>}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <a href={centralHref} className="inline-flex min-h-12 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-bg">
          Abrir central del dueño
        </a>
        <a href={webHref} className="inline-flex min-h-12 items-center rounded-full border border-line-2 px-5 text-[15px] text-ink">
          Ver la web
        </a>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        <span className="text-base font-semibold">Datos y marca</span>
        <div className="flex flex-wrap gap-2.5">
          <Input label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="Rubro" value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} />
        </div>
        <Input label="Dominio" value={form.domain} onChange={(v) => setForm({ ...form, domain: v })} placeholder="bunkerbarberclub.com.ar" />
        <div className="flex flex-wrap gap-2.5">
          <Input label="Color (#hex)" value={form.accent} onChange={(v) => setForm({ ...form, accent: v })} />
          <Input label="Logo (URL)" value={form.logoUrl} onChange={(v) => setForm({ ...form, logoUrl: v })} />
        </div>
        <Input label="Foto de portada (URL de la foto del local)" value={form.heroUrl} onChange={(v) => setForm({ ...form, heroUrl: v })} />
        <ThemePicker value={form.theme} accent={form.accent} onChange={(theme, accent) => setForm({ ...form, theme, accent })} />
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS).map(([k, v]) => (
            <Chip key={k} size="sm" on={form.status === k} onClick={() => setForm({ ...form, status: k })}>
              {v}
            </Chip>
          ))}
        </div>
        <GhostButton onClick={() => save('/api/admin/business/update', { id: b.id, ...form }, 'Negocio guardado.')}>Guardar datos</GhostButton>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        <span className="text-base font-semibold">Dueño: usuario y contraseña</span>
        <div className="flex flex-wrap gap-2.5">
          <Input label="Nombre" value={owner.name} onChange={(v) => setOwner({ ...owner, name: v })} />
          <Input label="Usuario" value={owner.username} onChange={(v) => setOwner({ ...owner, username: v })} />
        </div>
        <Input label="Contraseña nueva (mínimo 8)" type="password" value={owner.password} onChange={(v) => setOwner({ ...owner, password: v })} />
        <GhostButton
          disabled={owner.username.length < 3 || owner.password.length < 8}
          onClick={async () => {
            if (await save('/api/admin/owner', { businessId: b.id, ...owner }, 'Dueño guardado. Ya puede entrar a su Central.')) setOwner({ ...owner, password: '' });
          }}
        >
          Crear dueño o cambiar su contraseña
        </GhostButton>
      </div>
    </section>
  );
}

// Estilos de la web que puede elegir cada negocio (con su color sugerido)
const THEME_OPTIONS = [
  { id: 'clasico', label: 'Clásico', desc: 'Negro y amarillo, como Bunker', color: '#F5C400' },
  { id: 'natural', label: 'Natural', desc: 'Verde oscuro, dorado y letras con serifa', color: '#C9A66B' },
];

/** Elegir el estilo de la web. Si el color era el sugerido del estilo anterior, cambia al del nuevo. */
function ThemePicker({ value, accent, onChange }: { value: string; accent: string; onChange: (theme: string, accent: string) => void }) {
  const cur = THEME_OPTIONS.find((t) => t.id === value) ?? THEME_OPTIONS[0];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-muted">Estilo de la web</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {THEME_OPTIONS.map((t) => {
          const on = t.id === cur.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(t.id, accent.toUpperCase() === cur.color.toUpperCase() ? t.color : accent)}
              className={`flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left text-ink ${on ? 'border-accent bg-pick' : 'border-line bg-card'}`}
            >
              <span className="h-8 w-8 shrink-0 rounded-full border border-line-2" style={{ background: t.id === 'natural' ? `linear-gradient(135deg, #1C2819 55%, ${t.color} 55%)` : `linear-gradient(135deg, #1A1A18 55%, ${t.color} 55%)` }} />
              <span className="flex flex-col">
                <span className="text-[15px] font-medium">{t.label}</span>
                <span className="text-xs font-light text-muted">{t.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewBusiness({ save, onDone }: { save: (p: string, body: Record<string, unknown>, ok: string) => Promise<boolean>; onDone: () => void }) {
  const [f, setF] = useState({ name: '', slug: '', kind: 'Barbería', domain: '', accent: '#F5C400', logoUrl: '', theme: 'clasico', ownerName: '', ownerUser: '', ownerPassword: '' });
  const slugify = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const ok = f.name.trim().length > 1 && f.slug.length > 1 && f.ownerUser.length > 2 && f.ownerPassword.length >= 8;
  return (
    <section className="flex flex-col gap-2.5 rounded-3xl border border-dashed border-dash p-5">
      <span className="text-lg font-semibold">Nuevo negocio</span>
      <div className="flex flex-wrap gap-2.5">
        <Input label="Nombre" value={f.name} onChange={(v) => setF({ ...f, name: v, slug: f.slug && f.slug !== slugify(f.name) ? f.slug : slugify(v) })} />
        <Input label="Identificador (para la dirección)" value={f.slug} onChange={(v) => setF({ ...f, slug: slugify(v) })} />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Input label="Rubro" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} placeholder="Barbería, Uñas, Consultorio…" />
        <Input label="Dominio (opcional)" value={f.domain} onChange={(v) => setF({ ...f, domain: v })} />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Input label="Color (#hex)" value={f.accent} onChange={(v) => setF({ ...f, accent: v })} />
        <Input label="Logo (URL, opcional)" value={f.logoUrl} onChange={(v) => setF({ ...f, logoUrl: v })} />
      </div>
      <ThemePicker value={f.theme} accent={f.accent} onChange={(theme, accent) => setF({ ...f, theme, accent })} />
      <span className="pt-1 text-[13px] text-muted">Dueño del negocio</span>
      <div className="flex flex-wrap gap-2.5">
        <Input label="Nombre" value={f.ownerName} onChange={(v) => setF({ ...f, ownerName: v })} />
        <Input label="Usuario" value={f.ownerUser} onChange={(v) => setF({ ...f, ownerUser: v })} />
        <Input label="Contraseña (mínimo 8)" type="password" value={f.ownerPassword} onChange={(v) => setF({ ...f, ownerPassword: v })} />
      </div>
      <PrimaryButton
        disabled={!ok}
        onClick={async () => {
          if (await save('/api/admin/business', f, `${f.name} creado. El dueño ya puede entrar a su Central.`)) onDone();
        }}
      >
        Crear negocio
      </PrimaryButton>
    </section>
  );
}
