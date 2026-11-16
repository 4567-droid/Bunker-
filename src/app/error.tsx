'use client';

import Link from 'next/link';

// Se muestra si algo falla en el servidor (por ejemplo, la base todavía no está conectada).
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-[13px] tracking-[.18em] text-muted">ALGO FALLÓ</span>
      <h1 className="m-0 text-[28px] font-semibold">No pudimos cargar la página</h1>
      <p className="m-0 max-w-[420px] text-[15px] font-light text-muted">Probá de nuevo en un momento.</p>
      <button type="button" onClick={reset} className="flex min-h-14 items-center rounded-full bg-accent px-8 text-[17px] font-semibold text-bg">
        Reintentar
      </button>
      <Link href="/" className="text-sm text-muted underline">
        Ir al inicio
      </Link>
      <p className="m-0 mt-6 max-w-[420px] text-[13px] font-light text-dim">
        Si recién publicaste la web y sigue así: falta conectar la base de datos
        (en Vercel, Storage → Create Database → Supabase y después Redeploy). Está explicado en el README.
      </p>
    </div>
  );
}
