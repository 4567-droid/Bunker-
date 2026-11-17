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

/** Código de área del negocio, sacado de su WhatsApp ("5493625493647" → "362") */
export function areaFromWhatsapp(whatsapp: string | null | undefined): string | null {
  let d = String(whatsapp ?? '').replace(/\D/g, '');
  if (d.startsWith('549')) d = d.slice(3);
  else if (d.startsWith('54')) d = d.slice(2);
  if (d.length !== 10) return null;
  if (d.startsWith('11')) return '11';
  if (AREA3.has(d.slice(0, 3))) return d.slice(0, 3);
  return d.slice(0, 4);
}

/**
 * Normaliza un celular argentino a 10 dígitos (código de área + número),
 * sin 0, sin 15, sin +54 9. Devuelve null si no parece válido.
 *  "+54 9 362 549-3647" → "3625493647"
 *  "0362 15 549 3647"   → "3625493647"
 *  "15 549-3647" o "549-3647" (sin código de área) → usa el del negocio: "3625493647"
 */
export function normalizePhone(input: string, defaultArea?: string | null): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
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

/** "362 549-3647" */
export function phoneDisplay(d: string | null | undefined): string {
  if (!d) return '';
  if (d.length !== 10) return d;
  if (d.startsWith('11')) return `11 ${d.slice(2, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
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
