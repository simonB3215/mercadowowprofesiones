import { describe, it, expect } from 'vitest';
import { Q } from '../src/engine/rational.js';
import { planLeveling, type LevelRecipe } from '../src/engine/leveling.js';
import { planRoute, rankRequirements } from '../src/engine/route.js';

const rec = (id: number, colors: [number, number, number, number], reagents: Array<[number, number]>, cast: number | null, extra: Partial<LevelRecipe> = {}): LevelRecipe => ({
  id, name: `R${id}`, learnedAt: colors[0], colors, skillUps: 1, availability: 'instructor', trainingCost: 0n,
  reagents: reagents.map(([itemId, quantity]) => ({ itemId, quantity })), castSeconds: cast, ...extra,
});
const prices = (m: Record<number, number>) => (id: number) => (m[id] === undefined ? null : Q.of(m[id]));

describe('Ruta más rápida y más barata', () => {
  // Lenta y barata (30 s, 1 c) frente a rápida y cara (3 s, 10 c); siempre naranja.
  const lenta = rec(1, [1, 50, 60, 70], [[100, 1]], 30);
  const rapida = rec(2, [1, 50, 60, 70], [[101, 1]], 3);
  const price = prices({ 100: 1, 101: 10 });

  it('«barata» elige el menor costo y «rápida» el menor tiempo activo', () => {
    const cheap = planRoute([lenta, rapida], { mode: 'barata', from: 1, to: 11, price, trainerOnly: true });
    const fast = planRoute([lenta, rapida], { mode: 'rapida', from: 1, to: 11, price, trainerOnly: true });
    expect(cheap.plan.steps.map((s) => s.recipe?.id)).toEqual([1]);
    expect(fast.plan.steps.map((s) => s.recipe?.id)).toEqual([2]);
    expect(cheap.plan.activeSeconds!.eq(Q.of(300))).toBe(true);
    expect(fast.plan.activeSeconds!.eq(Q.of(30))).toBe(true);
    expect(fast.plan.total.eq(Q.of(100))).toBe(true);
    expect(fast.plan.certain).toBe(true); // todo naranja: fabricaciones exactas
  });

  it('con presupuesto, la rápida mezcla recetas para caber y nunca lo supera', () => {
    const r = planRoute([lenta, rapida], { mode: 'rapida', from: 1, to: 11, price, trainerOnly: true, budget: Q.of(55) });
    expect(r.withinBudget).toBe(true);
    expect(r.plan.total.cmp(Q.of(55))).toBeLessThanOrEqual(0);
    // 5 rápidas (50 c) + 5 lentas (5 c) = 55 c y 165 s: el óptimo de este caso.
    expect(r.plan.activeSeconds!.toNumber()).toBe(165);
    expect(r.notes.join(' ')).toMatch(/no se garantiza el óptimo/);
  });

  it('presupuesto imposible: lo indica como bloqueo y muestra la más barata', () => {
    const r = planRoute([lenta, rapida], { mode: 'rapida', from: 1, to: 11, price, trainerOnly: true, budget: Q.of(5) });
    expect(r.withinBudget).toBe(false);
    expect(r.blockers[0]).toMatch(/Ni la ruta más barata/);
    expect(r.plan.total.eq(Q.of(10))).toBe(true);
  });

  it('comparada con una búsqueda exhaustiva en un caso pequeño, la heurística cabe y no es más rápida que el óptimo', () => {
    // 6 puntos, 3 recetas con costos y tiempos distintos; presupuestos variados.
    const rs = [rec(1, [1, 20, 25, 30], [[100, 1]], 10), rec(2, [1, 20, 25, 30], [[101, 1]], 4), rec(3, [1, 20, 25, 30], [[102, 1]], 2)];
    const pr = prices({ 100: 1, 101: 4, 102: 9 });
    const cost = [1, 4, 9];
    const time = [10, 4, 2];
    for (const budget of [6, 10, 15, 20, 27, 33, 40, 54]) {
      let opt = Infinity;
      for (let mask = 0; mask < 3 ** 6; mask++) {
        let m = mask, c = 0, t = 0;
        for (let k = 0; k < 6; k++) { const j = m % 3; m = Math.floor(m / 3); c += cost[j]; t += time[j]; }
        if (c <= budget && t < opt) opt = t;
      }
      const r = planRoute(rs, { mode: 'rapida', from: 1, to: 7, price: pr, trainerOnly: true, budget: Q.of(budget) });
      expect(r.plan.total.toNumber()).toBeLessThanOrEqual(budget);
      const t = r.plan.activeSeconds!.toNumber();
      expect(t).toBeGreaterThanOrEqual(opt); // nunca «mejor» que el óptimo (sería un error de cálculo)
      expect(t).toBe(opt); // en este caso coincide con el óptimo (no es una garantía general)
    }
  });

  it('sin tiempo de lanzamiento la receta no se usa en la rápida (no se inventa) y el tramo queda sin datos', () => {
    const sinTiempo = rec(1, [1, 50, 60, 70], [[100, 1]], null);
    const r = planRoute([sinTiempo], { mode: 'rapida', from: 1, to: 5, price: prices({ 100: 1 }), trainerOnly: true });
    expect(r.plan.incomplete).toBe(true);
    expect(r.plan.activeSeconds).toBeNull();
    // La barata sí la usa, pero su tiempo activo es desconocido.
    const b = planRoute([sinTiempo], { mode: 'barata', from: 1, to: 5, price: prices({ 100: 1 }), trainerOnly: true });
    expect(b.plan.incomplete).toBe(false);
    expect(b.plan.activeSeconds).toBeNull();
  });

  it('separa lo esperado de lo garantizado: en amarillo/verde el mínimo es un punto por fabricación', () => {
    const r = rec(1, [1, 1, 3, 5], [[100, 1]], 5); // probabilidades 1, 3/4, 2/4, 1/4
    const plan = planLeveling([r], { from: 1, to: 5, price: prices({ 100: 1 }), trainerOnly: true });
    const st = plan.steps[0];
    expect(st.guaranteedCrafts).toBe(4n);
    expect(st.expectedCrafts!.eq(Q.of(25, 3))).toBe(true);
    expect(st.certain).toBe(false);
    expect(st.minChance!.eq(Q.of(1, 4))).toBe(true);
    expect(st.activeSeconds!.eq(Q.of(125, 3))).toBe(true);
  });

  it('«solo puntos garantizados» no usa amarillo ni verde', () => {
    const r = rec(1, [1, 3, 4, 5], [[100, 1]], 5);
    const plan = planLeveling([r], { from: 1, to: 5, price: prices({ 100: 1 }), trainerOnly: true, chanceModel: 'garantizado' });
    expect(plan.steps.map((s) => [s.from, s.to, s.recipe?.id ?? null])).toEqual([[1, 3, 1], [3, 5, null]]);
    expect(plan.steps[1].reason).toMatch(/naranja/);
  });

  it('las recetas conocidas se pueden usar aunque sean de patrón y no cobran instructor', () => {
    const patron = rec(1, [1, 50, 60, 70], [[100, 1]], 3, { availability: 'otra' });
    const instr = rec(2, [1, 50, 60, 70], [[101, 1]], 3, { trainingCost: 500n });
    const sin = planLeveling([patron, instr], { from: 1, to: 3, price: prices({ 100: 1, 101: 5 }), trainerOnly: true });
    expect(sin.steps[0].recipe!.id).toBe(2);
    expect(sin.trainingCost.eq(Q.of(500))).toBe(true);
    const con = planLeveling([patron, instr], { from: 1, to: 3, price: prices({ 100: 1, 101: 5 }), trainerOnly: true, known: new Set([1, 2]) });
    expect(con.steps[0].recipe!.id).toBe(1);
    expect(con.steps[0].known).toBe(true);
    expect(con.trainingCost.eq(Q.zero)).toBe(true);
  });
});

describe('Requisitos de rango (reglas de Classic, sin verificar en Forever)', () => {
  it('pide Oficial y Experto al cruzar 75 y 150, y comprueba el nivel del personaje', () => {
    const r = rankRequirements(60, 200, 75, 15);
    expect(r.map((x) => [x.rank, x.before, x.satisfied, x.levelOk])).toEqual([['Oficial', 75, false, true], ['Experto', 150, false, false]]);
  });
  it('sin datos del personaje no afirma nada (null)', () => {
    expect(rankRequirements(1, 100, null, null)).toEqual([{ rank: 'Oficial', before: 75, characterLevel: 10, satisfied: null, levelOk: null }]);
  });
  it('por encima del máximo de un rango ya no lo pide', () => {
    expect(rankRequirements(160, 200, 225, 40)).toEqual([]);
  });
});
