import { describe, it, expect } from 'vitest';
import { Q } from '../src/engine/rational.js';
import { checkSellPrice, type PriceInfo } from '../src/server/evaluate.js';

const local = (copper: number | null): PriceInfo => ({
  copper: copper === null ? null : Q.of(copper), field: 'marketValue', scope: copper === null ? 'sin datos' : 'casa de subastas', sourceTime: null, observed: {},
});

describe('Precio de venta atípico', () => {
  it('con referencia regional: atípico por encima de 3 veces, normal hasta 3 veces', () => {
    const c = checkSellPrice(local(27000), Q.of(866), Q.of(1384))!; // Botas de anillas de cobre férreas: 2 o 70 p frente a 8 p 66 c
    expect(c.kind).toBe('atipico');
    expect(c.ratio!.toDecimal(1)).toBe('31.1');
    expect(c.reason).toMatch(/veces el valor regional/);
    expect(checkSellPrice(local(3000), Q.of(1000), Q.of(5000))).toBeNull(); // exactamente 3 veces: no
    expect(checkSellPrice(local(3001), Q.of(1000), null)!.kind).toBe('atipico');
  });

  it('sin referencia regional: «sin confirmar» solo si el ROI supera el 1000 %', () => {
    const c = checkSellPrice(local(4536945), null, Q.of(836812))!; // Calamar a la parrilla a 453 o
    expect(c.kind).toBe('sin_confirmar');
    expect(c.reason).toMatch(/TSM no tiene precio regional/);
    expect(checkSellPrice(local(5000), null, Q.of(1000))).toBeNull();
    expect(checkSellPrice(local(5000), null, null)).toBeNull(); // ROI desconocido: no se inventa
  });

  it('no aplica a precios manuales, regionales o desconocidos', () => {
    expect(checkSellPrice({ ...local(999999), scope: 'manual', field: 'manual' }, Q.of(1), Q.of(99999))).toBeNull();
    expect(checkSellPrice({ ...local(999999), scope: 'región', field: 'regionMarketValue' }, Q.of(1), Q.of(99999))).toBeNull();
    expect(checkSellPrice(local(null), Q.of(1), null)).toBeNull();
  });
});
