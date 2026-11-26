import { describe, it, expect } from 'vitest';
import { Q } from '../src/engine/rational.js';
import { evaluateTimeline, sellTiers, annivReferencePrices, medianQ, daysBetween, type TimelineDay, type TimelineInput } from '../src/engine/timeline.js';

const G = 10000n; // 1 oro en cobre
/** Historial de n días seguidos que acaban el 2026-11-26, con el valor de mercado en oro de cada día. */
function hist(golds: number[], qty: (i: number) => number | null = () => 100): TimelineDay[] {
  const end = Date.parse('2026-11-26T00:00:00Z');
  return golds.map((g, i) => ({
    day: new Date(end - (golds.length - 1 - i) * 86400000).toISOString().slice(0, 10),
    marketValue: BigInt(Math.round(g * 10000)), minBuyout: BigInt(Math.round(g * 9000)), quantity: qty(i),
  }));
}
const base = (over: Partial<TimelineInput> = {}): TimelineInput => ({
  history: hist([30, 28, 20, 12, 10, 10.2, 9.9, 10, 10.1, 10]),
  current: { marketValue: 10n * G, minBuyout: 9n * G, quantity: 80, auctions: 12 },
  region: { soldPerDay: 40, saleRate: 0.4, avgSalePrice: 11n * G, historical: 12n * G },
  references: [],
  vendorCap: null,
  ...over,
});

describe('Línea de tiempo: motor', () => {
  it('piso de 7 días, pico, caída y tendencia estable → Comprar', () => {
    const r = evaluateTimeline(base());
    expect(r.priceToday!.eq(Q.of(10n * G))).toBe(true);
    expect(r.floor7!.eq(Q.of(99000n))).toBe(true); // 9,9 o es el mínimo de los últimos 7 días
    expect(r.peak!.eq(Q.of(30n * G))).toBe(true);
    expect(r.dropFromPeak).toBeCloseTo(2 / 3, 5);
    expect(Math.abs(r.trend7!)).toBeLessThan(0.1);
    expect(r.volatility7!).toBeGreaterThan(0);
    expect(r.supplyTrend).toBeCloseTo(-0.2, 5); // 80 hoy frente a 100 hace una semana
    // 30 piso + 20 estable + 20 caída ≥ 60 % + 15 demanda + 5 tasa + 10 oferta = 100
    expect(r.score).toBe(100);
    expect(r.verdict).toBe('comprar');
    expect(r.reasons.map((x) => x.text)).toContain('Bajó {p} % desde su pico.');
  });

  it('tendencia fuertemente negativa → Esperar (todavía cae), con ese motivo primero', () => {
    const r = evaluateTimeline(base({ history: hist([40, 38, 36, 34, 30, 26, 22, 18, 15, 12]), current: { marketValue: 12n * G, minBuyout: null, quantity: null, auctions: 5 }, region: { soldPerDay: 1, saleRate: 0.1, avgSalePrice: 13n * G, historical: null } }));
    expect(r.trend7!).toBeLessThan(-0.1);
    expect(r.score!).toBeLessThan(50);
    expect(r.verdict).toBe('esperar');
    expect(r.reasons[0].text).toMatch(/^Sigue cayendo/);
  });

  it('techo de vendedor: potencial = techo ÷ hoy, y si deja menos de ×2 penaliza', () => {
    const cap = 50n * G;
    const ok = evaluateTimeline(base({ vendorCap: cap }));
    expect(ok.potentialCap).toBeCloseTo(5, 5);
    expect(ok.potential).toBeCloseTo(5, 5);
    expect(ok.reasons.find((x) => x.text.startsWith('Techo de'))!.vars).toEqual({ g: '50 o', x: '5' });
    const tight = evaluateTimeline(base({ vendorCap: 15n * G }));
    expect(tight.potentialCap).toBeCloseTo(1.5, 5);
    expect(tight.score).toBe(100 - 20);
    expect(tight.reasons[0].text).toMatch(/^Techo de/);
  });

  it('precio local inflado: usa el promedio regional y penaliza', () => {
    const r = evaluateTimeline(base({ current: { marketValue: 40n * G, minBuyout: null, quantity: 80, auctions: 3 } }));
    expect(r.inflated).toBe(true);
    expect(r.priceToday!.eq(Q.of(11n * G))).toBe(true);
    expect(r.reasons[0].text).toMatch(/^Precio local inflado/);
  });

  it('una sola publicación penaliza; sin ventas regionales nunca es «Comprar»', () => {
    const one = evaluateTimeline(base({ current: { marketValue: 10n * G, minBuyout: null, quantity: 3, auctions: 1 } }));
    expect(one.reasons.map((x) => x.text)).toContain('Una sola publicación: el precio es dudoso.');
    const noSales = evaluateTimeline(base({ region: null }));
    expect(noSales.soldPerDay).toBeNull();
    expect(noSales.verdict).toBe('vigilar');
    expect(noSales.score).toBe(69); // la puntuación sigue al veredicto
  });

  it('sin datos: menos de 7 días o sin precio, nunca como 0', () => {
    const short = evaluateTimeline(base({ history: hist([10, 10, 10]) }));
    expect(short.verdict).toBe('sin_datos');
    expect(short.score).toBeNull();
    expect(short.trend7).toBeNull();
    const none = evaluateTimeline(base({ history: [], current: null, region: null }));
    expect(none.verdict).toBe('sin_datos');
    expect(none.priceToday).toBeNull();
    expect(none.floor7).toBeNull();
    expect(none.peak).toBeNull();
    expect(none.potential).toBeNull();
    expect(none.reasons[0].text).toBe('Sin precio en esta casa de subastas.');
  });

  it('referencias de Anniversary: mediana de las fases 2 y 3; si no hay, la fase más cercana; Era nunca', () => {
    const ref = (day: number | null, g: number, economy = 'anniversary') => ({ economy, day, price: BigInt(g) * G });
    expect(annivReferencePrices([ref(41, 60), ref(106, 92), ref(115, 375), ref(326, 197), ref(null, 18, 'era')]).map((x) => Number(x.n / G))).toEqual([92, 375]);
    expect(annivReferencePrices([ref(27, 12), ref(287, 100)]).map((x) => Number(x.n / G))).toEqual([12]);
    expect(annivReferencePrices([ref(null, 18, 'era')])).toEqual([]);
    expect(medianQ([Q.of(1), Q.of(3)])!.eq(Q.of(2))).toBe(true);
    const r = evaluateTimeline(base({ references: [ref(106, 92), ref(115, 375), ref(59, 200)], vendorCap: 50n * G }));
    expect(r.annivMedian!.eq(Q.of(200n * G))).toBe(true);
    expect(r.potentialAnniv).toBeCloseTo(20, 5);
    expect(r.potential).toBeCloseTo(5, 5); // el menor entre Anniversary (×20) y el techo (×5)
  });

  it('tramos de venta recortados al techo y al pico; se eliminan los que no suben', () => {
    const buy = Q.of(10n * G);
    const free = sellTiers(buy, { peak: Q.of(100n * G), annivRef: null, cap: null, commission: Q.parse('0.05') });
    expect(free.map((t) => Number(t.price.n / G))).toEqual([20, 30, 50]);
    expect(free[0].share.eq(Q.of(1, 3))).toBe(true);
    expect(free[0].netGain!.eq(Q.of(20n * G).mul(Q.parse('0.95')).sub(buy))).toBe(true);
    const capped = sellTiers(buy, { peak: Q.of(100n * G), annivRef: null, cap: Q.of(25n * G) });
    expect(capped.map((t) => [Number(t.price.n / G), t.clippedBy])).toEqual([[20, null], [25, 'techo']]);
    expect(capped[0].share.eq(Q.of(1, 2))).toBe(true);
    const byPeak = sellTiers(buy, { peak: Q.of(15n * G), annivRef: Q.of(40n * G), cap: null });
    expect(byPeak.map((t) => [Number(t.price.n / G), t.clippedBy])).toEqual([[20, null], [30, null], [40, 'referencia']]);
    expect(sellTiers(buy, { peak: Q.of(10n * G), annivRef: null, cap: null })).toEqual([]);
    expect(sellTiers(null, { peak: null, annivRef: null, cap: null })).toEqual([]);
  });

  it('hierbas, minerales y pieles comunes penalizan; por debajo de 1 o como mucho «Vigilar»', () => {
    const gathered = evaluateTimeline(base({ commonGathered: true }));
    expect(gathered.score).toBe(85);
    expect(gathered.reasons.map((x) => x.text).some((x) => x.startsWith('Hierba, mineral o piel común'))).toBe(true);
    const cheap = evaluateTimeline(base({ history: hist([0.3, 0.28, 0.2, 0.12, 0.1, 0.102, 0.099, 0.1, 0.101, 0.1]), current: { marketValue: 1000n, minBuyout: null, quantity: 80, auctions: 12 }, region: { soldPerDay: 40, saleRate: 0.4, avgSalePrice: 1100n, historical: null } }));
    expect(cheap.verdict).toBe('vigilar');
    expect(cheap.score).toBe(69);
    expect(cheap.reasons.map((x) => x.text)).toContain('Vale menos de 1 o: aunque suba, deja poco oro por hueco de bolsa.');
  });

  it('días desde el lanzamiento', () => {
    expect(daysBetween('2024-11-21', '2024-12-12')).toBe(21);
    expect(daysBetween('2026-11-04', '2026-12-09')).toBe(35);
    expect(daysBetween('2026-11-04', '2027-03-20')).toBe(136);
  });
});
