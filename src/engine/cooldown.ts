/** Reutilización de recetas (PB-22): textos y límites, compartidos por servidor e interfaz. */

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
