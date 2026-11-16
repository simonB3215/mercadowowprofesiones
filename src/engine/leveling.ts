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
 * Rutas tipo guía: en vez de cambiar de receta en cada punto, se reparte la subida en TRAMOS con una sola receta
 * (programación dinámica sobre los puntos). Cada tramo paga su costo esperado, el instructor de la receta y una
 * pequeña penalización por cambiar de receta (proporcional al costo de la ruta), así que solo se cambia cuando
 * compensa de verdad. Los productos fabricados en un tramo se usan en los siguientes antes de comprar (p. ej. el
 * Aceite de Fuego para el Elixir de poder de fuego). Un precio desconocido nunca cuenta como 0: si ninguna receta
 * disponible tiene todos sus precios, ese tramo queda «sin datos».
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
  /** Objeto que fabrica y cantidad mínima por fabricación (para reutilizarlo en pasos posteriores). */
  creates?: { itemId: number; quantity: number } | null;
  /**
   * Solo para recetas de patrón que cubren huecos del instructor: niveles [desde, hasta) en los que se puede usar.
   * Fuera de ellos no da puntos para la ruta (ahí el instructor ya enseña algo).
   */
  onlyAt?: Array<[number, number]>;
}

/** Material de un paso: cantidad total, la parte que sale de pasos anteriores y el costo de lo que hay que comprar. */
export interface StepMaterial { itemId: number; quantity: bigint; fromSteps: bigint; unitPrice: Q | null; cost: Q | null }

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
  materials: StepMaterial[];
  /** Costo de los materiales que hay que comprar (lo fabricado en pasos anteriores no se vuelve a pagar). */
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
  /** Recetas (id de hechizo) que el usuario no quiere usar: se buscan otras para esos niveles. */
  exclude?: Set<number>;
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
  if (r.onlyAt && !r.onlyAt.some(([a, b]) => s >= a && s < b)) return null;
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
export function recipePool(recipes: LevelRecipe[], opts: { trainerOnly: boolean; known?: Set<number>; exclude?: Set<number> }): LevelRecipe[] {
  return recipes.filter((r) =>
    r.reagents.length > 0 && !(r.cooldown && r.cooldown > 0) && !opts.exclude?.has(r.id) &&
    (!opts.trainerOnly || r.availability !== 'otra' || Boolean(opts.known?.has(r.id))));
}

export interface Alternative { recipe: LevelRecipe; chance: Q; costPerPoint: Q | null; color: SkillColor }

/**
 * Otras recetas que dan puntos en el nivel `s` (para ofrecer un cambio en un paso): costo esperado por punto
 * = costo de una fabricación ÷ (probabilidad × puntos por fabricación). Primero las que tienen precio, de más barata
 * a más cara; las que no tienen precio al final (nunca cuentan como gratis).
 */
/** Costo esperado de un punto con la receta en el nivel `s` (null si no da puntos o le falta algún precio). */
export function pointCost(r: LevelRecipe, s: number, price: (itemId: number) => Q | null, model: PlanOptions['chanceModel'] = 'comunidad'): Q | null {
  const chance = chanceFor(r, s, model);
  const cost = chance ? craftCost(r, price) : null;
  return chance && cost ? cost.div(chance.mul(Q.of(r.skillUps))) : null;
}

export function alternativesAt(pool: LevelRecipe[], s: number, chosenId: number, price: (itemId: number) => Q | null,
  model: PlanOptions['chanceModel'] = 'comunidad', limit = 3): Alternative[] {
  const out: Alternative[] = [];
  for (const r of pool) {
    if (r.id === chosenId) continue;
    const chance = chanceFor(r, s, model);
    if (!chance) continue;
    out.push({ recipe: r, chance, costPerPoint: pointCost(r, s, price, model), color: colorAt(r, s) });
  }
  out.sort((a, b) => (a.costPerPoint && b.costPerPoint ? a.costPerPoint.cmp(b.costPerPoint) : a.costPerPoint ? -1 : b.costPerPoint ? 1 : a.recipe.id - b.recipe.id));
  return out.slice(0, limit);
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

/**
 * Con «solo instructor», los niveles en los que el instructor no enseña ninguna receta que dé puntos (p. ej. Sastrería
 * 255-300) se cubren con recetas de patrón, botín o misión, pero SOLO en esos niveles (`onlyAt`). Devuelve null si no
 * hay huecos o ningún patrón los cubre; si no, las recetas a usar con `trainerOnly: false` y los tramos cubiertos.
 */
export function fillTrainerGaps(recipes: LevelRecipe[], opts: PlanOptions): { recipes: LevelRecipe[]; filled: Array<[number, number]> } | null {
  if (!opts.trainerOnly) return null;
  const base = recipePool(recipes, opts);
  const extra = recipePool(recipes, { ...opts, trainerOnly: false }).filter((r) => !base.includes(r));
  const gaps: Array<[number, number]> = [];
  for (let s = opts.from; s < opts.to; s++) {
    if (base.some((r) => chanceFor(r, s, opts.chanceModel))) continue;
    if (!extra.some((r) => chanceFor(r, s, opts.chanceModel))) continue;
    const last = gaps[gaps.length - 1];
    if (last && last[1] === s) last[1] = s + 1; else gaps.push([s, s + 1]);
  }
  if (!gaps.length) return null;
  const extraSet = new Set(extra);
  return { recipes: base.concat(recipes.filter((r) => extraSet.has(r)).map((r) => ({ ...r, onlyAt: gaps }))), filled: gaps };
}

export function planLeveling(recipes: LevelRecipe[], opts: PlanOptions): LevelPlan {
  validateRange(opts.from, opts.to);
  const fill = fillTrainerGaps(recipes, opts);
  if (fill) return planLeveling(fill.recipes, { ...opts, trainerOnly: false });
  const { from, to, price } = opts;
  const pool = recipePool(recipes, opts);
  const costCache = new Map<number, Q | null>();
  const costOf = (r: LevelRecipe) => {
    if (!costCache.has(r.id)) costCache.set(r.id, craftCost(r, price));
    return costCache.get(r.id)!;
  };
  const fast = opts.objective === 'tiempo';
  const lambda = opts.lambda ?? 0;
  // Referencia: la mejor elección punto a punto (la más rápida o la más barata, sin agrupar).
  const ref = assemblePlan(from, to, fast ? pickByTimePerPoint(pool, opts, costOf, lambda) : pickByCostPerPoint(pool, opts, costOf), opts);
  const metric = (pl: LevelPlan) => (fast ? (pl.activeSeconds ? pl.activeSeconds.toNumber() : Number.POSITIVE_INFINITY) : pl.total.toNumber());
  const limit = metric(ref) * (1 + MAX_SEGMENT_EXTRA);
  // Tramos lo más largos posible sin pasar del límite: si la ruta agrupada se aleja más de un 3 % de la referencia,
  // se baja la penalización por cambiar de receta y se vuelve a calcular.
  for (const share of PENALTY_SHARES) {
    const plan = assemblePlan(from, to, fast ? pickByTime(pool, opts, costOf, lambda, share) : pickByCost(pool, opts, costOf, share), opts);
    if (!Number.isFinite(limit) || metric(plan) <= limit) return plan;
  }
  return ref;
}

/** Como mucho un 3 % más de tiempo (ruta rápida) o de oro (ruta barata) que la mejor ruta punto a punto. */
export const MAX_SEGMENT_EXTRA = 0.03;
/** Penalizaciones que se prueban, de más agrupada a menos. */
const PENALTY_SHARES = [0.01, 0.005, 0.0025, 0.001];

/** Instructor que se paga al empezar a usar la receta (ni las conocidas ni las de patrón). */
const trainingOf = (r: LevelRecipe, opts: PlanOptions) => (r.availability === 'instructor' && !opts.known?.has(r.id) ? Number(r.trainingCost) : 0);

/**
 * Reparte [from, to) en tramos de una sola receta minimizando Σ(costo por punto) + instructor + penalización por tramo.
 * `score(r, s)` = costo (o puntuación) de un punto con la receta en s, null si no se puede usar ahí. Las recetas dan
 * puntos en un intervalo continuo de niveles, así que basta un mínimo móvil por receta: O(puntos × recetas).
 * Los niveles sin ninguna receta utilizable se marcan como hueco (sin receta) con el motivo de `greedy`.
 */
export function segmentPicks(pool: LevelRecipe[], opts: PlanOptions, score: (r: LevelRecipe, s: number) => number | null,
  fixed: (r: LevelRecipe) => number, penalty: number, greedy: Pick[]): Pick[] {
  const { from, to } = opts;
  const n = to - from;
  const GAP = 1e18;
  const best = new Array<number>(n + 1).fill(Infinity);
  const prev: Array<{ s: number; r: LevelRecipe | null } | null> = new Array(n + 1).fill(null);
  best[0] = 0;
  // Por receta: suma acumulada de puntuaciones desde que empezó su tramo válido actual y mínimo móvil de (best[s] − pref[s]).
  const state = pool.map(() => ({ pref: 0, minVal: Infinity, minS: -1, active: false }));
  for (let t = 1; t <= n; t++) {
    const lvl = from + t - 1; // el punto que se gana al llegar a t
    let b = Infinity; let arg: { s: number; r: LevelRecipe | null } | null = null;
    for (let k = 0; k < pool.length; k++) {
      const r = pool[k]; const st = state[k];
      const sc = score(r, lvl);
      if (sc === null || !Number.isFinite(sc)) { st.active = false; st.minVal = Infinity; continue; }
      if (!st.active) { st.active = true; st.pref = 0; st.minVal = Infinity; st.minS = -1; }
      // El tramo puede empezar en t−1 (antes de sumar este punto).
      const cand0 = best[t - 1] - st.pref;
      if (cand0 < st.minVal) { st.minVal = cand0; st.minS = t - 1; }
      st.pref += sc;
      const v = st.minVal + st.pref + fixed(r) + penalty;
      const eps = Number.isFinite(b) ? 1e-9 * Math.max(1, Math.abs(b)) : 0;
      if (!Number.isFinite(b) ? v < b : v < b - eps || (Math.abs(v - b) <= eps && arg?.r && r.id < arg.r.id)) { b = v; arg = { s: st.minS, r }; }
    }
    if (best[t - 1] + GAP < b) { b = best[t - 1] + GAP; arg = { s: t - 1, r: null }; }
    best[t] = b; prev[t] = arg;
  }
  // Reconstrucción.
  const out: Pick[] = new Array(n);
  let t = n;
  while (t > 0) {
    const a = prev[t]!;
    for (let i = a.s; i < t; i++) {
      const lvl = from + i;
      out[i] = a.r ? { recipe: a.r, chance: chanceFor(a.r, lvl, opts.chanceModel)!, reason: null, missing: [] } : greedy[i];
    }
    t = a.s;
  }
  return out;
}

/** Penalización por tramo de partida: un 1 % de lo que cuesta la ruta punto a punto (al menos 1 de plata), para no cambiar de receta por céntimos. */
export const SEGMENT_PENALTY_SHARE = 0.01;
const MIN_PENALTY_COPPER = 100;

function greedyTotal(picks: Pick[], from: number, score: (r: LevelRecipe, s: number) => number | null, fixed: (r: LevelRecipe) => number) {
  let total = 0; const seen = new Set<number>();
  picks.forEach((p, i) => {
    if (!p.recipe) return;
    total += score(p.recipe, from + i) ?? 0;
    if (!seen.has(p.recipe.id)) { seen.add(p.recipe.id); total += fixed(p.recipe); }
  });
  return total;
}

/** Más barata en tramos: costo esperado de materiales + instructor, con la penalización por cambio de receta. */
export function pickByCost(pool: LevelRecipe[], opts: PlanOptions, costOf: (r: LevelRecipe) => Q | null, share = SEGMENT_PENALTY_SHARE): Pick[] {
  const greedy = pickByCostPerPoint(pool, opts, costOf);
  const cost = new Map<number, number | null>();
  const score = (r: LevelRecipe, s: number) => {
    const chance = chanceFor(r, s, opts.chanceModel);
    if (!chance) return null;
    if (!cost.has(r.id)) { const c = costOf(r); cost.set(r.id, c ? c.toNumber() : null); }
    const c = cost.get(r.id);
    return c === null || c === undefined ? null : c / (chance.toNumber() * r.skillUps);
  };
  const fixed = (r: LevelRecipe) => trainingOf(r, opts);
  const penalty = Math.max(share > 0 ? MIN_PENALTY_COPPER : 0, share * greedyTotal(greedy, opts.from, score, fixed));
  return segmentPicks(pool, opts, score, fixed, penalty, greedy);
}

/** Elección exacta punto a punto (la base para los huecos y para fijar la penalización). */
export function pickByCostPerPoint(pool: LevelRecipe[], opts: PlanOptions, costOf: (r: LevelRecipe) => Q | null): Pick[] {
  const { from, to, price } = opts;
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
  return picks;
}

/**
 * Elección por punto que minimiza tiempo + λ × costo (en coma flotante: solo decide la receta; los importes del plan
 * se recalculan con aritmética exacta). Las recetas sin precio o sin tiempo de lanzamiento no se eligen.
 */
export function pickByTime(pool: LevelRecipe[], opts: PlanOptions, costOf: (r: LevelRecipe) => Q | null, lambda: number, share = SEGMENT_PENALTY_SHARE): Pick[] {
  const greedy = pickByTimePerPoint(pool, opts, costOf, lambda);
  // Con λ = 0 el costo solo desempata: entre recetas igual de rápidas, la más barata (antes ganaba el id menor).
  const w = lambda > 0 ? lambda : TIE_SECONDS_PER_COPPER;
  const cost = new Map<number, number | null>();
  const score = (r: LevelRecipe, s: number) => {
    const chance = chanceFor(r, s, opts.chanceModel);
    if (!chance || r.castSeconds === null || r.castSeconds === undefined) return null;
    if (!cost.has(r.id)) { const c = costOf(r); cost.set(r.id, c ? c.toNumber() : null); }
    const c = cost.get(r.id);
    if (c === null || c === undefined) return null;
    const per = 1 / (chance.toNumber() * r.skillUps);
    return r.castSeconds * per + w * c * per;
  };
  const fixed = (r: LevelRecipe) => w * trainingOf(r, opts);
  const total = greedyTotal(greedy, opts.from, score, fixed);
  // Sin peso del costo (λ = 0) se penaliza en segundos: un 1 % del tiempo de la ruta (al menos 10 s) por tramo.
  const penalty = Math.max(lambda > 0 || share <= 0 ? 0 : 10, share * total);
  return segmentPicks(pool, opts, score, fixed, penalty, greedy);
}

/**
 * Peso mínimo del costo en la ruta más rápida: 1 de oro = 0,01 s. Nunca cambia cuál es más rápida (un tramo se
 * penaliza con al menos 10 s), solo elige la más barata entre recetas que tardan lo mismo.
 */
const TIE_SECONDS_PER_COPPER = 1e-6;

/** Elección punto a punto por tiempo + λ × costo (base para los huecos y la penalización). */
export function pickByTimePerPoint(pool: LevelRecipe[], opts: PlanOptions, costOf: (r: LevelRecipe) => Q | null, lambda: number): Pick[] {
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
  /** Objetos fabricados en pasos anteriores que aún no se han usado. */
  const stock = new Map<number, bigint>();
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
      let stepCost = Q.zero;
      const materials: StepMaterial[] = r.reagents.map((g) => {
        const unitPrice = price(g.itemId);
        const quantity = BigInt(g.quantity) * crafts;
        const have = stock.get(g.itemId) ?? 0n;
        const fromSteps = have < quantity ? have : quantity;
        if (fromSteps > 0n) stock.set(g.itemId, have - fromSteps);
        const cost = unitPrice ? unitPrice.mul(quantity - fromSteps) : null;
        if (cost) stepCost = stepCost.add(cost);
        return { itemId: g.itemId, quantity, fromSteps, unitPrice, cost };
      });
      if (r.creates && r.creates.quantity > 0) stock.set(r.creates.itemId, (stock.get(r.creates.itemId) ?? 0n) + crafts * BigInt(r.creates.quantity));
      const cast = r.castSeconds;
      steps.push({
        from: sFrom, to: sTo, recipe: r, colorFrom: colorAt(r, sFrom), colorTo: colorAt(r, sTo - 1),
        expectedCrafts: expected, crafts, materials, cost: stepCost, reason: null, missingItems: [],
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
      const buy = m.quantity - m.fromSteps;
      if (buy <= 0n) continue;
      const prev = shop.get(m.itemId);
      shop.set(m.itemId, { itemId: m.itemId, quantity: (prev?.quantity ?? 0n) + buy, unitPrice: m.unitPrice });
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
