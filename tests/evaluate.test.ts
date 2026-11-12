import { describe, it, expect } from 'vitest';
import { evaluateRecipe, type EvalContext, type RecipeRow } from '../src/server/evaluate.js';
import { DEFAULT_SETTINGS } from '../src/server/config.js';

// Caso real (muestras de Blizzard, docs/muestras): recetas antiguas que la API devuelve sin "reagents",
// o con ingredientes sin cantidad. El costo debe ser desconocido, nunca 0 ni parcial.
const now = Date.parse('2026-11-12T03:00:00Z');
const t = '2026-11-12T01:00:00Z';
const ctx = (reagents: EvalContext['reagents']): EvalContext => ({
  snap: {
    ctx: { version: 'retail', region: 'us', realm: 'area-52' },
    runs: { realm_items: { sourceTime: t } as any, commodities: { sourceTime: t } as any },
    lastAttempt: {},
    local: new Map([
      [100, { kind: 'realm_items', marketValue: 50000n, minBuyout: null, recent: null, historical: null, name: 'Poción' }],
      [200, { kind: 'commodities', marketValue: 1000n, minBuyout: null, recent: null, historical: null, name: 'Hierba' }],
    ]),
    region: new Map(),
  },
  settings: DEFAULT_SETTINGS,
  items: new Map(),
  reagents,
  variants: new Map(),
  profile: null,
  now,
});
const recipe = (over: Partial<RecipeRow> = {}): RecipeRow => ({
  id: 1, profession_id: 171, profession: 'Alquimia', profession_kind: 'PRIMARY', skill_tier_id: 2485, tier: 'Classic Alchemy',
  expansion: 'Classic', category: null, name: 'Poción', crafted_item_id: 100, alliance_item_id: null, horde_item_id: null,
  qty_min: 1, qty_max: 1, has_modified_slots: false, fetch_error: null, ...over,
});

describe('Evaluación con lista de ingredientes incompleta', () => {
  it('sin "reagents" en la API: costo y ganancia desconocidos, no se asume costo 0', () => {
    const e = evaluateRecipe(recipe({ fetch_error: 'La receta no incluye lista de ingredientes (reagents).' }), ctx(new Map()));
    expect(e.cost.batch).toBeNull();
    expect(e.cost.unit).toBeNull();
    expect(e.profit.profitUnit).toBeNull();
    expect(e.status).toBe('datos_insuficientes');
  });

  it('ingrediente sin cantidad: el costo no se calcula con los demás (no es parcial)', () => {
    const e = evaluateRecipe(recipe(), ctx(new Map([[1, [{ item_id: 200, quantity: 2 }, { item_id: 300, quantity: null }]]])));
    expect(e.cost.batch).toBeNull();
    expect(e.profit.profitUnit).toBeNull();
    expect(e.status).toBe('datos_insuficientes');
  });

  it('receta moderna sin objeto resultante en la API: datos insuficientes, no "servicio"', () => {
    const e = evaluateRecipe(
      recipe({ expansion: 'Midnight', crafted_item_id: null, qty_min: null, qty_max: null, has_modified_slots: true }),
      ctx(new Map([[1, [{ item_id: 200, quantity: 2 }]]])),
    );
    expect(e.channel).toBe('desconocido');
    expect(e.status).toBe('datos_insuficientes');
    expect(e.profit.profitUnit).toBeNull();
  });

  it('lista completa: el costo se calcula', () => {
    const e = evaluateRecipe(recipe(), ctx(new Map([[1, [{ item_id: 200, quantity: 2 }]]])));
    expect(e.cost.batch?.toJSON()).toEqual({ n: '2000', d: '1' });
    expect(e.profit.profitUnit).not.toBeNull();
  });
});
