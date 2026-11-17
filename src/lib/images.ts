import 'server-only';
import type { Tx } from './db';
import { fail } from './http';

// Fotos subidas desde el panel. El celular las achica antes de subirlas
// (máx. ~1600 px, WebP o JPEG), así que entran cómodas en la base.

const MAX_BYTES = 1_500_000;
const IMG_URL = /^\/api\/img\/([0-9a-f-]{36})$/i;

function sniff(buf: Buffer): 'image/webp' | 'image/jpeg' | 'image/png' | null {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

/** Guarda la foto (data URL o base64) y devuelve su dirección: /api/img/<id> */
export async function saveImage(tx: Tx, bizId: string, raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || raw.length < 100) fail(400, 'Elegí una foto.');
  const b64 = raw.replace(/^data:[^;,]+;base64,/, '');
  if (b64.length > MAX_BYTES * 1.4) fail(413, 'La foto es muy pesada. Probá con otra.');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > MAX_BYTES) fail(413, 'La foto es muy pesada. Probá con otra.');
  const mime = sniff(buf);
  if (!mime) fail(400, 'Ese archivo no es una foto (JPG, PNG o WebP).');
  const [row] = await tx<{ id: string }[]>`
    insert into images (business_id, mime, data, bytes) values (${bizId}, ${mime}, ${buf}, ${buf.length}) returning id`;
  return `/api/img/${row.id}`;
}

/** Borra la foto anterior si era una de las nuestras */
export async function dropImage(tx: Tx, bizId: string, url: string | null | undefined): Promise<void> {
  const m = url ? IMG_URL.exec(url) : null;
  if (m) await tx`delete from images where id = ${m[1]} and business_id = ${bizId}`;
}
