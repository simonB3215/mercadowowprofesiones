/** Reutilización de recetas (PB-22): textos y límites, compartidos por servidor e interfaz. */
import { Q } from './rational.js';

/** «5 min», «23 h», «47 h», «4 días». */
export function cooldownLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = seconds / 3600;
  if (h < 72) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} días`;
}

/** Tiempo mínimo para hacer `runs` fabricaciones si cada una espera `seconds` (la primera no espera). */
export function minTimeForRuns(runs: number, seconds: number): number {
  return Math.max(0, runs - 1) * seconds;
}

/** Duración larga legible: «3 h», «2 días y 4 h». */
export function durationLabel(seconds: number): string {
  const h = Math.ceil(seconds / 3600);
  if (h < 24) return seconds < 3600 ? `${Math.ceil(seconds / 60)} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const rest = h % 24;
  return `${d} ${d === 1 ? 'día' : 'días'}${rest ? ` y ${rest} h` : ''}`;
}

/** Fabricaciones al día como máximo en «Transmutaciones» para esperas cortas (nadie fabrica cada 10 min todo el día). */
export const MAX_CRAFTS_PER_DAY = 10;

/**
 * Fabricaciones al día que permite una espera: 24 h ÷ espera, con un máximo (PT-03). Fracción exacta (47 h → 24/47).
 * Sin espera (0) cuenta el máximo; espera desconocida (null) → null.
 */
export function craftsPerDay(seconds: number | null, max = MAX_CRAFTS_PER_DAY): Q | null {
  if (seconds === null || seconds < 0) return null;
  if (seconds === 0) return Q.of(max);
  const n = Q.of(86400, seconds);
  return n.cmp(Q.of(max)) > 0 ? Q.of(max) : n;
}

/** Oro al día = ganancia por fabricación × fabricaciones al día. */
export function goldPerDay(profitPerCraft: Q | null, seconds: number | null, max = MAX_CRAFTS_PER_DAY): Q | null {
  const n = craftsPerDay(seconds, max);
  return profitPerCraft && n ? profitPerCraft.mul(n) : null;
}
