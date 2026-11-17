// Acepta la dirección de la base en los dos formatos que muestra Supabase:
//   postgresql://postgres.xxx:CLAVE@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
//   host=aws-0-sa-east-1.pooler.supabase.com port=6543 database=postgres user=postgres.xxx password=CLAVE
// (también "host: ..." en varias líneas). Siempre devuelve una URL.
// Copia en scripts/db.mjs: si cambiás algo acá, cambialo allá.

const SIN_CLAVE =
  'DATABASE_URL: falta la contraseña de la base. Cargala en Vercel como DATABASE_PASSWORD ' +
  '(Settings → Environment Variables) y volvé a publicar. Si no la recordás: Supabase → Project Settings → Database → Reset database password.';

/** @param fallbackPassword contraseña aparte (DATABASE_PASSWORD o POSTGRES_PASSWORD), por si la dirección no la trae */
export function normalizeDbUrl(raw: string, fallbackPassword = ''): string {
  const s = raw.trim().replace(/^["']|["']$/g, '');
  const fb = fallbackPassword.trim();
  const isPlaceholder = (p: string) => !p || /YOUR-PASSWORD/i.test(p);
  const m = /^(postgres(?:ql)?:\/\/)([^:@/]+)(?::([^@/]*))?@(.+)$/i.exec(s);
  if (m) {
    const pass = m[3] ?? '';
    if (pass && !isPlaceholder(pass)) return s;
    // Sin contraseña en la dirección: se usa la de aparte; si no hay, se deja igual (bases locales sin clave)
    if (fb) return `${m[1]}${m[2]}:${encodeURIComponent(fb)}@${m[4]}`;
    if (pass) throw new Error(SIN_CLAVE);
    return s;
  }
  if (/^postgres(ql)?:\/\//i.test(s)) return s;
  const kv: Record<string, string> = {};
  for (const x of s.matchAll(/([A-Za-z_]+)\s*[=:]\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    kv[x[1].toLowerCase()] = x[2] ?? x[3] ?? x[4] ?? '';
  }
  const host = kv.host ?? kv.hostname;
  if (!host) {
    throw new Error('DATABASE_URL no tiene el formato esperado: pegá la dirección que empieza con postgresql:// (Supabase → Connect → Transaction pooler).');
  }
  const user = kv.user ?? kv.username ?? 'postgres';
  let pass = kv.password ?? kv.pass ?? '';
  if (isPlaceholder(pass)) pass = fb;
  if (!pass) throw new Error(SIN_CLAVE);
  const port = kv.port ?? '5432';
  const db = kv.database ?? kv.dbname ?? 'postgres';
  const q = kv.sslmode ? `?sslmode=${encodeURIComponent(kv.sslmode)}` : '';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}${q}`;
}
