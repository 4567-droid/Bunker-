// Formatos compartidos (cliente y servidor)

/** $15.000 */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-$' : '$') + abs;
}

/**
 * Normaliza un celular argentino a 10 dígitos (código de área + número),
 * sin 0, sin 15, sin +54 9. Devuelve null si no parece válido.
 *  "+54 9 362 549-3647" → "3625493647"
 *  "0362 15 549 3647"   → "3625493647"
 */
export function normalizePhone(input: string): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
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
