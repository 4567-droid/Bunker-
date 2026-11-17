// Acepta la dirección de la base en los dos formatos que muestra Supabase:
//   postgresql://postgres.xxx:CLAVE@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
//   host=aws-0-sa-east-1.pooler.supabase.com port=6543 database=postgres user=postgres.xxx password=CLAVE
// (también "host: ..." en varias líneas). Siempre devuelve una URL.
// Copia en scripts/db.mjs: si cambiás algo acá, cambialo allá.

export function normalizeDbUrl(raw: string): string {
  const s = raw.trim().replace(/^["']|["']$/g, '');
  if (/YOUR-PASSWORD/i.test(s)) {
    throw new Error('DATABASE_URL todavía dice [YOUR-PASSWORD]: reemplazalo por la contraseña de la base (Supabase → Connect).');
  }
  if (/^postgres(ql)?:\/\//i.test(s)) return s;
  const kv: Record<string, string> = {};
  for (const m of s.matchAll(/([A-Za-z_]+)\s*[=:]\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    kv[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  const host = kv.host ?? kv.hostname;
  if (!host) {
    throw new Error('DATABASE_URL no tiene el formato esperado: pegá la dirección que empieza con postgresql:// (Supabase → Connect → Transaction pooler).');
  }
  const user = kv.user ?? kv.username ?? 'postgres';
  const pass = kv.password ?? kv.pass ?? '';
  if (!pass) throw new Error('DATABASE_URL: falta la contraseña de la base.');
  const port = kv.port ?? '5432';
  const db = kv.database ?? kv.dbname ?? 'postgres';
  const q = kv.sslmode ? `?sslmode=${encodeURIComponent(kv.sslmode)}` : '';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}${q}`;
}
