import { describe, it, expect } from 'vitest';
import { Q } from '../src/engine/rational.js';
import { planLeveling, skillUpChance, colorAt, type LevelRecipe } from '../src/engine/leveling.js';

const rec = (id: number, colors: [number, number, number, number], reagents: Array<[number, number]>, extra: Partial<LevelRecipe> = {}): LevelRecipe => ({
  id, name: `R${id}`, learnedAt: colors[0], colors, skillUps: 1, availability: 'instructor', trainingCost: 0n,
  reagents: reagents.map(([itemId, quantity]) => ({ itemId, quantity })), ...extra,
});
const prices = (m: Record<number, number>) => (id: number) => (m[id] === undefined ? null : Q.of(m[id]));

describe('Subida de nivel', () => {
  it('colores y probabilidad: naranja 1, amarillo/verde (gris − s)/(gris − amarillo), gris sin puntos', () => {
    const r = rec(1, [140, 145, 147, 150], [[1, 1]]);
    expect(colorAt(r, 140)).toBe('naranja');
    expect(colorAt(r, 146)).toBe('amarillo');
    expect(colorAt(r, 148)).toBe('verde');
    expect(colorAt(r, 150)).toBe('gris');
    expect(skillUpChance(r, 139)).toBeNull();
    expect(skillUpChance(r, 144)!.eq(Q.one)).toBe(true);
    expect(skillUpChance(r, 147)!.eq(Q.of(3, 5))).toBe(true);
    expect(skillUpChance(r, 150)).toBeNull();
  });

  it('elige la receta más barata por punto y agrupa los niveles en pasos', () => {
    const cara = rec(1, [1, 10, 15, 20], [[100, 1]]); // 50 c por fabricación
    const barata = rec(2, [5, 30, 35, 40], [[101, 1]]); // 10 c, disponible desde 5
    const plan = planLeveling([cara, barata], { from: 1, to: 10, price: prices({ 100: 50, 101: 10 }), trainerOnly: true });
    expect(plan.steps.map((s) => [s.from, s.to, s.recipe?.id])).toEqual([[1, 5, 1], [5, 10, 2]]);
    expect(plan.steps[0].crafts).toBe(4n);
    expect(plan.materialsCost.eq(Q.of(4 * 50 + 5 * 10))).toBe(true);
    expect(plan.incomplete).toBe(false);
  });

  it('en amarillo/verde cuenta las fabricaciones esperadas y redondea hacia arriba para comprar', () => {
    const r = rec(1, [1, 1, 3, 5], [[100, 2]]); // en 1: 4/4, en 2: 3/4, en 3: 2/4, en 4: 1/4
    const plan = planLeveling([r], { from: 1, to: 5, price: prices({ 100: 10 }), trainerOnly: true });
    // 1 + 4/3 + 2 + 4 = 25/3 ≈ 8,33 → 9 fabricaciones
    expect(plan.steps[0].expectedCrafts!.eq(Q.of(25, 3))).toBe(true);
    expect(plan.steps[0].crafts).toBe(9n);
    expect(plan.shopping).toEqual([{ itemId: 100, quantity: 18n, unitPrice: Q.of(10), cost: Q.of(180) }]);
  });

  it('un precio desconocido nunca es 0: sin otra opción, el tramo queda «sin datos» y el plan incompleto', () => {
    const conPrecio = rec(1, [1, 5, 8, 10], [[100, 1]]);
    const sinPrecio = rec(2, [10, 15, 18, 20], [[999, 1]]);
    const plan = planLeveling([conPrecio, sinPrecio], { from: 1, to: 15, price: prices({ 100: 5 }), trainerOnly: true });
    const gap = plan.steps.find((s) => !s.recipe)!;
    expect([gap.from, gap.to]).toEqual([10, 15]);
    expect(gap.reason).toMatch(/ninguna tiene precio/);
    expect(gap.missingItems).toEqual([999]);
    expect(plan.incomplete).toBe(true);
  });

  it('una receta sin materiales nunca se elige como gratis', () => {
    const vacia = rec(1, [1, 20, 25, 30], []);
    const plan = planLeveling([vacia], { from: 1, to: 5, price: () => null, trainerOnly: true });
    expect(plan.steps.map((s) => s.recipe)).toEqual([null]);
  });

  it('las iniciales no suman costo de aprendizaje y entran por defecto', () => {
    const inicial = rec(1, [1, 20, 25, 30], [[100, 1]], { availability: 'inicial', trainingCost: 0n });
    const plan = planLeveling([inicial], { from: 1, to: 5, price: prices({ 100: 3 }), trainerOnly: true });
    expect(plan.steps.map((s) => s.recipe?.id)).toEqual([1]);
    expect(plan.trainingCost.isZero()).toBe(true);
  });

  it('solo instructor e iniciales por defecto; el costo de aprendizaje se suma una vez por receta usada', () => {
    const instructor = rec(1, [1, 20, 25, 30], [[100, 1]], { trainingCost: 500n });
    const patron = rec(2, [1, 20, 25, 30], [[101, 1]], { availability: 'otra' });
    const precio = prices({ 100: 50, 101: 1 });
    const soloInstructor = planLeveling([instructor, patron], { from: 1, to: 10, price: precio, trainerOnly: true });
    expect(soloInstructor.steps.map((s) => s.recipe?.id)).toEqual([1]);
    expect(soloInstructor.trainingCost.eq(Q.of(500))).toBe(true);
    expect(soloInstructor.total.eq(Q.of(9 * 50 + 500))).toBe(true);
    const todas = planLeveling([instructor, patron], { from: 1, to: 10, price: precio, trainerOnly: false });
    expect(todas.steps.map((s) => s.recipe?.id)).toEqual([2]);
    expect(todas.trainingCost.isZero()).toBe(true);
  });

  it('nunca elige recetas con tiempo de reutilización aunque sean las más baratas (p. ej. transmutaciones)', () => {
    const transmutar = rec(1, [1, 20, 25, 30], [[100, 1]], { cooldown: 3600 });
    const normal = rec(2, [1, 20, 25, 30], [[101, 1]]);
    const plan = planLeveling([transmutar, normal], { from: 1, to: 10, price: prices({ 100: 1, 101: 50 }), trainerOnly: true });
    expect(plan.steps.map((s) => s.recipe?.id)).toEqual([2]);
    const soloTransmutar = planLeveling([transmutar], { from: 1, to: 5, price: prices({ 100: 1 }), trainerOnly: false });
    expect(soloTransmutar.steps.map((s) => s.recipe)).toEqual([null]);
  });

  it('rechaza rangos inválidos', () => {
    expect(() => planLeveling([], { from: 10, to: 10, price: () => null, trainerOnly: true })).toThrow();
  });
});
