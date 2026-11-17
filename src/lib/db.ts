import 'server-only';
import postgres from 'postgres';
import { normalizeDbUrl } from './db-url';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = postgres.TransactionSql<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = postgres.Sql<any>;

declare global {
  var __bunkerSql: Sql | undefined;
}

function create(): Sql {
  // DATABASE_URL (a mano) o POSTGRES_URL (la carga sola la integración de Supabase en Vercel)
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) throw new Error('Falta DATABASE_URL (ver .env.example)');
  const url = normalizeDbUrl(raw, process.env.DATABASE_PASSWORD || process.env.POSTGRES_PASSWORD || '');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Supabase "Transaction pooler" (puerto 6543): sin prepared statements ni pipelining
  const pooler = /:6543\//.test(url) || /pgbouncer=true/.test(url) || process.env.DATABASE_POOLER === 'transaction';
  return postgres(url, {
    ssl: local ? false : 'require',
    prepare: pooler ? false : undefined,
    max_pipeline: pooler ? 1 : undefined,
    max: pooler ? 3 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    query_timeout: 15_000,
    onnotice: () => {},
    // Las fechas (date) viajan como texto 'YYYY-MM-DD', sin corrimientos de zona horaria
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

export function db(): Sql {
  globalThis.__bunkerSql ??= create();
  return globalThis.__bunkerSql;
}

/**
 * Transacción "de un negocio": la base solo deja ver/cambiar filas de ese negocio
 * (Row Level Security con el rol bunker_app).
 */
export function tenantTx<T>(businessId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('app.business_id', ${businessId}, true),
                    set_config('app.is_admin', 'off', true),
                    set_config('role', 'bunker_app', true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** Transacción del administrador general: ve todos los negocios. */
export function adminTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('app.business_id', '', true),
                    set_config('app.is_admin', 'on', true),
                    set_config('role', 'bunker_app', true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** Solo para ingreso/sesiones y para encontrar el negocio por dominio. */
export function systemTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(fn) as Promise<T>;
}
