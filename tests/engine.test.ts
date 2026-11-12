import { describe, it, expect } from 'vitest';
import { Q, gold } from '../src/engine/rational.js';
import {
  computeCost, computeProfit, classify, buildPlan, resolveSourcing, expectedRevenue,
  applyPriceDrop, type Thresholds, type ClassifyInput,
} from '../src/engine/calc.js';
import { formatMoney, exactGold } from '../src/engine/format.js';

const t5 = Q.parse('0.05');

describe('Rational', () => {
  it('parsea decimales con coma y punto', () => {
    expect(Q.parse('0,05').eq(Q.of(1, 20))).toBe(true);
    expect(Q.parse('12.5').eq(Q.of(25, 2))).toBe(true);
    expect(Q.parse('3/6').eq(Q.of(1, 2))).toBe(true);
    expect(() => Q.parse('abc')).toThrow();
  });
  it('ceil y floor', () => {
    expect(Q.of(7, 2).ceil()).toBe(4n);
    expect(Q.of(-7, 2).ceil()).toBe(-3n);
    expect(Q.of(6, 2).ceil()).toBe(3n);
  });
});

describe('Caso de referencia (sección 7)', () => {
  it('C=300 o, Q=2, P=200 o, t=0,05, D=0 → 80 o/lote y 40 o/unidad', () => {
    const cost = computeCost(
      [
        { itemKey: 'a', name: 'A', quantity: 10, unitPrice: gold(20) },
        { itemKey: 'b', name: 'B', quantity: 2, unitPrice: gold(50) },
      ],
      2,
    );
    expect(cost.batch!.eq(gold(300))).toBe(true);
    expect(cost.unit!.eq(gold(150))).toBe(true);
    const p = computeProfit({ units: 2, price: gold(200), commission: t5, cost: cost.batch, lostDeposits: Q.zero });
    expect(p.netRevenue!.eq(gold(380))).toBe(true);
    expect(p.profitBatch!.eq(gold(80))).toBe(true);
    expect(p.profitUnit!.eq(gold(40))).toBe(true);
    expect(p.roiPct!.eq(Q.of(80, 3))).toBe(true);
    // 3000/19 oro = 30 000 000/19 cobre
    expect(p.breakEven!.eq(Q.of(30000000, 19))).toBe(true);
    expect(exactGold(p.breakEven)).toContain('3000/19');
    // Precio publicable mínimo = siguiente cobre entero que cubre el equilibrio.
    expect(p.minListPrice).toBe(Q.of(30000000, 19).ceil());
  });
});

describe('Costo', () => {
  it('una receta con varias unidades no carga el lote completo a cada unidad', () => {
    const c = computeCost([{ itemKey: 'x', name: 'X', quantity: 4, unitPrice: gold(10) }], 5);
    expect(c.batch!.eq(gold(40))).toBe(true);
    expect(c.unit!.eq(gold(8))).toBe(true);
  });
  it('material sin precio → costo null, nunca cero', () => {
    const c = computeCost(
      [
        { itemKey: 'x', name: 'X', quantity: 1, unitPrice: gold(10) },
        { itemKey: 'y', name: 'Y', quantity: 1, unitPrice: null },
      ],
      1,
    );
    expect(c.batch).toBeNull();
    expect(c.missing).toEqual(['y']);
  });
  it('material propio no es gratuito: reposición y desembolso separados', () => {
    const c = computeCost([{ itemKey: 'x', name: 'X', quantity: 10, unitPrice: gold(2), owned: 6 }], 1);
    expect(c.batch!.eq(gold(20))).toBe(true);
    expect(c.outOfPocket!.eq(gold(8))).toBe(true);
  });
  it('desembolso cero si todo está en inventario aunque falte precio', () => {
    const c = computeCost([{ itemKey: 'x', name: 'X', quantity: 2, unitPrice: null, owned: 5 }], 1);
    expect(c.batch).toBeNull();
    expect(c.outOfPocket!.isZero()).toBe(true);
  });
  it('cantidades inválidas devuelven error', () => {
    expect(computeCost([{ itemKey: 'x', name: 'X', quantity: 0, unitPrice: gold(1) }], 1).errors.length).toBeGreaterThan(0);
    expect(computeCost([{ itemKey: 'x', name: 'X', quantity: 1, unitPrice: gold(1) }], 0).errors.length).toBeGreaterThan(0);
    expect(computeCost([{ itemKey: 'x', name: 'X', quantity: 1.5, unitPrice: gold(1) }], 1).errors.length).toBeGreaterThan(0);
  });
  it('los opcionales no se suman automáticamente', () => {
    const c = computeCost(
      [
        { itemKey: 'x', name: 'X', quantity: 1, unitPrice: gold(1) },
        { itemKey: 'o', name: 'Opc', quantity: 1, unitPrice: null, optional: true },
      ],
      1,
    );
    expect(c.batch!.eq(gold(1))).toBe(true);
  });
});

describe('Ganancia', () => {
  it('C = 0 → ROI no definido, no infinito', () => {
    const p = computeProfit({ units: 1, price: gold(10), commission: t5, cost: Q.zero });
    expect(p.roiPct).toBeNull();
    expect(p.roiUndefined).toBe(true);
    expect(p.profitBatch!.eq(gold('9.5'))).toBe(true);
  });
  it('valida Q > 0 y 0 ≤ t < 1', () => {
    expect(computeProfit({ units: 0, price: gold(1), commission: t5, cost: gold(1) }).errors.length).toBe(1);
    expect(computeProfit({ units: 1, price: gold(1), commission: Q.one, cost: gold(1) }).errors.length).toBe(1);
    expect(computeProfit({ units: 1, price: gold(1), commission: Q.parse('-0.1'), cost: gold(1) }).errors.length).toBe(1);
  });
  it('depósitos perdidos restan; recuperables solo suman capital', () => {
    const p = computeProfit({ units: 1, price: gold(100), commission: Q.zero, cost: gold(50), lostDeposits: gold(5), recoverableDeposits: gold(20) });
    expect(p.profitBatch!.eq(gold(45))).toBe(true);
    expect(p.capitalRequired!.eq(gold(75))).toBe(true);
  });
  it('precio para objetivo', () => {
    const p = computeProfit({ units: 2, price: gold(200), commission: t5, cost: gold(300), targetProfit: gold(100) });
    expect(p.targetPrice!.eq(gold(400).div(Q.parse('1.9')))).toBe(true);
  });
  it('caída de precio', () => {
    expect(applyPriceDrop(gold(200), Q.parse('0.1'))!.eq(gold(180))).toBe(true);
    expect(applyPriceDrop(null, Q.parse('0.1'))).toBeNull();
  });
});

const th: Thresholds = { minProfitUnit: gold(1), minRoiPct: Q.of(10), minSaleRate: 0.05, minSoldPerDay: 1 };
function baseInput(over: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    sellable: 'si', character: 'sin_perfil', costMissing: [], outputPriceKnown: true, yieldKnown: true,
    dataBlockers: [], stale: false, manual: false, thresholds: th,
    demand: { saleRate: 0.4, soldPerDay: 50 },
    profit: computeProfit({ units: 2, price: gold(200), commission: t5, cost: gold(300) }),
    ...over,
  };
}

describe('Clasificación', () => {
  it('candidato con datos completos', () => {
    const r = classify(baseInput());
    expect(r.status).toBe('candidato');
    expect(r.notes.join(' ')).toContain('sin confirmar');
  });
  it('material sin precio nunca es rentable', () => {
    expect(classify(baseInput({ costMissing: ['Hierro'] })).status).toBe('datos_insuficientes');
  });
  it('resultado no vendible', () => {
    expect(classify(baseInput({ sellable: 'no' })).status).toBe('no_vendible');
  });
  it('vendibilidad desconocida → datos insuficientes', () => {
    expect(classify(baseInput({ sellable: 'desconocido' })).status).toBe('datos_insuficientes');
  });
  it('calidad sin correspondencia bloquea', () => {
    expect(classify(baseInput({ dataBlockers: ['Calidad sin correspondencia'] })).status).toBe('datos_insuficientes');
  });
  it('datos desactualizados impiden recomendación favorable', () => {
    expect(classify(baseInput({ stale: true })).status).toBe('datos_insuficientes');
  });
  it('sin demanda → demanda incierta', () => {
    expect(classify(baseInput({ demand: null })).status).toBe('demanda_incierta');
  });
  it('margen insuficiente y no rentable', () => {
    expect(classify(baseInput({ thresholds: { ...th, minRoiPct: Q.of(50) } })).status).toBe('margen_insuficiente');
    expect(classify(baseInput({ profit: computeProfit({ units: 1, price: gold(10), commission: t5, cost: gold(20) }) })).status).toBe('no_rentable');
  });
  it('perfil sin la receta → no fabricable', () => {
    expect(classify(baseInput({ character: 'no_conoce' })).status).toBe('no_fabricable');
  });
  it('valores manuales no producen candidato automático', () => {
    expect(classify(baseInput({ manual: true })).status).toBe('demanda_incierta');
  });
});

describe('Plan con inventario compartido', () => {
  const r1 = { recipeId: 'r1', name: 'R1', unitsPerRun: 1, outputPrice: gold(10), reagents: [{ itemKey: 'h', name: 'Hierro', quantity: 5, unitPrice: gold(1) }] };
  const r2 = { recipeId: 'r2', name: 'R2', unitsPerRun: 3, outputPrice: gold(10), reagents: [{ itemKey: 'h', name: 'Hierro', quantity: 4, unitPrice: gold(1) }] };
  it('no asigna el mismo material a dos recetas', () => {
    const p = buildPlan([{ recipe: r1, amount: 1, mode: 'ejecuciones' }, { recipe: r2, amount: 1, mode: 'ejecuciones' }], { h: 6 }, t5);
    expect(p.entries[0].allocations[0].fromInventory).toBe(5);
    expect(p.entries[1].allocations[0].fromInventory).toBe(1);
    expect(p.materials[0].toBuy).toBe(3);
    expect(p.outOfPocket!.eq(gold(3))).toBe(true);
    expect(p.replacementCost!.eq(gold(9))).toBe(true);
  });
  it('pedir unidades devuelve ejecuciones enteras y excedente', () => {
    const p = buildPlan([{ recipe: r2, amount: 7, mode: 'unidades' }], {}, t5);
    expect(p.entries[0].runs).toBe(3);
    expect(p.entries[0].surplus).toBe(2);
  });
  it('precio faltante → total incompleto', () => {
    const r3 = { ...r1, reagents: [{ itemKey: 'z', name: 'Z', quantity: 1, unitPrice: null }] };
    const p = buildPlan([{ recipe: r3, amount: 1, mode: 'ejecuciones' }], {}, t5);
    expect(p.replacementCost).toBeNull();
    expect(p.incomplete).toEqual(['Z']);
  });
});

describe('Comprar o fabricar', () => {
  it('elige fabricar si es más barato y detecta ciclos', () => {
    const prices: Record<string, Q | null> = { barra: gold(10), mineral: gold(1), polvo: null };
    const recipes: Record<string, any[]> = {
      barra: [{ recipeId: 'fundir', name: 'Fundir', unitsPerRun: 1, reagents: [{ itemKey: 'mineral', quantity: 2 }] }],
      mineral: [{ recipeId: 'deshacer', name: 'Deshacer', unitsPerRun: 2, reagents: [{ itemKey: 'barra', quantity: 1 }] }],
    };
    const n = resolveSourcing('barra', (k) => prices[k] ?? null, (k) => recipes[k] ?? []);
    expect(n.choice).toBe('fabricar');
    expect(n.unitCost!.eq(gold(2))).toBe(true);
    expect(n.cycle).toBe(true);
    const p = resolveSourcing('polvo', (k) => prices[k] ?? null, () => []);
    expect(p.choice).toBe('sin_datos');
  });
});

describe('Probabilístico y concentración', () => {
  it('probabilidades deben sumar 1', () => {
    expect(expectedRevenue([{ label: 'a', probability: Q.parse('0.5'), netRevenue: gold(10) }]).errors.length).toBe(1);
    const ok = expectedRevenue([
      { label: 'a', probability: Q.of(1, 3), netRevenue: gold(30) },
      { label: 'b', probability: Q.of(2, 3), netRevenue: gold(0) },
    ]);
    expect(ok.expected!.eq(gold(10))).toBe(true);
  });
});

describe('Formato', () => {
  it('muestra oro, plata y cobre', () => {
    expect(formatMoney(gold(80))).toBe('80 o');
    expect(formatMoney(Q.of(123456))).toBe('12 o 34 p 56 c');
    expect(formatMoney(Q.of(30000000, 19))).toMatch(/^≈ /);
    expect(formatMoney(null)).toBe('—');
  });
});
