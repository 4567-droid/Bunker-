// Reglas del negocio sin base de datos (se pueden probar solas).
import { daysBetween } from './time';

// ---------------------------------------------------------------------
// Fidelidad: tarjeta de 10 sellos, el 10.º corte es gratis.
// Doble sello: si vuelve dentro de los 30 días de su último corte, suma 2.
// Los sellos van de 0 a 9; con 9 (tarjeta llena) el próximo corte es gratis.
// ---------------------------------------------------------------------
export interface StampOutcome {
  free: boolean;
  added: number;
  double: boolean;
  newStamps: number;
}

export function nextIsFree(stamps: number, goal: number): boolean {
  return stamps >= goal - 1;
}

export function stampOutcome(opts: {
  stamps: number;
  lastVisitOn: string | null;
  today: string;
  goal: number;
  doubleDays: number;
}): StampOutcome {
  const { stamps, lastVisitOn, today, goal, doubleDays } = opts;
  if (nextIsFree(stamps, goal)) return { free: true, added: 0, double: false, newStamps: 0 };
  const double = !!lastVisitOn && doubleDays > 0 && daysBetween(lastVisitOn, today) <= doubleDays;
  const added = double ? 2 : 1;
  return { free: false, added, double, newStamps: Math.min(goal - 1, stamps + added) };
}

/** Celdas de la tarjeta: los primeros N sellados, la última dice "Gratis" */
export function stampCells(stamps: number, goal: number): { n: number; stamped: boolean; free: boolean }[] {
  const filled = Math.min(stamps, goal - 1);
  return Array.from({ length: goal }, (_, i) => ({
    n: i + 1,
    stamped: i < filled,
    free: i === goal - 1,
  }));
}

// ---------------------------------------------------------------------
// Disponibilidad: horarios donde al menos un barbero está libre
// ---------------------------------------------------------------------
export interface BusyBlock {
  barberId: string;
  start: number;
  end: number;
}

export interface FreeSlot {
  start: number;
  barbers: string[];
}

export function freeSlots(opts: {
  ranges: [number, number][];
  step: number;
  duration: number;
  barberIds: string[];
  busy: BusyBlock[];
  /** no ofrecer horarios antes de este minuto (hoy + anticipación mínima) */
  minStart?: number;
}): FreeSlot[] {
  const { ranges, step, duration, barberIds, busy } = opts;
  const minStart = opts.minStart ?? 0;
  const out: FreeSlot[] = [];
  for (const [open, close] of ranges) {
    for (let t = open; t + duration <= close; t += step) {
      if (t < minStart) continue;
      const free = barberIds.filter(
        (id) => !busy.some((b) => b.barberId === id && t < b.end && t + duration > b.start),
      );
      if (free.length) out.push({ start: t, barbers: free });
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Corrimiento automático: si el barbero viene demorado, los turnos que
// siguen se corren solos sumando la duración de cada servicio.
// ---------------------------------------------------------------------
export interface AgendaItem {
  id: string;
  start: number;
  duration: number;
  status: string;
}

/**
 * @param cuttingEnd minuto (del día) en que termina el corte actual, o null
 * @returns id → nuevo horario, solo para los turnos que se corren
 */
export function projectShift(items: AgendaItem[], cuttingId: string | null, cuttingEnd: number | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!cuttingId || cuttingEnd === null) return out;
  const cutting = items.find((i) => i.id === cuttingId);
  if (!cutting) return out;
  let cursor = cuttingEnd;
  const pending = items
    .filter((i) => i.id !== cuttingId && i.status === 'booked' && i.start >= cutting.start)
    .sort((a, b) => a.start - b.start);
  for (const i of pending) {
    const start = Math.max(i.start, cursor);
    if (start !== i.start) out[i.id] = start;
    cursor = start + i.duration;
  }
  return out;
}

/** Espera estimada de la fila: personas × duración promedio ÷ barberos, redondeado a 5 */
export function queueWait(people: number, avgDuration: number, barbers: number): number {
  if (people <= 0) return 0;
  const raw = (people * avgDuration) / Math.max(1, barbers);
  return Math.max(5, Math.round(raw / 5) * 5);
}
