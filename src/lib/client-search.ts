import 'server-only';
import type { Tx } from './db';

// Búsqueda de clientes por nombre, correo o teléfono, se escriba como se escriba:
//  - sin importar tildes ni mayúsculas ("lucia" encuentra "Lucía")
//  - varias palabras: todas tienen que estar ("lucia fer")
//  - teléfono con o sin 0, 15, +54 9, espacios o guiones: con 7 números o más se compara el número
//    sin el código de área ("0362 15 449-3647", "449-3647" y "3624493647" encuentran lo mismo)

const ACCENTS = 'ÁÉÍÓÚÜÑÀÈÌÒÙáéíóúüñàèìòù';
const PLAIN = 'AEIOUUNAEIOUaeiouunaeiou';

export function plainText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Condición SQL para la tabla `clients` con alias `c` (null si no hay nada para buscar) */
export function clientMatch(tx: Tx, q: string) {
  const words = plainText(q)
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9@._+-]/g, ''))
    .filter(Boolean);
  const textWords = words.filter((w) => /[a-z]/.test(w));
  const digits = words
    .filter((w) => !/[a-z]/.test(w))
    .join('')
    .replace(/\D/g, '');
  const conds = textWords.map(
    (w) => tx`(lower(translate(c.name, ${ACCENTS}, ${PLAIN})) like ${'%' + w + '%'}
               or lower(coalesce(c.email, '')) like ${'%' + w + '%'})`,
  );
  if (digits.length >= 3) {
    const key = digits.length >= 7 ? digits.slice(-7) : digits;
    conds.push(tx`coalesce(c.phone, '') like ${'%' + key + '%'}`);
  }
  if (!conds.length) return null;
  return conds.reduce((a, b) => tx`${a} and ${b}`);
}

/** "362 449-3647" → "362 •••-••47" (para clientes de otro barbero) */
export function maskedPhone(display: string): string {
  if (!display) return '';
  const keep = display.slice(-2);
  const head = display.slice(0, Math.min(4, Math.max(0, display.length - 2)));
  return `${head}${display.slice(head.length, -2).replace(/\d/g, '•')}${keep}`;
}
