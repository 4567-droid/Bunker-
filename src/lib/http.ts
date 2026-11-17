import 'server-only';
import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Para que la pantalla sepa qué hacer (ej: 'needs_email' → pasar a "Ya tengo cuenta") */
    public code?: string,
  ) {
    super(message);
  }
}

export function fail(status: number, message: string, code?: string): never {
  throw new HttpError(status, message, code);
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export type Body = Record<string, unknown>;

/** Lee el cuerpo JSON y frena pedidos de otros sitios (CSRF). */
export async function readBody(req: Request): Promise<Body> {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) fail(415, 'Pedido inválido.');
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      fail(403, 'Origen no permitido.');
    }
    if (originHost !== host) fail(403, 'Origen no permitido.');
  }
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Body) : {};
  } catch {
    fail(400, 'Pedido inválido.');
  }
}

export function str(b: Body, key: string, opts: { min?: number; max?: number; optional?: boolean; label?: string } = {}): string {
  const raw = b[key];
  const v = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
  const label = opts.label ?? key;
  if (!v) {
    if (opts.optional) return '';
    fail(400, `Falta ${label}.`);
  }
  if (opts.min && v.length < opts.min) fail(400, `${label} es muy corto.`);
  if (v.length > (opts.max ?? 200)) fail(400, `${label} es muy largo.`);
  return v;
}

export function int(b: Body, key: string, opts: { min?: number; max?: number; optional?: boolean; label?: string } = {}): number {
  const raw = b[key];
  const label = opts.label ?? key;
  if (raw === undefined || raw === null || raw === '') {
    if (opts.optional) return NaN;
    fail(400, `Falta ${label}.`);
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^\d-]/g, ''));
  if (!Number.isInteger(n)) fail(400, `${label} no es un número válido.`);
  if (opts.min !== undefined && n < opts.min) fail(400, `${label} es muy chico.`);
  if (opts.max !== undefined && n > opts.max) fail(400, `${label} es muy grande.`);
  return n;
}

export function bool(b: Body, key: string): boolean | undefined {
  const v = b[key];
  return typeof v === 'boolean' ? v : undefined;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(v: unknown, label = 'id'): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) fail(400, `${label} inválido.`);
  return v;
}

type Handler = (req: Request, path: string[]) => Promise<Response>;
type Ctx = { params: Promise<{ p?: string[] }> };

/** Envuelve un manejador: errores → JSON con mensaje claro en castellano. */
export function route(handler: Handler) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const { p = [] } = await ctx.params;
      return await handler(req, p);
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

export function toErrorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json(e.code ? { error: e.message, code: e.code } : { error: e.message }, e.status);
  const code = (e as { code?: string })?.code;
  if (code === '23P01') return json({ error: 'Ese horario se acaba de ocupar. Elegí otro.' }, 409);
  if (code === '23505') return json({ error: 'Ya existe un registro con esos datos.' }, 409);
  if (code === '23514') return json({ error: 'Algún dato no es válido.' }, 400);
  console.error(e);
  return json({ error: 'Algo salió mal. Probá de nuevo en un rato.' }, 500);
}

export function notFound(): never {
  fail(404, 'No encontrado.');
}

/** Dirección pública de la web (para armar links en mensajes de WhatsApp) */
export function publicOrigin(req: Request): string {
  const h = req.headers;
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim();
  const proto = (h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0].trim();
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
