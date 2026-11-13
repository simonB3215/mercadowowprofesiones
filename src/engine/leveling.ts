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
  /**
   * Tiempo de reutilización en segundos (p. ej. transmutaciones: 1 h). Una receta con reutilización no sirve para
   * subir nivel repitiéndola, así que nunca se elige. 0 o ausente = sin reutilización conocida.
   */
  cooldown?: number;
  /** Tiempo de lanzamiento en segundos (Wowhead); null o ausente = desconocido (no se inventa). */
  castSeconds?: number | null;
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
  /**
   * Mínimo de fabricaciones si todas dan punto (puntos / puntos por fabricación). Igual a `crafts` cuando todo el paso
   * es naranja (`certain`); en amarillo y verde `expectedCrafts` es una estimación y puede hacer falta más.
   */
  guaranteedCrafts: bigint | null;
  certain: boolean;
  /** Probabilidad más baja del paso (la del último punto). */
  minChance: Q | null;
  /** Tiempo activo esperado: fabricaciones esperadas × tiempo de lanzamiento (null si se desconoce). */
  activeSeconds: Q | null;
  /** La receta ya era conocida por el personaje: no se cobra el instructor. */
  known: boolean;
}

export interface PlanOptions {
  from: number;
  to: number;
  price: (itemId: number) => Q | null;
  /** Solo recetas del instructor e iniciales (además de las de `known`). */
  trainerOnly: boolean;
  /** «costo» (más barata, por defecto) o «tiempo» (más rápida: menor tiempo activo + λ × costo). */
  objective?: 'costo' | 'tiempo';
  /** Segundos que se aceptan por cada cobre ahorrado (solo con «tiempo»; 0 = el costo solo desempata). */
  lambda?: number;
  /**
   * «comunidad»: probabilidad estimada en amarillo y verde (fórmula de la comunidad, no publicada por Blizzard).
   * «garantizado»: solo cuentan los puntos naranja (probabilidad 1); amarillo y verde no se usan.
   */
  chanceModel?: 'comunidad' | 'garantizado';
  /** Recetas (id de hechizo) que el personaje ya conoce: siempre disponibles y sin costo de instructor. */
  known?: Set<number>;
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
  /** Tiempo activo esperado de los tramos con receta (como el costo, no cubre los tramos sin datos); null si alguno no tiene tiempo de lanzamiento. */
  activeSeconds: Q | null;
  /** Todos los pasos con receta son naranja: las fabricaciones son exactas, no estimadas. */
  certain: boolean;
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

export function chanceFor(r: LevelRecipe, s: number, model: PlanOptions['chanceModel'] = 'comunidad'): Q | null {
  const c = skillUpChance(r, s);
  if (!c || model !== 'garantizado') return c;
  // Solo naranja: en amarillo la fórmula puede dar 1 en el primer punto, pero no deja de ser una estimación.
  return colorAt(r, s) === 'naranja' ? c : null;
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

/** Una elección por punto de habilidad: la receta y su probabilidad, o el motivo de no haber ninguna. */
export interface Pick { recipe: LevelRecipe | null; chance: Q | null; reason: string | null; missing: number[] }

/** Recetas utilizables: nunca sin materiales ni con reutilización; patrones solo si se permiten o el personaje los conoce. */
export function recipePool(recipes: LevelRecipe[], opts: { trainerOnly: boolean; known?: Set<number> }): LevelRecipe[] {
  return recipes.filter((r) =>
    r.reagents.length > 0 && !(r.cooldown && r.cooldown > 0) &&
    (!opts.trainerOnly || r.availability !== 'otra' || Boolean(opts.known?.has(r.id))));
}

function validateRange(from: number, to: number) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to <= from) throw new Error('Rango de niveles inválido.');
}

function gapReason(available: number, opts: PlanOptions): string {
  if (available) return `Hay ${available} receta(s) que dan puntos en este nivel, pero ninguna tiene precio para todos sus materiales${opts.objective === 'tiempo' ? ' y tiempo de lanzamiento' : ''}.`;
  if (opts.chanceModel === 'garantizado') return 'Ninguna receta disponible es naranja en este nivel (con «solo puntos garantizados» no se usan amarillo ni verde).';
  return opts.trainerOnly
    ? 'Ninguna receta del instructor ni inicial da puntos en este nivel (prueba a incluir recetas de patrón).'
    : 'Ninguna receta conocida da puntos en este nivel.';
}

export function planLeveling(recipes: LevelRecipe[], opts: PlanOptions): LevelPlan {
  const { from, to, price } = opts;
  validateRange(from, to);
  const pool = recipePool(recipes, opts);
  const costCache = new Map<number, Q | null>();
  const costOf = (r: LevelRecipe) => {
    if (!costCache.has(r.id)) costCache.set(r.id, craftCost(r, price));
    return costCache.get(r.id)!;
  };
  if (opts.objective === 'tiempo') return assemblePlan(from, to, pickByTime(pool, opts, costOf, opts.lambda ?? 0), opts);

  // Más barata: elección exacta por punto.
  const picks: Pick[] = [];
  for (let s = from; s < to; s++) {
    let best: { r: LevelRecipe; perPoint: Q; chance: Q } | null = null;
    let available = 0;
    const missing = new Set<number>();
    for (const r of pool) {
      const chance = chanceFor(r, s, opts.chanceModel);
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
        best = { r, perPoint, chance };
      }
    }
    picks.push(best
      ? { recipe: best.r, chance: best.chance, reason: null, missing: [] }
      : { recipe: null, chance: null, reason: gapReason(available, opts), missing: [...missing].sort((a, b) => a - b) });
  }
  return assemblePlan(from, to, picks, opts);
}

/**
 * Elección por punto que minimiza tiempo + λ × costo (en coma flotante: solo decide la receta; los importes del plan
 * se recalculan con aritmética exacta). Las recetas sin precio o sin tiempo de lanzamiento no se eligen.
 */
export function pickByTime(pool: LevelRecipe[], opts: PlanOptions, costOf: (r: LevelRecipe) => Q | null, lambda: number): Pick[] {
  const picks: Pick[] = [];
  for (let s = opts.from; s < opts.to; s++) {
    let best: { r: LevelRecipe; score: number; c: number; chance: Q } | null = null;
    let available = 0;
    const missing = new Set<number>();
    for (const r of pool) {
      const chance = chanceFor(r, s, opts.chanceModel);
      if (!chance) continue;
      available++;
      const cost = costOf(r);
      if (!cost || r.castSeconds === null || r.castSeconds === undefined) {
        if (!cost) for (const g of r.reagents) if (!opts.price(g.itemId)) missing.add(g.itemId);
        continue;
      }
      const per = 1 / (chance.toNumber() * r.skillUps);
      const c = cost.toNumber() * per;
      const score = r.castSeconds * per + lambda * c;
      const eps = 1e-9 * Math.max(1, Math.abs(score));
      if (!best || score < best.score - eps || (Math.abs(score - best.score) <= eps && (c < best.c || (c === best.c && r.id < best.r.id)))) {
        best = { r, score, c, chance };
      }
    }
    picks.push(best
      ? { recipe: best.r, chance: best.chance, reason: null, missing: [] }
      : { recipe: null, chance: null, reason: gapReason(available, opts), missing: [...missing].sort((a, b) => a - b) });
  }
  return picks;
}

/** Agrupa los puntos consecutivos con la misma receta en pasos y calcula importes, tiempos y lista de compra (exacto). */
export function assemblePlan(from: number, to: number, picks: Pick[], opts: PlanOptions): LevelPlan {
  const { price } = opts;
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
      steps.push({
        from: sFrom, to: sTo, recipe: null, colorFrom: null, colorTo: null, expectedCrafts: null, crafts: null, materials: [], cost: null,
        reason: p.reason, missingItems: missing, guaranteedCrafts: null, certain: false, minChance: null, activeSeconds: null, known: false,
      });
    } else {
      const r = p.recipe;
      let expected = Q.zero;
      let minChance = Q.one;
      for (let k = i; k < j; k++) {
        expected = expected.add(Q.one.div(picks[k].chance!.mul(r.skillUps)));
        if (picks[k].chance!.cmp(minChance) < 0) minChance = picks[k].chance!;
      }
      const crafts = expected.ceil();
      const perCraft = craftCost(r, price)!;
      const materials = r.reagents.map((g) => {
        const unitPrice = price(g.itemId);
        const quantity = BigInt(g.quantity) * crafts;
        return { itemId: g.itemId, quantity, unitPrice, cost: unitPrice ? unitPrice.mul(quantity) : null };
      });
      const cast = r.castSeconds;
      steps.push({
        from: sFrom, to: sTo, recipe: r, colorFrom: colorAt(r, sFrom), colorTo: colorAt(r, sTo - 1),
        expectedCrafts: expected, crafts, materials, cost: perCraft.mul(crafts), reason: null, missingItems: [],
        guaranteedCrafts: Q.of(sTo - sFrom, r.skillUps).ceil(), certain: colorAt(r, sTo - 1) === 'naranja', minChance,
        activeSeconds: cast === null || cast === undefined ? null : expected.mul(Q.parse(String(cast))),
        known: Boolean(opts.known?.has(r.id)),
      });
    }
    i = j;
  }

  // Totales y lista de compra.
  let materialsCost = Q.zero;
  let trainingCost = Q.zero;
  let activeSeconds: Q | null = Q.zero;
  const learned = new Set<number>();
  const shop = new Map<number, { itemId: number; quantity: bigint; unitPrice: Q | null }>();
  for (const st of steps) {
    if (!st.recipe) continue;
    materialsCost = materialsCost.add(st.cost!);
    activeSeconds = activeSeconds && st.activeSeconds ? activeSeconds.add(st.activeSeconds) : null;
    if (!learned.has(st.recipe.id)) {
      learned.add(st.recipe.id);
      if (st.recipe.availability === 'instructor' && !st.known) trainingCost = trainingCost.add(Q.of(st.recipe.trainingCost));
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
    incomplete: steps.some((s) => !s.recipe), shopping, activeSeconds: steps.some((s) => s.recipe) ? activeSeconds : null,
    certain: steps.every((s) => !s.recipe || s.certain),
  };
}
