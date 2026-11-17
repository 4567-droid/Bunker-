import { NextResponse, type NextRequest } from 'next/server';

// Mientras un negocio no tenga su dominio propio, se lo puede ver con
// ?negocio=slug (por ejemplo en la dirección de prueba de Vercel).
// Si el dominio coincide con uno cargado, siempre gana el dominio.
export function proxy(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('negocio');
  if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.set('x-bk-biz', slug);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set('bk_biz', slug, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export const config = {
  matcher: ['/((?!_next/|brand/|api/).*)'],
};
