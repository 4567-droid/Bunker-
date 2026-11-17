// Formatos compartidos (cliente y servidor)

/** $15.000 */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-$' : '$') + abs;
}

// Códigos de área argentinos de 3 dígitos (el 11 es el único de 2; el resto, 4)
const AREA3 = new Set([
  '220', '221', '223', '230', '236', '237', '249', '260', '261', '263', '264', '266', '280', '291', '294',
  '297', '298', '299', '336', '341', '342', '343', '345', '348', '351', '353', '358', '362', '364', '370',
  '376', '379', '380', '381', '383', '385', '387', '388',
]);

/** Código de área del negocio, sacado de su WhatsApp ("5493624493647" → "362") */
export function areaFromWhatsapp(whatsapp: string | null | undefined): string | null {
  let d = String(whatsapp ?? '').replace(/\D/g, '');
  if (d.startsWith('549')) d = d.slice(3);
  else if (d.startsWith('54')) d = d.slice(2);
  if (d.length !== 10) return null;
  if (d.startsWith('11')) return '11';
  if (AREA3.has(d.slice(0, 3))) return d.slice(0, 3);
  return d.slice(0, 4);
}

/** Un teléfono tiene entre 6 y 15 números (15 es el máximo internacional) */
export const PHONE_MIN = 6;
export const PHONE_MAX = 15;

/**
 * Celular argentino a 10 dígitos (código de área + número), sin 0, sin 15, sin +54 9.
 * Devuelve null si no tiene forma de número argentino.
 *  "+54 9 362 549-3647" → "3625493647"
 *  "0362 15 549 3647"   → "3625493647"
 *  "15 549-3647" o "549-3647" (sin código de área) → usa el del negocio: "3625493647"
 */
function argentinePhone(digits: string, defaultArea?: string | null): string | null {
  let d = digits;
  // Número local sin código de área: se le agrega el del negocio
  if (defaultArea && d.length < 10) {
    const local = 10 - defaultArea.length;
    if (d.length === local + 2 && d.startsWith('15')) d = defaultArea + d.slice(2);
    else if (d.length === local) d = defaultArea + d;
  }
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54') && d.length >= 12) {
    d = d.slice(2);
    if (d.startsWith('9')) d = d.slice(1);
  }
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === '15') {
        d = d.slice(0, area) + d.slice(area + 2);
        break;
      }
    }
  }
  if (d.length !== 10) return null;
  if (!/^[123]/.test(d)) return null;
  if (d[0] === '1' && d[1] !== '1') return null; // solo existe el 11
  return d;
}

/**
 * Acepta cualquier teléfono. Si tiene forma de celular argentino se guarda con el formato
 * de siempre (10 dígitos, así WhatsApp y el ingreso funcionan igual se escriba como se escriba).
 * Si no (otro país, fijo, etc.), se guardan sus números tal cual, sin el "+" ni el "00".
 * Devuelve null solo si tiene menos de 6 o más de 15 números.
 */
export function normalizePhone(input: string, defaultArea?: string | null): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');
  const ar = argentinePhone(digits, defaultArea);
  if (ar) return ar;
  const d = digits.startsWith('00') ? digits.slice(2) : digits;
  if (d.length < PHONE_MIN || d.length > PHONE_MAX) return null;
  return d;
}

/** "362 449-3647" (o "3722 45-6789" si el código de área es de 4) */
export function phoneDisplay(d: string | null | undefined): string {
  if (!d) return '';
  if (d.length > 10) return `+${d}`;
  if (d.length !== 10) return d;
  if (d.startsWith('11')) return `11 ${d.slice(2, 6)}-${d.slice(6)}`;
  if (AREA3.has(d.slice(0, 3))) return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 6)}-${d.slice(6)}`;
}

/**
 * WhatsApp del negocio en formato internacional (lo que necesita wa.me), se escriba como se escriba:
 * "362 449-3647", "0362 15 449-3647" o "+54 9 362 449-3647" → "5493624493647".
 */
export function whatsappIntl(input: string, defaultArea?: string | null): string | null {
  const d = normalizePhone(input, defaultArea);
  if (!d) return null;
  return d.length === 10 ? `549${d}` : d;
}

/** Usuario de Instagram desde lo que peguen: "@bunker", "https://www.instagram.com/bunker?igsh=…" → "bunker" */
export function instagramHandle(input: string | null | undefined): string | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(s);
  const h = (m ? m[1] : s.replace(/^@/, '')).replace(/\/+$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : null;
}

/** Link de Google Maps: el que cargó el negocio o, si no hay, uno armado con la dirección */
export function mapsHref(mapsUrl: string | null | undefined, address: string | null | undefined, city: string | null | undefined): string | null {
  if (mapsUrl && /^https?:\/\//i.test(mapsUrl)) return mapsUrl;
  const q = [address, city].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function firstName(name: string): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export const PAYMENTS = {
  efectivo: { name: 'Efectivo', desc: 'En el local' },
  transferencia: { name: 'Transferencia', desc: 'Al alias de la barbería' },
  mercadopago: { name: 'Mercado Pago', desc: 'Link o QR en el local' },
} as const;
export type Payment = keyof typeof PAYMENTS;
