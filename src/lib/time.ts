// Fechas y horarios. Todo se calcula en la zona horaria del negocio
// (America/Argentina/Buenos_Aires por defecto). Los días viajan como
// texto 'YYYY-MM-DD' y los horarios como minutos desde las 00:00.

export type Hours = Record<string, [string, string][]>;

export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59) return NaN;
  return h * 60 + mm;
}

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dow(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export interface Now {
  day: string;
  min: number;
  dow: number;
}

export function nowIn(tz: string, date: Date = new Date()): Now {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  return { day, min: Number(get('hour')) * 60 + Number(get('minute')), dow: dow(day) };
}

/** "Jueves 12/11" */
export function dayLabel(day: string): string {
  return `${DAY_LONG[dow(day)]} ${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`;
}

/** "noviembre 2026" */
export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function rangesFor(hours: Hours, day: string): [number, number][] {
  const list = hours[String(dow(day))] ?? [];
  return list
    .map(([a, b]) => [toMin(a), toMin(b)] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
}

export function isOpenDay(hours: Hours, day: string): boolean {
  return rangesFor(hours, day).length > 0;
}

export function isOpenAt(hours: Hours, day: string, min: number): boolean {
  return rangesFor(hours, day).some(([a, b]) => min >= a && min < b);
}

/** Hora de cierre del tramo actual (si está abierto) */
export function closesAt(hours: Hours, day: string, min: number): number | null {
  const r = rangesFor(hours, day).find(([a, b]) => min >= a && min < b);
  return r ? r[1] : null;
}

export function nextOpening(hours: Hours, now: Now): { day: string; min: number } | null {
  for (let i = 0; i < 8; i++) {
    const day = addDays(now.day, i);
    for (const [a] of rangesFor(hours, day)) {
      if (i > 0 || a > now.min) return { day, min: a };
    }
  }
  return null;
}

function rangesText(r: [string, string][]): string {
  return r.map(([a, b]) => `${a} a ${b}`).join(' y ');
}

/** ["Lun a sáb · 10:00 a 13:00 y 16:00 a 20:00", "Dom · cerrado"] */
export function hoursSummary(hours: Hours): string[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: { from: number; to: number; text: string }[] = [];
  for (const d of order) {
    const r = hours[String(d)] ?? [];
    const text = r.length ? rangesText(r) : 'cerrado';
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.to = d;
    else groups.push({ from: d, to: d, text });
  }
  return groups.map((g) => {
    const a = DAY_SHORT[g.from];
    const name = g.from === g.to ? a : `${a} a ${DAY_SHORT[g.to].toLowerCase()}`;
    return `${name} · ${g.text}`;
  });
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
