/**
 * Ruta recomendada para subir una profesión (PC-08 a PC-12, PC-16).
 *
 * - «barata»: la de menor costo esperado por punto (planLeveling con objetivo «costo»).
 * - «rapida»: la de menor tiempo activo esperado (tiempo de lanzamiento × fabricaciones esperadas).
 *   Con presupuesto: relajación lagrangiana, se minimiza tiempo + λ × costo en cada punto y se busca (bisección
 *   sobre λ) la ruta más rápida cuyo total cabe en el presupuesto. Es una heurística: devuelve la más rápida
 *   **entre las evaluadas**, no un óptimo global demostrado (el redondeo de fabricaciones por paso y el costo de
 *   aprendizaje acoplan los puntos). La prueba `tests/route.test.ts` la compara con una búsqueda exhaustiva.
 *
 * El tiempo activo no incluye desplazamientos, compras ni esperas: no hay datos verificados, así que se indica
 * «no incluido» en vez de estimarlo. Las recetas con reutilización no se usan (D29), así que no añaden espera.
 */
import { Q } from './rational.js';
import { assemblePlan, chanceFor, craftCost, pickByTime, planLeveling, recipePool, type LevelPlan, type LevelRecipe, type Pick, type PlanOptions } from './leveling.js';

export type RouteMode = 'rapida' | 'barata';

export interface RouteOptions extends Omit<PlanOptions, 'objective' | 'lambda'> {
  mode: RouteMode;
  /** Presupuesto en cobre para materiales + instructor (null = sin límite). */
  budget?: Q | null;
}

export interface RouteResult {
  mode: RouteMode;
  plan: LevelPlan;
  algorithm: string;
  /** Peso del costo usado en la ruta rápida (segundos por cobre); null en la barata. */
  lambda: number | null;
  budget: Q | null;
  /** null sin presupuesto; false si ni la ruta más barata evaluada cabe. */
  withinBudget: boolean | null;
  /** Rutas evaluadas para elegir (la rápida con presupuesto prueba varias). */
  evaluated: number;
  blockers: string[];
  notes: string[];
}

const secs = (p: LevelPlan) => (p.activeSeconds ? p.activeSeconds.toNumber() : Number.POSITIVE_INFINITY);
const fits = (p: LevelPlan, budget: Q | null | undefined) => !budget || p.total.cmp(budget) <= 0;

export function planRoute(recipes: LevelRecipe[], opts: RouteOptions): RouteResult {
  const budget = opts.budget ?? null;
  const base: PlanOptions = { ...opts };
  const notes: string[] = [];
  const blockers: string[] = [];
  const cheap = () => planLeveling(recipes, { ...base, objective: 'costo' });

  if (opts.mode === 'barata') {
    const plan = cheap();
    const ok = budget ? fits(plan, budget) : null;
    if (ok === false) blockers.push('La ruta más barata evaluada cuesta más que el presupuesto.');
    return { mode: 'barata', plan, algorithm: 'barata-por-punto-v1', lambda: null, budget, withinBudget: ok, evaluated: 1, blockers, notes };
  }

  const fastest = planLeveling(recipes, { ...base, objective: 'tiempo', lambda: 0 });
  if (!budget || fits(fastest, budget)) {
    return { mode: 'rapida', plan: fastest, algorithm: 'rapida-por-punto-v1', lambda: 0, budget, withinBudget: budget ? true : null, evaluated: 1, blockers, notes };
  }

  // Con presupuesto: la ruta más barata marca si hay solución; la bisección busca la más rápida que cabe.
  const floor = cheap();
  let evaluated = 2;
  if (!fits(floor, budget)) {
    blockers.push('Ni la ruta más barata evaluada cabe en el presupuesto: se muestra esa ruta para ver cuánto falta.');
    return { mode: 'rapida', plan: floor, algorithm: 'rapida-presupuesto-lagrangiana-v1', lambda: null, budget, withinBudget: false, evaluated, blockers, notes };
  }
  const pool = recipePool(recipes, base);
  const costCache = new Map<number, Q | null>();
  const costOf = (r: LevelRecipe) => {
    if (!costCache.has(r.id)) costCache.set(r.id, craftCost(r, base.price));
    return costCache.get(r.id)!;
  };
  // Punto de partida factible: las elecciones de la ruta más barata (con tiempo conocido si lo hay).
  let best: { picks: Pick[]; plan: LevelPlan; lambda: number | null } = { picks: pickByTime(pool, base, costOf, 1e12), plan: floor, lambda: null };
  best.plan = assemblePlan(base.from, base.to, best.picks, base);
  if (!fits(best.plan, budget) || secs(best.plan) === Number.POSITIVE_INFINITY) best = { picks: [], plan: floor, lambda: null };
  const better = (plan: LevelPlan) => fits(plan, budget) && (secs(plan) < secs(best.plan) || (secs(plan) === secs(best.plan) && plan.total.cmp(best.plan.total) < 0));

  // 1) Relajación lagrangiana: λ en segundos por cobre, en escala logarítmica.
  let lo = Math.log(1e-9);
  let hi = Math.log(1e6);
  for (let k = 0; k < 40 && hi - lo > 1e-4; k++) {
    const mid = (lo + hi) / 2;
    const lambda = Math.exp(mid);
    const picks = pickByTime(pool, base, costOf, lambda);
    const plan = assemblePlan(base.from, base.to, picks, base);
    evaluated++;
    if (fits(plan, budget)) {
      hi = mid;
      if (better(plan)) best = { picks, plan, lambda };
    } else lo = mid;
  }

  // 2) Mejora voraz: con el presupuesto que sobra, cambia puntos a recetas más rápidas por orden de segundos
  //    ahorrados por cobre extra (la relajación sola salta de un extremo a otro cuando los puntos son iguales).
  if (best.picks.length) {
    const picks = best.picks.slice();
    const est = (p: Pick, s: number) => {
      const per = 1 / (p.chance!.toNumber() * p.recipe!.skillUps);
      return { t: (p.recipe!.castSeconds ?? Infinity) * per, c: costOf(p.recipe!)!.toNumber() * per, s };
    };
    const moves: Array<{ i: number; pick: Pick; ratio: number }> = [];
    for (let i = 0; i < picks.length; i++) {
      if (!picks[i].recipe) continue;
      const cur = est(picks[i], base.from + i);
      for (const r of pool) {
        const chance = chanceFor(r, base.from + i, base.chanceModel);
        if (!chance || r.castSeconds === null || r.castSeconds === undefined || !costOf(r)) continue;
        const cand: Pick = { recipe: r, chance, reason: null, missing: [] };
        const e = est(cand, base.from + i);
        if (e.t >= cur.t) continue;
        const dc = e.c - cur.c;
        moves.push({ i, pick: cand, ratio: dc <= 0 ? Number.POSITIVE_INFINITY : (cur.t - e.t) / dc });
      }
    }
    // Mayor ahorro por cobre primero; a igualdad, los puntos más bajos (pasos contiguos).
    moves.sort((a, b) => b.ratio - a.ratio || a.i - b.i);
    let current = best.plan;
    for (const m of moves) {
      if (evaluated > 4000) break;
      const prev = picks[m.i];
      if (prev.recipe && prev.recipe.id === m.pick.recipe!.id) continue;
      if (prev.recipe && est(m.pick, 0).t >= est(prev, 0).t) continue; // ya se cambió a otra más rápida
      picks[m.i] = m.pick;
      const plan = assemblePlan(base.from, base.to, picks, base);
      evaluated++;
      if (fits(plan, budget) && secs(plan) <= secs(current)) current = plan;
      else picks[m.i] = prev;
    }
    if (better(current)) best = { picks, plan: current, lambda: best.lambda };
  }
  notes.push(`Ruta más rápida entre ${evaluated} evaluadas que cabe en el presupuesto (heurística; no se garantiza el óptimo global).`);
  return { mode: 'rapida', plan: best.plan, algorithm: 'rapida-presupuesto-lagrangiana-voraz-v2', lambda: best.lambda, budget, withinBudget: true, evaluated, blockers, notes };
}

/**
 * Rangos del instructor según las reglas de Classic (Aprendiz 1–75, Oficial hasta 150, Experto hasta 225, Artesano
 * hasta 300; nivel de personaje 10, 20 y 35). No están verificados para Forever y su costo no se conoce: se muestran
 * como requisito a confirmar, nunca como dato oficial.
 */
export const CLASSIC_RANKS = [
  { name: 'Oficial', cap: 150, unlockAt: 75, characterLevel: 10 },
  { name: 'Experto', cap: 225, unlockAt: 150, characterLevel: 20 },
  { name: 'Artesano', cap: 300, unlockAt: 225, characterLevel: 35 },
] as const;

export interface RankRequirement {
  rank: string;
  /** Hay que aprenderlo antes de pasar de este nivel. */
  before: number;
  characterLevel: number;
  /** El personaje ya lo tiene (su máximo actual lo cubre). */
  satisfied: boolean | null;
  /** El personaje no tiene el nivel necesario (null = nivel desconocido). */
  levelOk: boolean | null;
}

export function rankRequirements(from: number, to: number, currentMax: number | null, characterLevel: number | null): RankRequirement[] {
  const out: RankRequirement[] = [];
  for (const r of CLASSIC_RANKS) {
    // Hace falta si la ruta cruza el máximo del rango anterior (por encima de él ya se tiene).
    if (!(from <= r.unlockAt && to > r.unlockAt)) continue;
    out.push({
      rank: r.name, before: r.unlockAt, characterLevel: r.characterLevel,
      satisfied: currentMax === null ? null : currentMax >= r.cap,
      levelOk: characterLevel === null ? null : characterLevel >= r.characterLevel,
    });
  }
  return out;
}
