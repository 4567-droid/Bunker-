'use client';

/** fetch a la API propia: si responde con error, tira un Error con el mensaje en castellano */
export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new Error('Sin conexión. Revisá internet y probá de nuevo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; code?: string };
    const err = new Error(d.error ?? (res.status >= 500 ? 'Algo salió mal. Probá de nuevo en un rato.' : 'No se pudo conectar. Probá de nuevo.')) as Error & { code?: string };
    err.code = d.code;
    throw err;
  }
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
