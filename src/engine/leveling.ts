/**
 * Ruta de subida de nivel de una profesión (PB: «sistema de nivel»), con aritmética exacta.
 *
 * Para cada punto de habilidad s (desde `from` hasta `to − 1`) se elige, entre las recetas que dan puntos
 * en s, la de menor costo esperado por punto:
 *   costo por punto = costo de materiales de una fabricación / (probabilidad × puntos por fabricación)
 * Probabilidad de subir un punto (estimación de la comunidad, no publicada por Blizzard):
 *   - naranja (s < amarillo): 1
 *   - amarillo y verde (amarillo ≤ s < gris): (gris − s) / (gris − amarillo)
 *   - gris (s ≥ gris): 0 (no se usa)
 * Los puntos consecutivos con la misma receta forman un paso. Un precio desconocido nunca cuenta como 0:
 * si ninguna receta disponible tiene todos sus precios, ese tramo queda «sin datos».
 */
import { Q } from './rational.js';

export type SkillColor = 'naranja' | 'amarillo' | 'verde' | 'gris';

export interface LevelRecipe {
  id: number;
  name: string;
  learnedAt: number;
  /** Umbrales [naranja, amarillo, verde, gris]. */
  colors: [number, number, number, number];
  skillUps: number;
  /**
   * Cómo se obtiene: «instructor» (se compra al instructor), «inicial» (se conoce al aprender la profesión)
   * u «otra» (patrón, botín, misión…: no está garantizada).
   */
  availability: 'instructor' | 'inicial' | 'otra';
  /** Costo de aprenderla en el instructor, en cobre (0 si no aplica). */
  trainingCost: bigint;
  reagents: Array<{ itemId: number; quantity: number }>;
}

export interface LevelStep {
  from: number;
  /** Nivel alcanzado al terminar el paso (exclusivo del siguiente). */
  to: number;
  recipe: LevelRecipe | null;
  colorFrom: SkillColor | null;
  colorTo: SkillColor | null;
  /** Fabricaciones esperadas (valor exacto) y redondeadas hacia arriba para comprar. */
  expectedCrafts: Q | null;
  crafts: bigint | null;
  materials: Array<{ itemId: number; quantity: bigint; unitPrice: Q | null; cost: Q | null }>;
  /** Costo de materiales de las fabricaciones redondeadas. */
  cost: Q | null;
  /** Solo en pasos sin receta: por qué. */
  reason: string | null;
  /** Solo en pasos sin receta: materiales sin precio de las recetas que sí darían puntos. */
  missingItems: number[];
}

export interface LevelPlan {
  from: number;
  to: number;
  steps: LevelStep[];
  materialsCost: Q;
  trainingCost: Q;
  total: Q;
  /** Hay tramos sin datos: el total no cubre toda la subida. */
  incomplete: boolean;
  shopping: Array<{ itemId: number; quantity: bigint; unitPrice: Q | null; cost: Q | null }>;
}

export function colorAt(r: LevelRecipe, s: number): SkillColor {
  const [, yellow, green, gray] = r.colors;
  if (s >= gray) return 'gris';
  if (s >= green) return 'verde';
  if (s >= yellow) return 'amarillo';
  return 'naranja';
}

/** Probabilidad (estimada) de ganar un punto al fabricar en el nivel s; null si la receta no da puntos. */
export function skillUpChance(r: LevelRecipe, s: number): Q | null {
  const [orange, yellow, , gray] = r.colors;
  if (s < Math.max(r.learnedAt, orange) || s >= gray) return null;
  if (s < yellow) return Q.one;
  if (gray <= yellow) return Q.one;
  return Q.of(gray - s, gray - yellow);
}

export function craftCost(r: LevelRecipe, price: (itemId: number) => Q | null): Q | null {
  let total = Q.zero;
  for (const g of r.reagents) {
    const p = price(g.itemId);
    if (!p) return null;
    total = total.add(p.mul(g.quantity));
  }
  return total;
}

export function planLeveling(
  recipes: LevelRecipe[],
  opts: { from: number; to: number; price: (itemId: number) => Q | null; trainerOnly: boolean },
): LevelPlan {
  const { from, to, price, trainerOnly } = opts;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to <= from) throw new Error('Rango de niveles inválido.');
  // Sin materiales no hay costo que comparar (p. ej. el propio hechizo de la profesión): nunca cuenta como gratis.
  const pool = recipes.filter((r) => r.reagents.length > 0 && (trainerOnly ? r.availability !== 'otra' : true));
  const costCache = new Map<number, Q | null>();
  const costOf = (r: LevelRecipe) => {
    if (!costCache.has(r.id)) costCache.set(r.id, craftCost(r, price));
    return costCache.get(r.id)!;
  };

  // Elección por punto.
  type Pick = { recipe: LevelRecipe | null; perCraft: Q | null; crafts: Q | null; reason: string | null; missing: number[] };
  const picks: Pick[] = [];
  for (let s = from; s < to; s++) {
    let best: { r: LevelRecipe; perPoint: Q; chance: Q; cost: Q } | null = null;
    let available = 0;
    const missing = new Set<number>();
    for (const r of pool) {
      const chance = skillUpChance(r, s);
      if (!chance) continue;
      available++;
      const cost = costOf(r);
      if (!cost) {
        for (const g of r.reagents) if (!price(g.itemId)) missing.add(g.itemId);
        continue;
      }
      const perPoint = cost.div(chance.mul(r.skillUps));
      // Desempate: menor costo por punto, luego mayor probabilidad, luego id menor (resultado estable).
      if (!best || perPoint.cmp(best.perPoint) < 0 || (perPoint.eq(best.perPoint) && (chance.cmp(best.chance) > 0 || (chance.eq(best.chance) && r.id < best.r.id)))) {
        best = { r, perPoint, chance, cost };
      }
    }
    if (best) {
      picks.push({ recipe: best.r, perCraft: best.cost, crafts: Q.one.div(best.chance.mul(best.r.skillUps)), reason: null, missing: [] });
    } else {
      picks.push({
        recipe: null, perCraft: null, crafts: null, missing: [...missing].sort((a, b) => a - b),
        reason: available
          ? `Hay ${available} receta(s) que dan puntos en este nivel, pero ninguna tiene precio para todos sus materiales.`
          : trainerOnly
            ? 'Ninguna receta del instructor ni inicial da puntos en este nivel (prueba a incluir recetas de patrón).'
            : 'Ninguna receta conocida da puntos en este nivel.',
      });
    }
  }

  // Agrupar puntos consecutivos con la misma receta.
  const steps: LevelStep[] = [];
  let i = 0;
  while (i < picks.length) {
    let j = i + 1;
    while (j < picks.length && picks[j].recipe?.id === picks[i].recipe?.id && (picks[i].recipe || picks[j].reason === picks[i].reason)) j++;
    const p = picks[i];
    const sFrom = from + i;
    const sTo = from + j;
    if (!p.recipe) {
      const missing = [...new Set(picks.slice(i, j).flatMap((x) => x.missing))].sort((a, b) => a - b);
      steps.push({ from: sFrom, to: sTo, recipe: null, colorFrom: null, colorTo: null, expectedCrafts: null, crafts: null, materials: [], cost: null, reason: p.reason, missingItems: missing });
    } else {
      let expected = Q.zero;
      for (let k = i; k < j; k++) expected = expected.add(picks[k].crafts!);
      const crafts = expected.ceil();
      const materials = p.recipe.reagents.map((g) => {
        const unitPrice = price(g.itemId);
        const quantity = BigInt(g.quantity) * crafts;
        return { itemId: g.itemId, quantity, unitPrice, cost: unitPrice ? unitPrice.mul(quantity) : null };
      });
      steps.push({
        from: sFrom, to: sTo, recipe: p.recipe, colorFrom: colorAt(p.recipe, sFrom), colorTo: colorAt(p.recipe, sTo - 1),
        expectedCrafts: expected, crafts, materials, cost: p.perCraft!.mul(crafts), reason: null, missingItems: [],
      });
    }
    i = j;
  }

  // Totales y lista de compra.
  let materialsCost = Q.zero;
  let trainingCost = Q.zero;
  const learned = new Set<number>();
  const shop = new Map<number, { itemId: number; quantity: bigint; unitPrice: Q | null }>();
  for (const st of steps) {
    if (!st.recipe) continue;
    materialsCost = materialsCost.add(st.cost!);
    if (!learned.has(st.recipe.id)) {
      learned.add(st.recipe.id);
      if (st.recipe.availability === 'instructor') trainingCost = trainingCost.add(Q.of(st.recipe.trainingCost));
    }
    for (const m of st.materials) {
      const prev = shop.get(m.itemId);
      shop.set(m.itemId, { itemId: m.itemId, quantity: (prev?.quantity ?? 0n) + m.quantity, unitPrice: m.unitPrice });
    }
  }
  const shopping = [...shop.values()]
    .map((x) => ({ ...x, cost: x.unitPrice ? x.unitPrice.mul(x.quantity) : null }))
    .sort((a, b) => (b.cost && a.cost ? b.cost.cmp(a.cost) : 0));
  return {
    from, to, steps, materialsCost, trainingCost, total: materialsCost.add(trainingCost),
    incomplete: steps.some((s) => !s.recipe), shopping,
  };
}
