import { describe, it, expect } from 'vitest';
import { applyOwned, cleanQty, sumOrNull, MAX_OWNED } from '../web/src/shopping.js';
import { Q } from '../src/engine/rational.js';

const row = (itemId: number, quantity: number, unit: number | null) => ({
  itemId, quantity: BigInt(quantity), unitPrice: unit === null ? null : Q.of(unit), cost: unit === null ? null : Q.of(unit * quantity),
});

describe('lo que ya tienes en la lista de compra', () => {
  it('descuenta lo que tienes sin pasar de lo que pide la ruta', () => {
    const [a, b, c] = applyOwned([row(1, 20, 100), row(2, 5, 50), row(3, 8, 10)], { 1: 6, 2: 50 });
    expect(a).toMatchObject({ need: 20n, owned: 6n, buy: 14n });
    expect(a.cost!.eq(Q.of(1400))).toBe(true);
    expect(a.saved!.eq(Q.of(600))).toBe(true);
    // Tienes más de lo que hace falta: no compras nada y solo cuentan las 5 que se usan.
    expect(b).toMatchObject({ need: 5n, owned: 5n, buy: 0n });
    expect(b.cost!.sign()).toBe(0);
    expect(b.saved!.eq(Q.of(250))).toBe(true);
    // Sin nada en la bolsa, igual que antes.
    expect(c).toMatchObject({ owned: 0n, buy: 8n });
    expect(c.cost!.eq(Q.of(80))).toBe(true);
  });

  it('sin precio: si lo tienes todo no hay que pagar nada; si falta algo, el costo es desconocido (nunca 0)', () => {
    const [all, part, none] = applyOwned([row(1, 3, null), row(2, 3, null), row(3, 3, null)], { 1: 3, 2: 1 });
    expect(all.cost!.sign()).toBe(0);
    expect(all.saved).toBeNull();
    expect(part.cost).toBeNull();
    expect(none.cost).toBeNull();
    expect(sumOrNull([all.cost, part.cost])).toBeNull();
    expect(sumOrNull([Q.of(1), Q.of(2)])!.eq(Q.of(3))).toBe(true);
  });

  it('solo acepta enteros positivos con un máximo', () => {
    expect(cleanQty('12')).toBe(12);
    expect(cleanQty('3.7')).toBe(3);
    expect(cleanQty('-4')).toBe(0);
    expect(cleanQty('abc')).toBe(0);
    expect(cleanQty('')).toBe(0);
    expect(cleanQty(1e12)).toBe(MAX_OWNED);
    // Un valor guardado raro en el navegador no rompe la lista.
    const [r] = applyOwned([row(1, 4, 10)], { 1: 'x' as any });
    expect(r.buy).toBe(4n);
  });
});
