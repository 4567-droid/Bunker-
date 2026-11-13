'use client';

/** fetch a la API propia: si responde con error, tira un Error con el mensaje en castellano */
export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'No se pudo conectar. Probá de nuevo.');
  return data as T;
}

export function storage(kind: 'local' | 'session') {
  return {
    get(key: string): string | null {
      try {
        return (kind === 'local' ? localStorage : sessionStorage).getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string | null) {
      try {
        const s = kind === 'local' ? localStorage : sessionStorage;
        if (value === null) s.removeItem(key);
        else s.setItem(key, value);
      } catch {
        /* modo privado: no pasa nada */
      }
    },
  };
}
