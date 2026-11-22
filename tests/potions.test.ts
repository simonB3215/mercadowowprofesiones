import { describe, expect, it } from 'vitest';
import { potionVerdict } from '../src/server/potions.js';
import { Q } from '../src/engine/rational.js';

const ev = (profit: string | null, status: any, sellCheck: any = null) => ({ status, sellCheck, profit: { profitUnit: profit === null ? null : Q.parse(profit) } });

describe('pociones: ¿conviene fabricarla para vender?', () => {
  it('sí solo cuando gana oro y es «Buena opción»', () => {
    expect(potionVerdict(ev('5', 'candidato'))).toBe('si');
  });
  it('gana poco cuando hay ganancia pero poca demanda o poco margen', () => {
    expect(potionVerdict(ev('5', 'demanda_incierta'))).toBe('poco');
    expect(potionVerdict(ev('1', 'margen_insuficiente'))).toBe('poco');
  });
  it('no cuando la ganancia es cero o negativa, aunque se venda mucho', () => {
    expect(potionVerdict(ev('-0.05', 'no_rentable'))).toBe('no');
    expect(potionVerdict(ev('0', 'no_rentable'))).toBe('no');
  });
  it('precio dudoso con una sola publicación cara', () => {
    expect(potionVerdict(ev('40', 'candidato', { kind: 'atipico' }))).toBe('dudoso');
  });
  it('sin datos si no se puede calcular la ganancia (nunca se toma como cero)', () => {
    expect(potionVerdict(ev(null, 'datos_insuficientes'))).toBe('sin_datos');
  });
});
