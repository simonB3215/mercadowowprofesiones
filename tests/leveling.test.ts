import { describe, it, expect } from 'vitest';
import { Q } from '../src/engine/rational.js';
import { planLeveling, skillUpChance, colorAt, alternativesAt, recipePool, type LevelRecipe } from '../src/engine/leveling.js';

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

  it('evitar una receta: el plan usa la siguiente y las alternativas se ordenan por costo por punto', () => {
    const barata = rec(1, [1, 20, 25, 30], [[100, 1]]); // 5 c
    const media = rec(2, [1, 20, 25, 30], [[101, 1]]); // 20 c
    const sinPrecio = rec(3, [1, 20, 25, 30], [[999, 1]]);
    const price = prices({ 100: 5, 101: 20 });
    const normal = planLeveling([barata, media, sinPrecio], { from: 1, to: 10, price, trainerOnly: true });
    expect(normal.steps[0].recipe?.id).toBe(1);
    const sin1 = planLeveling([barata, media, sinPrecio], { from: 1, to: 10, price, trainerOnly: true, exclude: new Set([1]) });
    expect(sin1.steps[0].recipe?.id).toBe(2);
    const pool = recipePool([barata, media, sinPrecio], { trainerOnly: true });
    const alts = alternativesAt(pool, 1, 1, price);
    expect(alts.map((a) => a.recipe.id)).toEqual([2, 3]);
    expect(alts[0].costPerPoint!.eq(Q.of(20))).toBe(true);
    expect(alts[1].costPerPoint).toBeNull(); // sin precio: al final, nunca como gratis
  });

  it('rutas por tramos: no intercala un paso corto si apenas ahorra (como una guía)', () => {
    // A sirve de 15 a 60 (10 c); B, solo de 20 a 26 y algo más barata (9 c). Punto a punto saldrían 3 pasos.
    const a = rec(1, [15, 60, 70, 80], [[100, 1]]);
    const b = rec(2, [20, 25, 30, 35], [[200, 1]]);
    const plan = planLeveling([a, b], { from: 15, to: 60, price: prices({ 100: 1000, 200: 900 }), trainerOnly: true });
    expect(plan.steps.map((s) => [s.from, s.to, s.recipe?.id])).toEqual([[15, 60, 1]]);
  });

  it('rutas por tramos: sí cambia de receta cuando el ahorro compensa', () => {
    const a = rec(1, [15, 60, 70, 80], [[100, 1]]);
    const b = rec(2, [20, 40, 50, 60], [[200, 1]]); // mucho más barata de 20 a 40
    const plan = planLeveling([a, b], { from: 15, to: 60, price: prices({ 100: 1000, 200: 100 }), trainerOnly: true });
    expect(plan.steps.map((s) => s.recipe?.id)).toEqual([1, 2, 1]);
    expect(plan.steps[1].from).toBe(20);
  });

  it('rutas por tramos: nunca más de un 3 % por encima de la mejor ruta punto a punto', () => {
    // A sirve de 1 a 100 (10 c/punto). Cinco recetas cortas (2 niveles cada una) ahorran 4,5 c/punto: agruparlo todo en A
    // costaría un 4,8 % más, así que la ruta tiene que cambiar a ellas aunque salgan pasos cortos.
    const a = rec(1, [1, 100, 110, 120], [[100, 1]]);
    const shorts = [20, 35, 50, 65, 80].map((l, k) => rec(2 + k, [l, l + 2, l + 2, l + 2], [[200, 1]]));
    const price = prices({ 100: 1000, 200: 550 });
    const plan = planLeveling([a, ...shorts], { from: 1, to: 100, price, trainerOnly: true });
    expect(plan.total.toNumber()).toBeLessThanOrEqual(94500 * 1.03);
    expect(plan.steps.filter((s) => s.recipe && s.recipe.id > 1).length).toBe(5);
  });

  it('prioridad: «tiempo» elige la receta más rápida aunque cueste más; por defecto, la más barata', () => {
    const slow = rec(1, [1, 50, 60, 70], [[100, 1]], { castSeconds: 10 });
    const fast = rec(2, [1, 50, 60, 70], [[200, 1]], { castSeconds: 1 });
    const opts = { from: 1, to: 40, price: prices({ 100: 100, 200: 300 }), trainerOnly: true };
    expect(planLeveling([slow, fast], { ...opts, objective: 'tiempo', lambda: 0 }).steps.map((s) => s.recipe?.id)).toEqual([2]);
    expect(planLeveling([slow, fast], opts).steps.map((s) => s.recipe?.id)).toEqual([1]);
  });

  it('el instructor cuenta al elegir: una receta cara de aprender no se usa para unos pocos puntos', () => {
    const a = rec(1, [1, 40, 50, 60], [[100, 1]]);
    const b = rec(2, [10, 40, 50, 60], [[200, 1]], { trainingCost: 100000n });
    const plan = planLeveling([a, b], { from: 1, to: 30, price: prices({ 100: 100, 200: 50 }), trainerOnly: true });
    expect(plan.steps.map((s) => s.recipe?.id)).toEqual([1]);
    expect(plan.trainingCost.isZero()).toBe(true);
  });

  it('usa lo fabricado en pasos anteriores antes de comprar (productos intermedios)', () => {
    // Paso 1: Aceite (fabrica 1 aceite, objeto 500). Paso 2: Elixir, que pide 2 aceites por fabricación.
    const aceite = rec(1, [1, 10, 10, 10], [[100, 2]], { creates: { itemId: 500, quantity: 1 } }); // gris en 10
    const elixir = rec(2, [10, 30, 40, 50], [[500, 2], [101, 1]]);
    const plan = planLeveling([aceite, elixir], { from: 1, to: 20, price: prices({ 100: 1, 101: 1, 500: 20 }), trainerOnly: true });
    expect(plan.steps.map((s) => [s.from, s.to, s.recipe?.id])).toEqual([[1, 10, 1], [10, 20, 2]]);
    const oil = plan.steps[1].materials.find((m) => m.itemId === 500)!;
    expect(oil.quantity).toBe(20n);
    expect(oil.fromSteps).toBe(9n); // los 9 aceites del paso 1
    expect(oil.cost!.eq(Q.of(11 * 20))).toBe(true); // solo se compran 11
    expect(plan.shopping.find((m) => m.itemId === 500)!.quantity).toBe(11n);
    expect(plan.steps[1].cost!.eq(Q.of(11 * 20 + 10))).toBe(true);
  });

  it('rechaza rangos inválidos', () => {
    expect(() => planLeveling([], { from: 10, to: 10, price: () => null, trainerOnly: true })).toThrow();
  });
});
