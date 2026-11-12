import { Q, COPPER_PER_GOLD } from './rational.js';

/** Formatea cobre como "12 o 34 p 56 c". Si no es entero, indica que es aproximado. */
export function formatMoney(v: Q | null | undefined): string {
  if (!v) return '—';
  const neg = v.sign() < 0;
  const a = neg ? v.neg() : v;
  const whole = a.floor();
  const g = whole / COPPER_PER_GOLD;
  const s = (whole % COPPER_PER_GOLD) / 100n;
  const c = whole % 100n;
  const parts: string[] = [];
  if (g) parts.push(`${g.toLocaleString('es-ES')} o`);
  if (s || (g && c)) parts.push(`${s} p`);
  if (c || !parts.length) parts.push(`${c} c`);
  const exact = a.isInteger();
  return `${neg ? '−' : ''}${exact ? '' : '≈ '}${parts.join(' ')}`;
}

/** Valor exacto en oro como fracción o decimal finito. */
export function exactGold(v: Q | null | undefined): string {
  if (!v) return '—';
  const g = v.div(COPPER_PER_GOLD);
  if (g.isTerminating()) return `${g.toDecimal(8)} o`;
  return `${g.toFraction()} o (≈ ${g.toDecimal(4)})`;
}

export function formatPct(v: Q | null | undefined): string {
  if (!v) return '—';
  if (v.isTerminating()) return `${v.toDecimal(4)} %`;
  return `≈ ${v.toDecimal(2)} % (exacto ${v.toFraction()} %)`;
}

export function parseGoldInput(s: string): Q | null {
  const t = s.trim();
  if (!t) return null;
  return Q.parse(t).mul(COPPER_PER_GOLD);
}
