/**
 * ¿Comprar el objeto terminado o fabricarlo? (para usarlo, no para venderlo). Motor puro, importes en cobre.
 * Comprar: precio en la casa de subastas × cantidad (sin comisión: compras, no vendes).
 * Fabricar: costo por unidad de los materiales (lo más barato entre comprarlos o fabricarlos) × cantidad,
 * más lo que cueste aprender la receta si el personaje aún no la tiene.
 */
import { Q } from './rational.js';

export type BuyOrCraftVerdict = 'fabricar' | 'comprar' | 'igual' | 'solo_fabricar' | 'sin_datos';

export interface BuyOrCraftInput {
  /** Unidades que necesitas (entero > 0). */
  quantity: number;
  /** Precio por unidad del objeto terminado en la subasta; null = sin datos. */
  buyUnit: Q | null;
  /** Unidades publicadas ahora en la casa de subastas; null = desconocido. */
  buyAvailable: number | null;
  /** false si el objeto se liga al recogerlo (no se puede comprar). */
  canBuy: boolean;
  /** Costo por unidad fabricándolo; null = falta algún precio. */
  craftUnit: Q | null;
  /** Lo que cuesta aprender la receta (una vez); null = desconocido. */
  learnCost: Q | null;
  /** El personaje aún no conoce la receta: el costo de aprenderla se suma a fabricar. */
  needsLearning: boolean;
  /** Diferencia por debajo de la cual «da igual» (porcentaje, por defecto 5). */
  tolerancePct?: number;
}

export interface BuyOrCraftResult {
  verdict: BuyOrCraftVerdict;
  buyTotal: Q | null;
  craftTotal: Q | null;
  /** Lo que ahorras con la opción recomendada (null si no hay comparación). */
  savings: Q | null;
  savingsPct: Q | null;
  /** Unidades a partir de las cuales fabricar compensa el costo de aprender la receta (null si no aplica). */
  breakEvenQty: number | null;
  reasons: string[];
}

export const BUY_OR_CRAFT_TOLERANCE_PCT = 5;

export function buyOrCraft(i: BuyOrCraftInput): BuyOrCraftResult {
  if (!Number.isInteger(i.quantity) || i.quantity <= 0) throw new RangeError('La cantidad debe ser un entero mayor que 0.');
  const reasons: string[] = [];
  const learn = i.needsLearning ? i.learnCost : Q.zero;
  if (i.needsLearning && i.learnCost === null) reasons.push('No se sabe cuánto cuesta conseguir la receta: el total de fabricar no lo incluye.');
  const craftTotal = i.craftUnit ? i.craftUnit.mul(i.quantity).add(learn ?? Q.zero) : null;
  const buyTotal = i.canBuy && i.buyUnit ? i.buyUnit.mul(i.quantity) : null;

  // Fabricar compensa aprender la receta a partir de N unidades (si fabricar sale más barato por unidad).
  let breakEvenQty: number | null = null;
  if (i.learnCost && i.learnCost.sign() > 0 && i.buyUnit && i.craftUnit && i.buyUnit.cmp(i.craftUnit) > 0) {
    breakEvenQty = Number(i.learnCost.div(i.buyUnit.sub(i.craftUnit)).ceil());
  }

  if (i.canBuy && i.buyUnit && i.buyAvailable !== null && i.buyAvailable < i.quantity) {
    reasons.push(i.buyAvailable === 0
      ? 'Ahora no hay ninguno en venta: el precio de compra es una referencia.'
      : `Solo hay ${i.buyAvailable} en venta: el resto puede costar más.`);
  }

  const base = { buyTotal, craftTotal, breakEvenQty };
  if (!i.canBuy) {
    if (!craftTotal) return { ...base, verdict: 'sin_datos', savings: null, savingsPct: null, reasons: ['Se liga al recogerlo: no se puede comprar, y falta algún precio para calcular la fabricación.', ...reasons] };
    return { ...base, verdict: 'solo_fabricar', savings: null, savingsPct: null, reasons: ['Se liga al recogerlo: no se puede comprar, solo fabricar.', ...reasons] };
  }
  if (!buyTotal && !craftTotal) return { ...base, verdict: 'sin_datos', savings: null, savingsPct: null, reasons: ['Faltan precios del objeto y de sus materiales.', ...reasons] };
  if (!buyTotal) return { ...base, verdict: 'fabricar', savings: null, savingsPct: null, reasons: ['No hay precio de compra en la subasta: fabricarlo es la única opción con datos.', ...reasons] };
  if (!craftTotal) return { ...base, verdict: 'comprar', savings: null, savingsPct: null, reasons: ['Falta el precio de algún material: comprarlo es la única opción con datos.', ...reasons] };

  const cmp = craftTotal.cmp(buyTotal);
  const cheaper = cmp <= 0 ? craftTotal : buyTotal;
  const savings = cmp <= 0 ? buyTotal.sub(craftTotal) : craftTotal.sub(buyTotal);
  const savingsPct = cheaper.isZero() ? null : savings.div(cheaper).mul(100);
  const tol = Q.of(i.tolerancePct ?? BUY_OR_CRAFT_TOLERANCE_PCT);
  if (savingsPct !== null && savingsPct.cmp(tol) < 0) {
    return { ...base, verdict: 'igual', savings, savingsPct, reasons: [`La diferencia es menor del ${tol.toDecimal(0)} %: elige lo que te sea más cómodo.`, ...reasons] };
  }
  if (cmp <= 0) {
    if (i.needsLearning && i.learnCost && i.learnCost.sign() > 0) reasons.unshift('Incluye lo que cuesta conseguir la receta.');
    return { ...base, verdict: 'fabricar', savings, savingsPct, reasons };
  }
  if (i.needsLearning && breakEvenQty !== null) reasons.unshift(`Por la receta: fabricar compensa a partir de ${breakEvenQty} unidades.`);
  return { ...base, verdict: 'comprar', savings, savingsPct, reasons };
}
