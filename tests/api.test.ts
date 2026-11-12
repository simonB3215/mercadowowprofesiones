import { describe, it, expect, beforeAll } from 'vitest';
import { Q } from '../src/engine/rational.js';

process.env.DATABASE_URL = 'pglite:memory';
const { getDb, migrate } = await import('../src/server/db.js');
const { handle } = await import('../src/server/router.js');
const { seedTestCatalog, TEST_CTX } = await import('./helpers/seed.js');

const ctx = TEST_CTX;
const qs = new URLSearchParams(ctx).toString();
const q = (j: any): Q => Q.fromJSON(j);

async function api(method: string, path: string, body?: unknown) {
  const res = await handle(new Request(`http://x${path}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  const db = await getDb();
  await migrate(db);
  expect(await seedTestCatalog(db)).toEqual(['ok', 'ok']);
});

async function detail(id: number, extra = '') {
  const r = await api('GET', `/api/recipes/${id}?${qs}${extra}`);
  expect(r.status).toBe(200);
  return r.json.evaluation;
}

describe('API sobre un catálogo de prueba de WoW Forever', () => {
  it('solo WoW Forever: sin Retail ni Classic, sin commodities y con casas de subastas fijas', async () => {
    const r = await api('GET', '/api/meta');
    const ids = r.json.versions.map((v: any) => v.id);
    expect(ids).toEqual(['forever']);
    for (const v of ['retail', 'classic', 'demo']) expect((await api('GET', `/api/opportunities?version=${v}&region=us`)).status).toBe(400);
    expect((await api('POST', '/api/demo/seed')).status).toBe(404);
    const realms = await api('GET', '/api/realms?version=forever&region=us');
    expect(realms.json.realms).toHaveLength(12);
    expect(realms.json.realms.slice(0, 3).map((x: any) => x.slug)).toEqual(['normal-alliance', 'normal-horde', 'normal-aguasnegras']);
    const st = await api('GET', '/api/market/status?version=forever&region=us&realm=normal-alliance');
    expect(st.json.files.map((f: any) => f.kind)).toEqual(['region_items', 'realm_items']);
  });

  it('receta que produce 5 unidades reparte el costo', async () => {
    const e = await detail(800003);
    expect(e.unitsPerRun).toBe(5);
    // 6 × 8000 + 5 × 2000 = 58000 cobre por lote → 11600 por unidad
    expect(q(e.cost.batch).eq(Q.of(58000))).toBe(true);
    expect(q(e.cost.unit).eq(Q.of(11600))).toBe(true);
  });

  it('material sin precio → datos insuficientes', async () => {
    const e = await detail(800004);
    expect(e.status).toBe('datos_insuficientes');
    expect(e.cost.batch).toBeNull();
    expect(e.reasons.join(' ')).toMatch(/Esencia sin precio/);
  });

  it('resultado ligado → no vendible', async () => {
    expect((await detail(800005)).status).toBe('no_vendible');
  });

  it('servicio sin objeto → no vendible y canal servicio', async () => {
    const e = await detail(800010);
    expect(e.channel).toBe('servicio');
    expect(e.status).toBe('no_vendible');
  });

  it('resultado con variantes del mismo nombre bloquea la recomendación', async () => {
    const e = await detail(800006);
    expect(e.status).toBe('datos_insuficientes');
    expect(e.reasons.join(' ')).toMatch(/variantes con el mismo nombre/i);
  });

  it('rendimiento variable bloquea hasta fijarlo manualmente', async () => {
    const v = await detail(800009);
    expect(v.status).toBe('datos_insuficientes');
    expect(v.profit.profitUnit).toBeNull();
    expect(v.unitsPerRun).toBeNull();
    const r = await api('POST', '/api/calculate', { ...ctx, recipeId: 800009, overrides: { units: 2 } });
    expect(r.json.scenario.manual).toBe(true);
    expect(r.json.scenario.unitsPerRun).toBe(2);
    expect(r.json.scenario.status).not.toBe('candidato');
  });

  it('escenario con caída de precio y precio manual no sobrescribe el origen', async () => {
    const r = await api('POST', '/api/calculate', { ...ctx, recipeId: 800003, overrides: { priceDrop: '20', prices: { '900004': '2' } } });
    expect(r.status).toBe(200);
    const base = r.json.base;
    const sc = r.json.scenario;
    expect(base.manual).toBe(false);
    expect(sc.manual).toBe(true);
    expect(sc.reagents.find((x: any) => x.itemId === 900004).price.scope).toBe('manual');
    expect(q(sc.dropScenario.price).eq(q(base.sellPrice.copper)!.mul(Q.parse('0.8')))).toBe(true);
  });

  it('valores inválidos devuelven 400', async () => {
    const r = await api('POST', '/api/calculate', { ...ctx, recipeId: 800003, overrides: { commission: 'abc' } });
    expect(r.status).toBe(400);
    const r2 = await api('PUT', '/api/settings', { commission: '1' });
    expect(r2.status).toBe(400);
  });

  it('comparar comprar y fabricar detecta el ciclo barra ↔ polvo', async () => {
    const r = await api('GET', `/api/recipes/800002?${qs}`);
    const barra = r.json.sourcing.find((s: any) => s.itemId === 900002);
    expect(barra.node).toBeDefined();
    const str = JSON.stringify(barra.node);
    expect(str).toMatch(/fabricar|comprar/);
    expect(barra.recipesAvailable).toBeGreaterThan(0);
  });

  it('oportunidades: ordena sin tratar ausentes como cero y cuenta estados', async () => {
    const r = await api('GET', `/api/opportunities?${qs}&sort=profitUnit`);
    expect(r.status).toBe(200);
    const items = r.json.items;
    const firstNull = items.findIndex((i: any) => i.profitUnit === null);
    if (firstNull >= 0) expect(items.slice(firstNull).every((i: any) => i.profitUnit === null)).toBe(true);
    expect(Object.keys(r.json.counts).length).toBeGreaterThan(2);
    const filtered = await api('GET', `/api/opportunities?${qs}&hideUnsellable=1`);
    expect(filtered.json.items.every((i: any) => i.channel !== 'vinculado' && i.channel !== 'servicio')).toBe(true);
  });

  it('perfil: sin la receta → no fabricable; con la receta → conoce', async () => {
    const p = await api('POST', '/api/profiles', { name: 'Prueba', faction: 'horde', professions: [{ professionId: 1, skill: 100 }], knownRecipes: [800003] });
    const id = p.json.id;
    expect((await detail(800003, `&profileId=${id}`)).character).toBe('conoce');
    expect((await detail(800002, `&profileId=${id}`)).status).toBe('no_fabricable');
    expect((await detail(800002)).notes.join(' ')).toMatch(/sin confirmar/);
  });

  it('plan con inventario compartido entre recetas', async () => {
    const p = await api('POST', '/api/profiles', { name: 'Inv', professions: [{ professionId: 2 }], knownRecipes: [800001, 800002], inventory: { '900002': 10 } });
    const r = await api('POST', '/api/crafting-plan', {
      ...ctx, profileId: p.json.id,
      entries: [{ recipeId: 800002, amount: 1, mode: 'ejecuciones' }, { recipeId: 800005, amount: 2, mode: 'ejecuciones' }],
    });
    expect(r.status).toBe(200);
    const bar = r.json.plan.materials.find((m: any) => m.itemKey === '900002');
    expect(bar.need).toBe(12);
    expect(bar.used).toBe(10);
    expect(bar.toBuy).toBe(2);
    expect(r.json.warnings.join(' ')).toMatch(/no vendible/);
  });

  it('registro real: beneficio realizado separado de pendientes', async () => {
    await api('POST', '/api/ledger', { kind: 'compra', itemId: 900001, itemName: 'Mineral', quantity: 10, unitPriceGold: '1.5' });
    await api('POST', '/api/ledger', { kind: 'fabricacion', itemId: 900002, itemName: 'Barra', quantity: 5, unitPriceGold: '0' });
    const sale = await api('POST', '/api/ledger', { kind: 'venta', itemId: 900002, itemName: 'Barra', quantity: 2, unitPriceGold: '10' });
    let l = await api('GET', '/api/ledger');
    expect(l.json.summary.realized).toBe(String(20 * 10000 - 15 * 10000));
    expect(l.json.summary.pendingToSell[0].pending).toBe(3);
    // Corrección sin duplicar: reemplaza la venta.
    await api('POST', '/api/ledger', { kind: 'venta', itemId: 900002, itemName: 'Barra', quantity: 2, unitPriceGold: '12', replacesId: sale.json.id });
    l = await api('GET', '/api/ledger');
    expect(l.json.summary.realized).toBe(String(24 * 10000 - 15 * 10000));
    const bad = await api('POST', '/api/ledger', { kind: 'venta', quantity: 0, unitPriceGold: '1' });
    expect(bad.status).toBe(400);
  });

  it('materiales: valor de venta frente a uso en recetas', async () => {
    const r = await api('GET', `/api/materials/900004?${qs}`);
    expect(r.status).toBe(200);
    expect(r.json.alternatives.length).toBeGreaterThan(0);
    expect(r.json.sellNet).not.toBeNull();
  });

  it('herramientas manuales validan probabilidades', async () => {
    const r = await api('POST', '/api/tools/expected', { scenarios: [{ label: 'a', probability: '0.5', netRevenueGold: '10' }] });
    expect(r.json.expected).toBeNull();
    expect(r.json.manual).toBe(true);
  });

  it('cambiar de casa de subastas no mezcla precios', async () => {
    expect((await api('GET', '/api/opportunities?version=forever&region=xx')).status).toBe(400);
    const otra = await api('GET', '/api/opportunities?version=forever&region=us&realm=pvp-horde');
    expect(otra.status).toBe(200);
    // Sin precios cargados para pvp-horde: ningún coste ni ganancia calculados.
    expect(otra.json.items.every((i: any) => i.profitUnit === null)).toBe(true);
  });

  it('datos desactualizados impiden candidato', async () => {
    await api('PUT', '/api/settings', { maxAgeHoursRealm: 0, maxAgeHoursRegion: 0 });
    const r = await api('GET', `/api/opportunities?${qs}`);
    expect(r.json.items.some((i: any) => i.status === 'candidato')).toBe(false);
    await api('PUT', '/api/settings', { maxAgeHoursRealm: 12, maxAgeHoursRegion: 48 });
    const r2 = await api('GET', `/api/opportunities?${qs}`);
    expect(r2.json.items.some((i: any) => i.status === 'candidato' || i.status === 'demanda_incierta')).toBe(true);
  });
});
