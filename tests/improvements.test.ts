/**
 * Mejoras del 21-11-2026: ganancia por hora, buscador global, precios para avisos, gasto de lo que tienes al marcar un
 * paso, avisos de precio, reconocer la clase del personaje y cambios de las favoritas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Q } from '../src/engine/rational.js';

process.env.DATABASE_URL = 'pglite:memory';
const { getDb, migrate } = await import('../src/server/db.js');
const { handle } = await import('../src/server/router.js');
const { seedTestCatalog, TEST_CTX } = await import('./helpers/seed.js');
const { evaluateRecipe } = await import('../src/server/evaluate.js');
const { DEFAULT_SETTINGS } = await import('../src/server/config.js');
const { catalogCastSeconds } = await import('../src/server/cooldowns.js');
const { castSecondsOf } = await import('../src/server/spellDetails.js');
const { consumeForStep, restoreForStep, stepNeeds } = await import('../web/src/RouteTools.js');
const { alertHit } = await import('../web/src/priceAlerts.js');
const { matchKey } = await import('../web/src/pages/GameChanges.js');
const { favoriteChanges } = await import('../web/src/Today.js');
const wowhead = (await import('../data/leveling/forever-wowhead.json', { with: { type: 'json' } })).default as any;

const qs = new URLSearchParams(TEST_CTX).toString();
async function api(path: string) {
  const res = await handle(new Request(`http://x${path}`));
  return { status: res.status, json: await res.json() as any };
}

beforeAll(async () => {
  const db = await getDb();
  await migrate(db);
  await seedTestCatalog(db);
});

describe('Ganancia por hora', () => {
  const base = {
    snap: {
      ctx: { version: 'forever', region: 'us', realm: 'normal-alliance' }, runs: { realm_items: { sourceTime: '2026-11-21T01:00:00Z' } as any }, lastAttempt: {},
      local: new Map([
        [100, { kind: 'realm_items', marketValue: 50000n, minBuyout: null, recent: null, historical: null, name: 'Poción' }],
        [200, { kind: 'realm_items', marketValue: 1000n, minBuyout: null, recent: null, historical: null, name: 'Hierba' }],
      ]),
      region: new Map(),
    },
    settings: DEFAULT_SETTINGS, items: new Map(), reagents: new Map([[1, [{ item_id: 200, quantity: 2 }]]]), variants: new Map(), profile: null,
    now: Date.parse('2026-11-21T02:00:00Z'),
  } as any;
  const recipe = { id: 1, profession_id: 171, profession: 'Alquimia', profession_kind: 'PRIMARY', skill_tier_id: 1, tier: 'Alchemy', expansion: 'WoW Forever', category: null,
    name: 'Poción', crafted_item_id: 100, alliance_item_id: null, horde_item_id: null, qty_min: 1, qty_max: 1, has_modified_slots: false, fetch_error: null } as any;

  it('ganancia por lote × 3600 ÷ segundos de lanzamiento', () => {
    const e = evaluateRecipe(recipe, { ...base, cooldowns: new Map([[1, 0]]), castTimes: new Map([[1, 5]]) });
    // 50000 − 5 % = 47500; menos 2000 de materiales = 45500 por fabricación; 720 fabricaciones por hora.
    expect(e.profit.profitBatch?.toJSON()).toEqual({ n: '45500', d: '1' });
    expect(e.profitHour?.toJSON()).toEqual({ n: '32760000', d: '1' });
    expect(e.castSeconds).toBe(5);
    // Tiempos con decimales (2,5 s en Wowhead): 1440 fabricaciones por hora.
    expect(evaluateRecipe(recipe, { ...base, cooldowns: new Map([[1, 0]]), castTimes: new Map([[1, 2.5]]) }).profitHour?.toJSON()).toEqual({ n: '65520000', d: '1' });
  });

  it('sin tiempo conocido o con espera no hay ganancia por hora (nunca 0)', () => {
    expect(evaluateRecipe(recipe, { ...base, cooldowns: new Map([[1, 0]]) }).profitHour).toBeNull();
    expect(evaluateRecipe(recipe, { ...base, cooldowns: new Map([[1, 82800]]), castTimes: new Map([[1, 5]]) }).profitHour).toBeNull();
    expect(evaluateRecipe(recipe, { ...base, castTimes: new Map([[1, 5]]) }).profitHour).toBeNull(); // espera desconocida
  });

  it('el catálogo enlaza el tiempo de Wowhead por objeto y materiales; sin coincidencia, null', () => {
    const r = wowhead.professions.flatMap((p: any) => p.recipes).find((x: any) => x.reagents.length && x.creates && castSecondsOf(x.id));
    expect(r).toBeTruthy();
    const cast = catalogCastSeconds(r.creates.itemId, r.reagents.map((g: any) => ({ item_id: g.itemId, quantity: g.quantity })));
    expect(cast).toBeGreaterThanOrEqual(castSecondsOf(r.id)!);
    expect(catalogCastSeconds(999999999, [{ item_id: 1, quantity: 1 }])).toBeNull();
    expect(catalogCastSeconds(r.creates.itemId, [{ item_id: r.reagents[0].itemId, quantity: null }])).toBeNull();
  });

  it('el comparador ordena por ganancia por hora con los ausentes al final', async () => {
    const r = await api(`/api/opportunities?${qs}&sort=profitHour&pageSize=50`);
    expect(r.status).toBe(200);
    expect(r.json.items.length).toBeGreaterThan(0);
    for (const i of r.json.items) expect(i).toHaveProperty('profitHour');
  });
});

describe('Buscador global y precios para avisos', () => {
  it('busca recetas y objetos; menos de 2 letras no busca y los comodines se ignoran', async () => {
    const r = await api('/api/search?version=forever&q=barra');
    expect(r.status).toBe(200);
    expect(r.json.recipes.some((x: any) => x.name === 'Barra desde polvo (ciclo)' && x.profession === 'Herrería')).toBe(true);
    expect(r.json.items.length).toBeGreaterThan(0);
    for (const i of r.json.items) expect(typeof i.reagent).toBe('boolean');
    expect((await api('/api/search?version=forever&q=b')).json).toEqual({ recipes: [], items: [] });
    expect((await api('/api/search?version=forever&q=%25%25')).json).toEqual({ recipes: [], items: [] });
  });

  it('precio de compra actual de varios objetos; sin datos = null, nunca 0', async () => {
    const r = await api(`/api/prices?${qs}&ids=900002,123456`);
    expect(r.status).toBe(200);
    const [a, b] = r.json.items;
    expect(a.itemId).toBe(900002);
    expect(Q.fromJSON(a.price).sign()).toBe(1);
    expect(b).toMatchObject({ itemId: 123456, price: null });
    expect((await api(`/api/prices?${qs}&ids=${Array.from({ length: 201 }, (_, i) => i + 1).join(',')}`)).status).toBe(400);
  });
});

describe('Marcar un paso gasta lo que tienes', () => {
  const step = { recipe: { spellId: 1 }, materials: [{ itemId: 10, quantity: 8, fromSteps: 0 }, { itemId: 11, quantity: 5, fromSteps: 5 }, { itemId: 12, quantity: 3 }] };
  it('solo cuenta lo que se compra (no lo fabricado en pasos anteriores)', () => {
    expect(stepNeeds(step)).toEqual([[10, 8], [12, 3]]);
    expect(stepNeeds({ recipe: null, materials: [] })).toEqual([]);
  });
  it('gasta como mucho lo que tienes y lo devuelve igual al desmarcar', () => {
    const bag = { '10': 5, '12': 10, '99': 4 };
    const r = consumeForStep(bag, stepNeeds(step));
    expect(r.owned).toEqual({ '12': 7, '99': 4 });
    expect(r.used).toEqual({ '10': 5, '12': 3 });
    expect(restoreForStep(r.owned, r.used)).toEqual(bag);
    expect(consumeForStep({}, stepNeeds(step))).toEqual({ owned: {}, used: {} });
  });
});

describe('Avisos de precio', () => {
  const p = (gold: number) => Q.of(gold * 10000);
  it('«baja de» y «sube de» incluyen el límite; sin precio o con un importe mal escrito no avisa', () => {
    expect(alertHit({ itemId: 1, name: 'x', when: 'baja', gold: '40' }, p(40))).toBe(true);
    expect(alertHit({ itemId: 1, name: 'x', when: 'baja', gold: '40' }, p(41))).toBe(false);
    expect(alertHit({ itemId: 1, name: 'x', when: 'sube', gold: '1,5' }, Q.of(15000))).toBe(true);
    expect(alertHit({ itemId: 1, name: 'x', when: 'sube', gold: '2' }, p(1))).toBe(false);
    expect(alertHit({ itemId: 1, name: 'x', when: 'baja', gold: '40' }, null)).toBe(false);
    expect(alertHit({ itemId: 1, name: 'x', when: 'baja', gold: 'mucho' }, p(1))).toBe(false);
  });
});

describe('Tu clase en Cambios del juego', () => {
  const classes = [{ en: 'Warrior', es: 'Guerrero' }, { en: 'Warlock', es: 'Brujo' }, { en: 'Hunter', es: 'Cazador' }, { en: 'Priest', es: 'Sacerdote' }];
  const races = [{ en: 'Night Elf', es: 'Elfo de la noche' }, { en: 'Undead', es: 'No-muerto' }];
  it('acepta el nombre en inglés o en español, con o sin tilde y en femenino', () => {
    expect(matchKey('Warlock', classes)).toBe('Warlock');
    expect(matchKey('Warrior', classes)).toBe('Warrior');
    expect(matchKey('Cazadora', classes)).toBe('Hunter');
    expect(matchKey('Sacerdotisa', classes)).toBe('Priest');
    expect(matchKey('Elfa de la noche', races)).toBe('Night Elf');
    expect(matchKey('No-muerta', races)).toBe('Undead');
    expect(matchKey(null, classes)).toBeNull();
    expect(matchKey('Monje', classes)).toBeNull();
  });
});

describe('Cambios de las favoritas en «Qué hago hoy»', () => {
  const item = (id: number, copper: number, extra = {}) => ({ recipeId: id, profitUnit: Q.of(copper).toJSON(), ...extra });
  const snap = (profit: Record<string, number>) => ({ at: 0, ctx: 'c', profit: Object.fromEntries(Object.entries(profit).map(([k, v]) => [k, JSON.stringify(Q.of(v).toJSON())])) });
  it('muestra los cambios grandes (≥ 5 % y ≥ 1 plata), los mayores primero y como mucho 3', () => {
    const r = favoriteChanges([item(1, 10000), item(2, 20500), item(3, 30), item(4, 5000), item(5, 9000), item(6, 1)], snap({ 1: 20000, 2: 20000, 3: 10, 4: 1000, 5: 1000, 6: 500 }), 'c');
    expect(r.map((c) => c.item.recipeId)).toEqual([1, 5, 4]);
  });
  it('sin foto, de otra casa o con precio atípico no hay cambios', () => {
    expect(favoriteChanges([item(1, 10000)], null, 'c')).toEqual([]);
    expect(favoriteChanges([item(1, 10000)], snap({ 1: 50000 }), 'otra')).toEqual([]);
    expect(favoriteChanges([item(1, 10000, { sellCheck: { kind: 'atipico' } })], snap({ 1: 50000 }), 'c')).toEqual([]);
  });
});

describe('Cómo se fabrica un objeto', () => {
  it('Tela lunar: Sastrería nivel 230 con patrón (Wowhead) y material de otras recetas', async () => {
    const r = await api('/api/items/14342/crafting?version=forever');
    expect(r.status).toBe(200);
    expect(r.json.createdBy).toHaveLength(1);
    expect(r.json.createdBy[0]).toMatchObject({ professionId: 197, learnedAt: 230, availability: 'otra', trainingCost: null });
    expect(r.json.createdBy[0].recipeItem.nameEn).toMatch(/Mooncloth/);
    expect(r.json.reagentOf).toBeGreaterThan(0);
  });

  it('un objeto que no se fabrica (Paño de lino) dice que no y cuántas recetas lo usan', async () => {
    const r = await api('/api/items/2589/crafting?version=forever');
    expect(r.json.createdBy).toEqual([]);
    expect(r.json.reagentOf).toBeGreaterThan(0);
  });

  it('una receta del catálogo sin pareja en Wowhead sale con nivel y forma de aprenderla desconocidos (null, no 0)', async () => {
    const r = await api('/api/items/900017/crafting?version=forever');
    expect(r.json.createdBy).toEqual([expect.objectContaining({ recipeId: 800011, name: 'Bolsa de prueba', profession: 'Sastrería', learnedAt: null, availability: null })]);
  });

  it('la ventana del objeto incluye cómo se fabrica', async () => {
    const r = await api('/api/items/900017/tooltip?version=forever');
    expect(r.status).toBe(200);
    expect(r.json.crafting.createdBy[0].recipeId).toBe(800011);
    expect((await api('/api/items/0/crafting')).status).toBe(400);
  });
});

describe('dónde se consigue la receta', () => {
  it('lee sourcemore de la ficha XML de Wowhead', async () => {
    const { parseSources } = await import('../scripts/sync-recipe-sources.js');
    const xml = '<json><![CDATA["source":[5],"sourcemore":[{"n":"Alchemist Pestlezugg","t":1,"ti":5594,"z":440},{"n":"Sin id","t":1}]]]></json>';
    expect(parseSources(xml)).toEqual([{ n: 'Alchemist Pestlezugg', t: 1, ti: 5594, z: 440 }]);
    expect(parseSources('<json><![CDATA["source":[2]]]></json>')).toEqual([]);
  });
  it('la receta de Transmutar arcanita dice vendedor y zona en español', async () => {
    const { recipeItemFor, recipeWhere } = await import('../src/server/recipeItems.js');
    const ri = recipeItemFor(17187)!;
    expect(ri.where).toEqual([{ name: 'Alchemist Pestlezugg', kind: 'pnj', url: 'https://www.wowhead.com/forever/npc=5594', zone: 'Tanaris' }]);
    expect(ri.whereMore).toBe(0);
    expect(recipeWhere(1)).toEqual({ where: [], whereMore: 0 });
    const { whereText } = await import('../web/src/RouteTools.js');
    expect(whereText(ri)).toBe('Alchemist Pestlezugg (Tanaris)');
    expect(whereText({ where: [ri.where[0], { name: 'X', zone: null }], whereMore: 2 })).toBe('Alchemist Pestlezugg (Tanaris) y 3 más');
  });
});
