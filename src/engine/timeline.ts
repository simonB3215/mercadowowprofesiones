/**
 * «Línea de tiempo» (D36): ¿conviene comprar un material hoy para venderlo cuando abran las raids?
 * Motor puro (sin base de datos). Importes en cobre como Q (racional exacto); los cocientes (tendencias,
 * potenciales) son números porque no son importes. Un dato ausente es null, nunca 0.
 */
import { Q } from './rational.js';

export interface TimelineDay { day: string; marketValue: bigint | null; minBuyout: bigint | null; quantity: number | null }
export interface TimelineRef { economy: string; day: number | null; price: bigint; min?: bigint | null; max?: bigint | null }
export interface TimelineInput {
  /** Historial diario de la casa (cualquier orden; se ordena por día). */
  history: TimelineDay[];
  /** Foto actual de la casa. */
  current: { marketValue: bigint | null; minBuyout: bigint | null; quantity: number | null; auctions: number | null } | null;
  /** Estadística regional de TSM. */
  region: { soldPerDay: number | null; saleRate: number | null; avgSalePrice: bigint | null; historical: bigint | null } | null;
  /** Referencias de otras economías (Anniversary por días desde su lanzamiento; Era sin día). */
  references: TimelineRef[];
  /** Techo de vendedor en cobre (null si no lo hay). */
  vendorCap: bigint | null;
  /** Ventana de Anniversary que se usa para el potencial: de la fase 2 (incluida) a la 4 (excluida), en días. */
  annivWindow?: { from: number; to: number };
  /** Comisión de la casa de subastas (para la ganancia neta de cada tramo). */
  commission?: Q;
  /** Hierba, mineral o piel de calidad común: en Forever su oferta crece con el tiempo (D36). */
  commonGathered?: boolean;
}

export type TimelineVerdict = 'comprar' | 'vigilar' | 'esperar' | 'no_conviene' | 'sin_datos';
/** Motivo en frase corta: plantilla en español con variables (se traduce en la web con t()). */
export interface Reason { text: string; vars?: Record<string, string | number> }
export interface SellTier { multiple: number; price: Q; share: Q; netGain: Q | null; clippedBy: 'techo' | 'pico' | 'referencia' | null }

export interface TimelineResult {
  verdict: TimelineVerdict;
  score: number | null;
  priceToday: Q | null;
  /** El precio de hoy salió del promedio regional porque el local está inflado. */
  inflated: boolean;
  floor7: Q | null;
  peak: Q | null;
  dropFromPeak: number | null;
  trend7: number | null;
  volatility7: number | null;
  supplyToday: number | null;
  supplyTrend: number | null;
  soldPerDay: number | null;
  saleRate: number | null;
  annivMedian: Q | null;
  potentialAnniv: number | null;
  potentialCap: number | null;
  potential: number | null;
  vendorCap: Q | null;
  daysWithData: number;
  daysSinceLow: number | null;
  reasons: Reason[];
}

export const INFLATED_RATIO = Q.parse('1.6');
export const MIN_DAYS = 7;
export const DEFAULT_ANNIV_WINDOW = { from: 49, to: 161 };
/** Por debajo de 1 o por unidad, guardarlo deja muy poco oro por hueco de bolsa: como mucho «Vigilar» (D36). */
export const MIN_STOCK_PRICE = Q.of(10000n);
const DAY_MS = 86400000;

const q = (v: bigint) => Q.of(v);
const ratio = (a: Q, b: Q) => (b.isZero() ? null : a.div(b).toNumber());
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (x: number) => Math.round(x * 10) / 10;
const pctTxt = (x: number) => Math.round(Math.abs(x) * 100);
/** Factor con un decimal, coma decimal (la web lo pasa al idioma). */
export const factor = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
const goldTxt = (v: Q) => {
  const g = v.div(10000n);
  return `${g.isInteger() ? g.n.toString() : g.toDecimal(2).replace('.', ',')} o`;
};

/** Mediana exacta (media de las dos centrales si el número es par). */
export function medianQ(xs: Q[]): Q | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a.cmp(b));
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : s[m - 1].add(s[m]).div(2);
}

/**
 * Referencias de Anniversary dentro de la ventana (fases 2 y 3); si no hay ninguna, las de la fase más cercana
 * con datos (las más próximas a la ventana en días). Las de Era (sin día) nunca entran: son una economía madura.
 */
export function annivReferencePrices(refs: TimelineRef[], win = DEFAULT_ANNIV_WINDOW): Q[] {
  const a = refs.filter((r) => r.economy === 'anniversary' && r.day !== null);
  const inside = a.filter((r) => r.day! >= win.from && r.day! < win.to);
  if (inside.length) return inside.map((r) => q(r.price));
  if (!a.length) return [];
  const dist = (d: number) => (d < win.from ? win.from - d : d - (win.to - 1));
  const best = Math.min(...a.map((r) => dist(r.day!)));
  // «La fase más cercana»: antes de la ventana es la fase 1; después, lo posterior a la fase 3.
  const side = a.find((r) => dist(r.day!) === best)!.day! < win.from ? 'antes' : 'despues';
  return a.filter((r) => (side === 'antes' ? r.day! < win.from : r.day! >= win.to)).map((r) => q(r.price));
}

export function evaluateTimeline(inp: TimelineInput): TimelineResult {
  const reasons: Reason[] = [];
  const days = inp.history.filter((d) => d.marketValue !== null).sort((a, b) => a.day.localeCompare(b.day));
  const cap = inp.vendorCap !== null ? q(inp.vendorCap) : null;
  const soldPerDay = inp.region?.soldPerDay ?? null;
  const saleRate = inp.region?.saleRate ?? null;

  // Precio de hoy: valor de mercado actual (o el del último día con datos); si es más de 1,6 × el promedio regional, el regional.
  const raw = inp.current?.marketValue ?? days[days.length - 1]?.marketValue ?? null;
  let priceToday = raw !== null ? q(raw) : null;
  let inflated = false;
  const avg = inp.region?.avgSalePrice ?? null;
  if (priceToday && avg !== null && avg > 0n && priceToday.cmp(q(avg).mul(INFLATED_RATIO)) > 0) {
    inflated = true;
    reasons.push({ text: 'Precio local inflado frente a la región (×{x} el promedio regional de venta): se calcula con el regional.', vars: { x: factor(priceToday.div(q(avg)).toNumber()) } });
    priceToday = q(avg);
  }

  const vals = days.map((d) => q(d.marketValue!));
  const last7 = vals.slice(-7);
  const floor7 = last7.length ? last7.reduce((a, b) => (b.cmp(a) < 0 ? b : a)) : null;
  const peak = vals.length ? vals.reduce((a, b) => (b.cmp(a) > 0 ? b : a)) : null;
  const dropFromPeak = priceToday && peak && !peak.isZero() ? 1 - priceToday.div(peak).toNumber() : null;

  let trend7: number | null = null;
  let volatility7: number | null = null;
  if (last7.length >= 6) {
    const n = last7.map((v) => v.toNumber());
    const a = mean(n.slice(0, 3)), b = mean(n.slice(-3));
    trend7 = a > 0 ? (b - a) / a : null;
    const m = mean(n);
    volatility7 = m > 0 ? Math.sqrt(mean(n.map((x) => (x - m) ** 2))) / m : null;
  }

  // Oferta: unidades en venta hoy frente a las de hace 7 días (o el primer día de la ventana).
  const qtyDays = days.filter((d) => d.quantity !== null);
  const supplyToday = inp.current?.quantity ?? qtyDays[qtyDays.length - 1]?.quantity ?? null;
  let supplyTrend: number | null = null;
  if (supplyToday !== null && qtyDays.length >= 2) {
    const lastDay = Date.parse(qtyDays[qtyDays.length - 1].day);
    const before = [...qtyDays].reverse().find((d) => lastDay - Date.parse(d.day) >= 7 * DAY_MS) ?? qtyDays[Math.max(0, qtyDays.length - 7)];
    if (before.quantity && before.quantity > 0 && before !== qtyDays[qtyDays.length - 1]) supplyTrend = supplyToday / before.quantity - 1;
  }

  // Días desde el mínimo de todo el historial.
  let daysSinceLow: number | null = null;
  if (days.length >= 2) {
    let lo = 0;
    vals.forEach((v, i) => { if (v.cmp(vals[lo]) <= 0) lo = i; });
    daysSinceLow = Math.round((Date.parse(days[days.length - 1].day) - Date.parse(days[lo].day)) / DAY_MS);
  }

  const refPrices = annivReferencePrices(inp.references, inp.annivWindow);
  const annivMedian = medianQ(refPrices);
  const potentialAnniv = annivMedian && priceToday ? ratio(annivMedian, priceToday) : null;
  const potentialCap = cap && priceToday ? ratio(cap, priceToday) : null;
  const pots = [potentialAnniv, potentialCap].filter((x): x is number => x !== null);
  const potential = pots.length ? Math.min(...pots) : null;

  const base = {
    priceToday, inflated, floor7, peak, dropFromPeak, trend7, volatility7, supplyToday, supplyTrend, soldPerDay, saleRate,
    annivMedian, potentialAnniv, potentialCap, potential, vendorCap: cap, daysWithData: days.length, daysSinceLow,
  };

  if (!priceToday || days.length < MIN_DAYS) {
    reasons.unshift(!priceToday
      ? { text: 'Sin precio en esta casa de subastas.' }
      : { text: 'Solo {n} días con datos: hacen falta al menos {m} para ver si ya tocó fondo.', vars: { n: days.length, m: MIN_DAYS } });
    return { ...base, verdict: 'sin_datos', score: null, reasons };
  }

  let score = 0;
  // Cerca del piso de 7 días. Si sigue cayendo con fuerza, hoy siempre es «el piso»: no suma (ajuste de D36).
  const falling = trend7 !== null && trend7 < -0.1;
  if (floor7 && !falling && priceToday.cmp(floor7.mul(Q.parse('1.1'))) <= 0) { score += 30; reasons.push({ text: 'Está en su piso de 7 días.' }); }
  else if (floor7 && !falling && priceToday.cmp(floor7.mul(Q.parse('1.25'))) <= 0) { score += 15; reasons.push({ text: 'Está cerca de su piso de 7 días.' }); }
  else if (floor7 && priceToday.cmp(floor7) > 0) reasons.push({ text: 'Está {p} % por encima de su piso de 7 días.', vars: { p: pctTxt(priceToday.div(floor7).toNumber() - 1) } });
  // Estabilizado.
  if (trend7 !== null) {
    if (Math.abs(trend7) <= 0.1) {
      score += 20;
      reasons.push(daysSinceLow !== null && daysSinceLow >= 3
        ? { text: 'Lleva {n} días sin bajar de su mínimo.', vars: { n: daysSinceLow } }
        : { text: 'Precio estable en los últimos 7 días.' });
    } else if (trend7 > 0.1) { score += 10; reasons.push({ text: 'Subió {p} % en 7 días: ya empezó a recuperarse.', vars: { p: pctTxt(trend7) } }); }
    else reasons.push({ text: 'Sigue cayendo: bajó {p} % en 7 días, todavía no es el piso.', vars: { p: pctTxt(trend7) } });
  }
  // Caída desde el pico.
  if (dropFromPeak !== null && dropFromPeak >= 0.6) { score += 20; reasons.push({ text: 'Bajó {p} % desde su pico.', vars: { p: pctTxt(dropFromPeak) } }); }
  else if (dropFromPeak !== null && dropFromPeak >= 0.3) { score += 10; reasons.push({ text: 'Bajó {p} % desde su pico.', vars: { p: pctTxt(dropFromPeak) } }); }
  // Demanda regional.
  if (soldPerDay === null || soldPerDay <= 0) reasons.push({ text: 'Sin ventas en la región: no habrá a quién vendérselo después.' });
  else {
    if (soldPerDay >= 20) { score += 15; reasons.push({ text: 'Se venden {n} al día en la región.', vars: { n: r1(soldPerDay) } }); }
    else if (soldPerDay >= 5) { score += 8; reasons.push({ text: 'Se venden {n} al día en la región.', vars: { n: r1(soldPerDay) } }); }
    else reasons.push({ text: 'Se venden pocas en la región ({n} al día).', vars: { n: r1(soldPerDay) } });
    if (saleRate !== null && saleRate >= 0.3) score += 5;
  }
  // Oferta.
  if (supplyTrend !== null && supplyTrend < 0) { score += 10; reasons.push({ text: 'Hay {p} % menos unidades en venta que hace una semana.', vars: { p: pctTxt(supplyTrend) } }); }
  else if (supplyTrend !== null && supplyTrend > 0.5) {
    score -= 10;
    reasons.push(trend7 !== null && trend7 < 0
      ? { text: 'Oferta creciente: {p} % más unidades en venta mientras el precio baja; entra más de lo que se consume.', vars: { p: pctTxt(supplyTrend) } }
      : { text: 'Hay {p} % más unidades en venta que hace una semana.', vars: { p: pctTxt(supplyTrend) } });
  }
  // Potencial.
  if (cap && potentialCap !== null) {
    reasons.push({ text: 'Techo de {g} del vendedor: puede subir como mucho ×{x}.', vars: { g: goldTxt(cap), x: factor(potentialCap) } });
    if (potentialCap < 2) score -= 20;
  }
  if (annivMedian && potentialAnniv !== null) reasons.push({ text: 'En Anniversary llegó a {g} (mediana de las citas): ×{x} sobre hoy.', vars: { g: goldTxt(annivMedian), x: factor(potentialAnniv) } });
  if (potential !== null && potential >= 3) score += 10;
  // Penalizaciones.
  if (inflated) score -= 15;
  if (inp.commonGathered) {
    score -= 15;
    reasons.push({ text: 'Hierba, mineral o piel común: en Forever entra cada vez más (semillas, Invernadero, Jardín de rocas) y tiende a abaratarse.' });
  }
  if (inp.current?.auctions === 1) { score -= 10; reasons.push({ text: 'Una sola publicación: el precio es dudoso.' }); }
  else if (inp.current?.quantity !== null && inp.current?.quantity !== undefined && inp.current.quantity < 5) reasons.push({ text: 'Muy pocas unidades en venta: el precio es dudoso.' });

  score = Math.max(0, Math.min(100, score));
  let verdict: TimelineVerdict = score >= 70 ? 'comprar' : score >= 50 ? 'vigilar' : trend7 !== null && trend7 < -0.1 ? 'esperar' : 'no_conviene';
  // Sin ventas en la región no hay a quién vendérselo: como mucho «Vigilar».
  if (verdict === 'comprar' && (soldPerDay === null || soldPerDay <= 0)) { verdict = 'vigilar'; score = 69; }
  // Muy barato: aunque suba, deja poco oro por hueco de bolsa.
  if (priceToday.cmp(MIN_STOCK_PRICE) < 0) {
    if (verdict === 'comprar') { verdict = 'vigilar'; score = 69; } // la puntuación sigue al veredicto
    reasons.push({ text: 'Vale menos de 1 o: aunque suba, deja poco oro por hueco de bolsa.' });
  }
  // El primer motivo es el que más pesa para el veredicto.
  if (verdict === 'esperar') {
    const i = reasons.findIndex((r) => r.text.startsWith('Sigue cayendo'));
    if (i > 0) reasons.unshift(...reasons.splice(i, 1));
  }
  if (cap && potentialCap !== null && potentialCap < 2) {
    const i = reasons.findIndex((r) => r.text.startsWith('Techo de'));
    if (i > 0) reasons.unshift(...reasons.splice(i, 1));
  }
  return { ...base, verdict, score, reasons };
}

/**
 * Tramos de venta: ×2, ×3 y ×5 sobre el precio de compra. Cada uno se recorta al techo de vendedor y al pico
 * (o a la referencia de Anniversary si es mayor que el pico). Un tramo que no supera al anterior (ni a la compra) se elimina.
 * Reparto: partes iguales entre los tramos que quedan (un tercio cada uno si quedan los tres).
 */
export function sellTiers(buy: Q | null, opts: { peak: Q | null; annivRef: Q | null; cap: Q | null; commission?: Q }): SellTier[] {
  if (!buy || buy.sign() <= 0) return [];
  let limit: Q | null = null;
  let limitBy: 'pico' | 'referencia' | null = null;
  if (opts.peak) { limit = opts.peak; limitBy = 'pico'; }
  if (opts.annivRef && (!limit || opts.annivRef.cmp(limit) > 0)) { limit = opts.annivRef; limitBy = 'referencia'; }
  const out: Array<Omit<SellTier, 'share' | 'netGain'>> = [];
  let prev = buy;
  for (const m of [2, 3, 5]) {
    let price = buy.mul(m);
    let clippedBy: SellTier['clippedBy'] = null;
    if (limit && price.cmp(limit) > 0) { price = limit; clippedBy = limitBy; }
    if (opts.cap && price.cmp(opts.cap) > 0) { price = opts.cap; clippedBy = 'techo'; }
    if (price.cmp(prev) <= 0) continue;
    out.push({ multiple: m, price, clippedBy });
    prev = price;
  }
  const share = out.length ? Q.of(1, out.length) : Q.zero;
  const keep = opts.commission ? Q.one.sub(opts.commission) : null;
  return out.map((t) => ({ ...t, share, netGain: keep ? t.price.mul(keep).sub(buy) : null }));
}

/** Días enteros entre dos fechas AAAA-MM-DD (UTC). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
