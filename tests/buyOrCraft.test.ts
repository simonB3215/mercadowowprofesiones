import { describe, it, expect } from 'vitest';
import { Q } from '../src/engine/rational.js';
import { buyOrCraft } from '../src/engine/buyOrCraft.js';

const base = { quantity: 10, buyUnit: Q.of(1000), buyAvailable: 50, canBuy: true, craftUnit: Q.of(600), learnCost: Q.of(5000), needsLearning: false };

describe('¿comprar o fabricar?', () => {
  it('fabricar sale más barato: ahorro y porcentaje', () => {
    const r = buyOrCraft(base);
    expect(r.verdict).toBe('fabricar');
    expect(r.buyTotal!.eq(Q.of(10000))).toBe(true);
    expect(r.craftTotal!.eq(Q.of(6000))).toBe(true);
    expect(r.savings!.eq(Q.of(4000))).toBe(true);
    // 4000 / 6000 = 66,6 %
    expect(r.savingsPct!.toDecimal(1)).toBe('66.6');
    // 5000 / (1000 − 600) = 12,5 → 13 unidades para amortizar la receta
    expect(r.breakEvenQty).toBe(13);
  });

  it('sin conocer la receta, su costo se suma y puede cambiar el veredicto', () => {
    const r = buyOrCraft({ ...base, needsLearning: true });
    expect(r.craftTotal!.eq(Q.of(11000))).toBe(true);
    expect(r.verdict).toBe('comprar');
    expect(r.reasons[0]).toMatch(/a partir de 13 unidades/);
    expect(buyOrCraft({ ...base, needsLearning: true, quantity: 20 }).verdict).toBe('fabricar');
  });

  it('diferencia menor del 5 % → da igual', () => {
    expect(buyOrCraft({ ...base, craftUnit: Q.of(970) }).verdict).toBe('igual');
  });

  it('ligado al recogerlo → solo fabricar; sin precios → sin datos', () => {
    expect(buyOrCraft({ ...base, canBuy: false }).verdict).toBe('solo_fabricar');
    expect(buyOrCraft({ ...base, canBuy: false, craftUnit: null }).verdict).toBe('sin_datos');
    expect(buyOrCraft({ ...base, buyUnit: null, craftUnit: null }).verdict).toBe('sin_datos');
  });

  it('falta un lado: recomienda el que tiene datos sin inventar ahorro', () => {
    const a = buyOrCraft({ ...base, buyUnit: null });
    expect(a.verdict).toBe('fabricar');
    expect(a.savings).toBeNull();
    expect(buyOrCraft({ ...base, craftUnit: null }).verdict).toBe('comprar');
  });

  it('avisa si hay menos unidades en venta de las que necesitas', () => {
    expect(buyOrCraft({ ...base, buyAvailable: 3 }).reasons.join(' ')).toMatch(/Solo hay 3 en venta/);
    expect(() => buyOrCraft({ ...base, quantity: 0 })).toThrow();
  });
});
