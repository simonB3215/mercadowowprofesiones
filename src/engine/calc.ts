/**
 * Motor puro de cálculo (sin E/S). Todas las cantidades monetarias en cobre como Q.
 * Fórmulas de la sección 6-7 de Documentacion_Web_Crafteo_TSM.md.
 */
import { Q } from './rational.js';

export type Maybe<T> = T | null;

export interface ReagentLine {
  itemKey: string;
  name: string;
  /** Cantidad por ejecución (entero > 0). */
  quantity: number;
  /** Precio unitario en cobre; null = desconocido (nunca 0 implícito). */
  unitPrice: Maybe<Q>;
  /** Unidades en inventario disponibles para esta receta. */
  owned?: number;
  optional?: boolean;
}

export interface CostResult {
  /** Costo de materiales por ejecución (null si falta algún precio de obligatorio). */
  materials: Maybe<Q>;
  /** C_lote = materiales + adicional. */
  batch: Maybe<Q>;
  /** C_unidad = C_lote / unidades_producidas. */
  unit: Maybe<Q>;
  /** Desembolso solo por materiales faltantes en inventario. */
  outOfPocket: Maybe<Q>;
  /** Claves de los materiales sin precio. */
  missing: string[];
  lines: Array<ReagentLine & { subtotal: Maybe<Q>; toBuy: number; outOfPocket: Maybe<Q> }>;
  errors: string[];
}

export function computeCost(
  reagents: ReagentLine[],
  unitsProduced: number,
  additional: Q = Q.zero,
  runs = 1,
): CostResult {
  const errors: string[] = [];
  if (!Number.isInteger(unitsProduced) || unitsProduced <= 0) errors.push('Las unidades producidas deben ser un entero mayor que 0.');
  if (!Number.isInteger(runs) || runs <= 0) errors.push('Las ejecuciones deben ser un entero mayor que 0.');
  if (additional.sign() < 0) errors.push('El costo adicional no puede ser negativo.');
  for (const r of reagents) {
    if (!Number.isInteger(r.quantity) || r.quantity <= 0) errors.push(`Cantidad inválida para ${r.name}.`);
  }
  if (errors.length) return { materials: null, batch: null, unit: null, outOfPocket: null, missing: [], lines: [], errors };
  let materials: Maybe<Q> = Q.zero;
  let oop: Maybe<Q> = Q.zero;
  const missing: string[] = [];
  const lines = reagents
    .filter((r) => !r.optional)
    .map((r) => {
      const need = r.quantity * runs;
      const owned = Math.max(0, Math.floor(r.owned ?? 0));
      const toBuy = Math.max(0, need - owned);
      const subtotal = r.unitPrice ? r.unitPrice.mul(need) : null;
      // Si todo está en inventario el desembolso es 0 aunque el precio sea desconocido.
      const lineOop = toBuy === 0 ? Q.zero : r.unitPrice ? r.unitPrice.mul(toBuy) : null;
      if (subtotal === null) {
        missing.push(r.itemKey);
        materials = null;
      } else if (materials) materials = materials.add(subtotal);
      if (lineOop === null) oop = null;
      else if (oop) oop = oop.add(lineOop);
      return { ...r, subtotal, toBuy, outOfPocket: lineOop };
    });
  if (errors.length) return { materials: null, batch: null, unit: null, outOfPocket: null, missing, lines, errors };
  const batch = materials ? (materials as Q).add(additional.mul(runs)) : null;
  const unit = batch ? batch.div(unitsProduced * runs) : null;
  return { materials, batch, unit, outOfPocket: oop, missing, lines, errors };
}

export interface ProfitInput {
  /** Unidades vendibles por lote (Q). */
  units: number;
  /** Precio de venta unitario en cobre (P). */
  price: Maybe<Q>;
  /** Comisión como decimal, 0 <= t < 1. */
  commission: Q;
  /** Costo total del lote (C). */
  cost: Maybe<Q>;
  /** Depósitos que se estiman perdidos (D). */
  lostDeposits?: Q;
  /** Depósitos recuperables: capital inmovilizado, no gasto. */
  recoverableDeposits?: Q;
  /** Ganancia objetivo por lote (G). */
  targetProfit?: Q;
}

export interface ProfitResult {
  netRevenue: Maybe<Q>;
  profitBatch: Maybe<Q>;
  profitUnit: Maybe<Q>;
  /** ROI en porcentaje; null si C = 0 (no definido) o datos ausentes. */
  roiPct: Maybe<Q>;
  roiUndefined: boolean;
  breakEven: Maybe<Q>;
  targetPrice: Maybe<Q>;
  /** Precio publicable mínimo: siguiente cobre entero que alcanza el objetivo (o equilibrio). */
  minListPrice: Maybe<bigint>;
  /** Capital necesario: costo + depósitos recuperables + perdidos. */
  capitalRequired: Maybe<Q>;
  errors: string[];
}

export function computeProfit(i: ProfitInput): ProfitResult {
  const errors: string[] = [];
  const D = i.lostDeposits ?? Q.zero;
  const R = i.recoverableDeposits ?? Q.zero;
  const G = i.targetProfit ?? Q.zero;
  if (!Number.isInteger(i.units) || i.units <= 0) errors.push('Q debe ser un entero mayor que 0.');
  if (i.commission.sign() < 0 || i.commission.cmp(Q.one) >= 0) errors.push('La comisión debe cumplir 0 ≤ t < 1.');
  if (D.sign() < 0) errors.push('Los depósitos perdidos no pueden ser negativos.');
  if (R.sign() < 0) errors.push('Los depósitos recuperables no pueden ser negativos.');
  if (i.cost && i.cost.sign() < 0) errors.push('El costo no puede ser negativo.');
  if (i.price && i.price.sign() < 0) errors.push('El precio no puede ser negativo.');
  const empty: ProfitResult = {
    netRevenue: null, profitBatch: null, profitUnit: null, roiPct: null, roiUndefined: false,
    breakEven: null, targetPrice: null, minListPrice: null, capitalRequired: null, errors,
  };
  if (errors.length) return empty;
  const keep = Q.one.sub(i.commission);
  const denom = keep.mul(i.units);
  const netRevenue = i.price ? i.price.mul(i.units).mul(keep) : null;
  const C = i.cost;
  const profitBatch = netRevenue && C ? netRevenue.sub(C).sub(D) : null;
  const profitUnit = profitBatch ? profitBatch.div(i.units) : null;
  const roiUndefined = C !== null && C.isZero();
  const roiPct = profitBatch && C && !C.isZero() ? profitBatch.div(C).mul(100) : null;
  const breakEven = C ? C.add(D).div(denom) : null;
  const targetPrice = C ? C.add(D).add(G).div(denom) : null;
  const minListPrice = targetPrice ? targetPrice.ceil() : null;
  const capitalRequired = C ? C.add(R).add(D) : null;
  return { netRevenue, profitBatch, profitUnit, roiPct, roiUndefined, breakEven, targetPrice, minListPrice, capitalRequired, errors };
}

/** Escenario con caída del precio de venta: P' = P × (1 − caída). */
export function applyPriceDrop(price: Maybe<Q>, drop: Q): Maybe<Q> {
  if (!price) return null;
  if (drop.sign() < 0 || drop.cmp(Q.one) > 0) throw new RangeError('La caída debe estar entre 0 y 1.');
  return price.mul(Q.one.sub(drop));
}

// ---------------------------------------------------------------------------
// Clasificación (sección 9)
// ---------------------------------------------------------------------------

export type Status =
  | 'candidato'
  | 'demanda_incierta'
  | 'margen_insuficiente'
  | 'no_rentable'
  | 'datos_insuficientes'
  | 'no_fabricable'
  | 'no_vendible';

export const STATUS_LABEL: Record<Status, string> = {
  candidato: 'Candidato rentable',
  demanda_incierta: 'Rentable con demanda incierta',
  margen_insuficiente: 'Margen insuficiente',
  no_rentable: 'No rentable en este escenario',
  datos_insuficientes: 'Datos insuficientes',
  no_fabricable: 'No fabricable por este personaje',
  no_vendible: 'No vendible en subasta',
};

export interface Thresholds {
  /** Ganancia mínima por unidad (cobre). */
  minProfitUnit: Q;
  /** ROI mínimo en %. */
  minRoiPct: Q;
  /** Tasa de venta regional mínima para considerar demanda suficiente. */
  minSaleRate: number;
  /** Volumen diario regional mínimo. */
  minSoldPerDay: number;
}

export interface ClassifyInput {
  sellable: 'si' | 'no' | 'desconocido';
  sellableReason?: string;
  character: 'conoce' | 'no_conoce' | 'requisito_no_cumplido' | 'sin_perfil';
  costMissing: string[];
  outputPriceKnown: boolean;
  yieldKnown: boolean;
  /** Bloqueos de datos (calidad sin correspondencia, regla avanzada ausente, ...). */
  dataBlockers: string[];
  stale: boolean;
  staleDetail?: string;
  profit: ProfitResult;
  demand: { saleRate: number | null; soldPerDay: number | null } | null;
  manual: boolean;
  thresholds: Thresholds;
}

export interface Classification {
  status: Status;
  reasons: string[];
  notes: string[];
}

export function classify(c: ClassifyInput): Classification {
  const reasons: string[] = [];
  const notes: string[] = [];
  if (c.character === 'sin_perfil') notes.push('Viabilidad para el personaje sin confirmar: no hay perfil registrado.');
  if (c.manual) notes.push('El escenario contiene valores manuales; no es una recomendación automática.');

  if (c.sellable === 'no') {
    return { status: 'no_vendible', reasons: [c.sellableReason ?? 'El resultado no se puede vender en subasta.'], notes };
  }
  if (c.character === 'no_conoce') return { status: 'no_fabricable', reasons: ['El perfil no tiene registrada esta receta.'], notes };
  if (c.character === 'requisito_no_cumplido') return { status: 'no_fabricable', reasons: ['El perfil no cumple un requisito comprobable.'], notes };

  if (c.sellable === 'desconocido') reasons.push(c.sellableReason ?? 'Se desconoce si el resultado se puede vender en subasta.');
  if (!c.yieldKnown) reasons.push('No se conoce cuántas unidades produce la receta.');
  if (c.costMissing.length) reasons.push(`Falta precio de ${c.costMissing.length} material(es): ${c.costMissing.join(', ')}.`);
  if (!c.outputPriceKnown) reasons.push('No hay precio de venta para el resultado.');
  reasons.push(...c.dataBlockers);
  if (c.profit.errors.length) reasons.push(...c.profit.errors);
  if (reasons.length) return { status: 'datos_insuficientes', reasons, notes };

  const p = c.profit;
  if (!p.profitBatch || !p.profitUnit) return { status: 'datos_insuficientes', reasons: ['No se pudo calcular la ganancia.'], notes };
  if (p.profitBatch.sign() <= 0) {
    return { status: 'no_rentable', reasons: [`La ganancia por lote es ${p.profitBatch.sign() === 0 ? 'cero' : 'negativa'} con el precio utilizado.`], notes };
  }
  const t = c.thresholds;
  const below: string[] = [];
  if (p.profitUnit.cmp(t.minProfitUnit) < 0) below.push('ganancia por unidad inferior al objetivo');
  if (p.roiPct && p.roiPct.cmp(t.minRoiPct) < 0) below.push('ROI inferior al objetivo');
  if (below.length) return { status: 'margen_insuficiente', reasons: [`Beneficio positivo, pero ${below.join(' y ')}.`], notes };

  // Los datos fuera de vigencia o valores manuales impiden una recomendación favorable automática.
  if (c.stale) return { status: 'datos_insuficientes', reasons: [c.staleDetail ?? 'Los precios superan la antigüedad máxima configurada.'], notes };

  const d = c.demand;
  const demandReasons: string[] = [];
  if (!d || d.saleRate === null) demandReasons.push('No hay tasa de venta regional.');
  else if (d.saleRate < t.minSaleRate) demandReasons.push(`Tasa de venta regional ${d.saleRate} por debajo del mínimo ${t.minSaleRate}.`);
  if (!d || d.soldPerDay === null) demandReasons.push('No hay volumen diario regional.');
  else if (d.soldPerDay < t.minSoldPerDay) demandReasons.push(`Volumen diario regional ${d.soldPerDay} por debajo del mínimo ${t.minSoldPerDay}.`);
  if (demandReasons.length) return { status: 'demanda_incierta', reasons: ['Beneficio y margen positivos.', ...demandReasons], notes };

  if (c.manual) return { status: 'demanda_incierta', reasons: ['Cumple los objetivos solo con valores manuales.'], notes };
  return { status: 'candidato', reasons: ['Datos suficientes; ganancia, ROI y demanda superan los objetivos.'], notes };
}

// ---------------------------------------------------------------------------
// Lista de fabricación con inventario compartido (PB-17, PB-18)
// ---------------------------------------------------------------------------

export interface PlanRecipe {
  recipeId: string;
  name: string;
  unitsPerRun: number;
  reagents: Array<{ itemKey: string; name: string; quantity: number; unitPrice: Maybe<Q> }>;
  outputPrice: Maybe<Q>;
}

export interface PlanEntry {
  recipe: PlanRecipe;
  /** Cantidad solicitada. */
  amount: number;
  mode: 'ejecuciones' | 'unidades';
}

export interface PlanResult {
  entries: Array<{
    recipeId: string;
    name: string;
    runs: number;
    unitsProduced: number;
    surplus: number;
    requested: number;
    mode: 'ejecuciones' | 'unidades';
    allocations: Array<{ itemKey: string; need: number; fromInventory: number; toBuy: number }>;
    cost: Maybe<Q>;
    netRevenue: Maybe<Q>;
  }>;
  materials: Array<{
    itemKey: string;
    name: string;
    need: number;
    owned: number;
    used: number;
    toBuy: number;
    unitPrice: Maybe<Q>;
    replacementCost: Maybe<Q>;
    outOfPocket: Maybe<Q>;
  }>;
  replacementCost: Maybe<Q>;
  outOfPocket: Maybe<Q>;
  netRevenue: Maybe<Q>;
  estimatedProfit: Maybe<Q>;
  incomplete: string[];
  errors: string[];
}

export function buildPlan(entries: PlanEntry[], inventory: Record<string, number>, commission: Q): PlanResult {
  const errors: string[] = [];
  const remaining: Record<string, number> = {};
  for (const [k, v] of Object.entries(inventory)) remaining[k] = Math.max(0, Math.floor(v));
  const mats = new Map<string, PlanResult['materials'][number]>();
  const out: PlanResult['entries'] = [];
  let totalRev: Maybe<Q> = Q.zero;

  for (const e of entries) {
    const { recipe } = e;
    if (!Number.isInteger(e.amount) || e.amount <= 0) {
      errors.push(`${recipe.name}: la cantidad debe ser un entero mayor que 0.`);
      continue;
    }
    if (!Number.isInteger(recipe.unitsPerRun) || recipe.unitsPerRun <= 0) {
      errors.push(`${recipe.name}: rendimiento desconocido o inválido.`);
      continue;
    }
    const runs = e.mode === 'ejecuciones' ? e.amount : Math.ceil(e.amount / recipe.unitsPerRun);
    const produced = runs * recipe.unitsPerRun;
    const surplus = e.mode === 'unidades' ? produced - e.amount : 0;
    let cost: Maybe<Q> = Q.zero;
    const allocations = recipe.reagents.map((r) => {
      const need = r.quantity * runs;
      // El inventario se consume en el orden del plan: nunca se asigna dos veces.
      const avail = remaining[r.itemKey] ?? 0;
      const fromInventory = Math.min(avail, need);
      remaining[r.itemKey] = avail - fromInventory;
      const toBuy = need - fromInventory;
      const m = mats.get(r.itemKey) ?? {
        itemKey: r.itemKey, name: r.name, need: 0, owned: Math.max(0, Math.floor(inventory[r.itemKey] ?? 0)),
        used: 0, toBuy: 0, unitPrice: r.unitPrice, replacementCost: null, outOfPocket: null,
      };
      m.need += need;
      m.used += fromInventory;
      m.toBuy += toBuy;
      mats.set(r.itemKey, m);
      if (!r.unitPrice) cost = null;
      else if (cost) cost = cost.add(r.unitPrice.mul(need));
      return { itemKey: r.itemKey, need, fromInventory, toBuy };
    });
    const netRevenue = recipe.outputPrice ? recipe.outputPrice.mul(produced).mul(Q.one.sub(commission)) : null;
    if (!netRevenue) totalRev = null;
    else if (totalRev) totalRev = totalRev.add(netRevenue);
    out.push({ recipeId: recipe.recipeId, name: recipe.name, runs, unitsProduced: produced, surplus, requested: e.amount, mode: e.mode, allocations, cost, netRevenue });
  }

  let repl: Maybe<Q> = Q.zero;
  let oop: Maybe<Q> = Q.zero;
  const incomplete: string[] = [];
  for (const m of mats.values()) {
    m.replacementCost = m.unitPrice ? m.unitPrice.mul(m.need) : null;
    m.outOfPocket = m.toBuy === 0 ? Q.zero : m.unitPrice ? m.unitPrice.mul(m.toBuy) : null;
    if (!m.unitPrice) incomplete.push(m.name);
    if (!m.replacementCost) repl = null;
    else if (repl) repl = repl.add(m.replacementCost);
    if (!m.outOfPocket) oop = null;
    else if (oop) oop = oop.add(m.outOfPocket);
  }
  const estimatedProfit = totalRev && repl ? (totalRev as Q).sub(repl) : null;
  return { entries: out, materials: [...mats.values()], replacementCost: repl, outOfPocket: oop, netRevenue: totalRev, estimatedProfit, incomplete, errors };
}

// ---------------------------------------------------------------------------
// Comprar o fabricar componentes con detección de ciclos (PB-19)
// ---------------------------------------------------------------------------

export interface CraftOption {
  recipeId: string;
  name: string;
  unitsPerRun: number;
  reagents: Array<{ itemKey: string; quantity: number }>;
}

export interface SourcingNode {
  itemKey: string;
  choice: 'comprar' | 'fabricar' | 'sin_datos';
  unitCost: Maybe<Q>;
  buyPrice: Maybe<Q>;
  craftCost: Maybe<Q>;
  recipeId?: string;
  cycle?: boolean;
  children?: Array<{ quantity: number; node: SourcingNode }>;
  note?: string;
}

/**
 * Resuelve el costo mínimo de un objeto comparando comprar con fabricar.
 * Solo considera recetas accesibles (`craftable`). Los ciclos se cortan: un objeto
 * que ya está en la ruta actual solo se puede comprar.
 */
export function resolveSourcing(
  itemKey: string,
  buyPrice: (k: string) => Maybe<Q>,
  craftable: (k: string) => CraftOption[],
  path: string[] = [],
): SourcingNode {
  const buy = buyPrice(itemKey);
  if (path.includes(itemKey)) {
    return { itemKey, choice: buy ? 'comprar' : 'sin_datos', unitCost: buy, buyPrice: buy, craftCost: null, cycle: true, note: 'Ciclo detectado en la cadena de recetas.' };
  }
  let best: { cost: Q; opt: CraftOption; children: Array<{ quantity: number; node: SourcingNode }> } | null = null;
  let cycleSeen = false;
  for (const opt of craftable(itemKey)) {
    if (!Number.isInteger(opt.unitsPerRun) || opt.unitsPerRun <= 0) continue;
    let total: Maybe<Q> = Q.zero;
    const children: Array<{ quantity: number; node: SourcingNode }> = [];
    for (const r of opt.reagents) {
      const node = resolveSourcing(r.itemKey, buyPrice, craftable, [...path, itemKey]);
      if (node.cycle) cycleSeen = true;
      children.push({ quantity: r.quantity, node });
      if (!node.unitCost) total = null;
      else if (total) total = total.add(node.unitCost.mul(r.quantity));
    }
    if (!total) continue;
    const unit = total.div(opt.unitsPerRun);
    if (!best || unit.cmp(best.cost) < 0) best = { cost: unit, opt, children };
  }
  const craftCost = best?.cost ?? null;
  if (craftCost && (!buy || craftCost.cmp(buy) < 0)) {
    return { itemKey, choice: 'fabricar', unitCost: craftCost, buyPrice: buy, craftCost, recipeId: best!.opt.recipeId, children: best!.children, cycle: cycleSeen || undefined };
  }
  if (buy) return { itemKey, choice: 'comprar', unitCost: buy, buyPrice: buy, craftCost, cycle: cycleSeen || undefined };
  return { itemKey, choice: 'sin_datos', unitCost: null, buyPrice: null, craftCost: null, note: 'Sin precio de compra ni receta accesible con datos completos.' };
}

// ---------------------------------------------------------------------------
// Resultados probabilísticos (PB-23) y concentración (PB-22)
// ---------------------------------------------------------------------------

export interface OutcomeScenario {
  label: string;
  probability: Q;
  netRevenue: Q;
}

export function expectedRevenue(scenarios: OutcomeScenario[]): { expected: Maybe<Q>; errors: string[] } {
  const errors: string[] = [];
  if (!scenarios.length) errors.push('Se necesita al menos un escenario.');
  let sum = Q.zero;
  let exp = Q.zero;
  for (const s of scenarios) {
    if (s.probability.sign() < 0 || s.probability.cmp(Q.one) > 0) errors.push(`Probabilidad fuera de [0,1] en "${s.label}".`);
    sum = sum.add(s.probability);
    exp = exp.add(s.probability.mul(s.netRevenue));
  }
  if (!sum.eq(Q.one)) errors.push(`Las probabilidades de escenarios excluyentes deben sumar 1 (suman ${sum.toFraction()}).`);
  return { expected: errors.length ? null : exp, errors };
}

export function concentrationEfficiency(profitWithout: Maybe<Q>, profitWith: Maybe<Q>, concentrationSpent: number): { perPoint: Maybe<Q>; incremental: Maybe<Q>; error?: string } {
  if (!profitWithout || !profitWith) return { perPoint: null, incremental: null, error: 'Faltan datos de una de las alternativas.' };
  const incremental = profitWith.sub(profitWithout);
  if (!Number.isFinite(concentrationSpent) || concentrationSpent <= 0) return { perPoint: null, incremental, error: 'El consumo de concentración debe ser mayor que 0.' };
  return { perPoint: incremental.div(Q.parse(concentrationSpent)), incremental };
}
