import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-[13px] tracking-[.18em] text-muted">ERROR 404</span>
      <h1 className="m-0 text-[28px] font-semibold">Esta página no existe</h1>
      <Link href="/" className="flex min-h-14 items-center rounded-full bg-accent px-8 text-[17px] font-semibold text-bg">
        Ir al inicio
      </Link>
    </div>
  );
}
