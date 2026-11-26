import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Q } from '../src/engine/rational.js';

process.env.DATABASE_URL = 'pglite:memory';
const { getDb, migrate } = await import('../src/server/db.js');
const { handle } = await import('../src/server/router.js');
const { seedTestCatalog, TEST_CTX } = await import('./helpers/seed.js');

const qs = new URLSearchParams(TEST_CTX).toString();
async function api(method: string, path: string, body?: unknown) {
  const res = await handle(new Request(`http://x${path}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  const db = await getDb();
  await migrate(db);
  await seedTestCatalog(db);
  // 10 días de historial de «Hierba de prueba» (material de 3 recetas): baja de 3 o a 0,8 o y se estabiliza.
  const golds = [3, 2.5, 2, 1.2, 0.8, 0.82, 0.79, 0.8, 0.81, 0.8];
  for (let i = 0; i < golds.length; i++) {
    await db.query(
      `insert into price_history (game_version, region, realm, item_id, day, samples, market_value_sum, min_buyout_min, quantity_sum, quantity_samples)
       values ('forever','us','normal-alliance',900004, current_date - $1::int, 1, $2, $3, $4, 1)`,
      [golds.length - 1 - i, Math.round(golds[i] * 10000), Math.round(golds[i] * 9000), 100 - i],
    );
  }
  // Solo 2 días de «Mineral de prueba»: sin datos suficientes.
  for (const d of [1, 0]) {
    await db.query(`insert into price_history (game_version, region, realm, item_id, day, samples, market_value_sum, min_buyout_min) values ('forever','us','normal-alliance',900001, current_date - $1::int, 1, 15000, 14000)`, [d]);
  }
});

describe('API de la línea de tiempo', () => {
  it('ranking: todos los materiales con historial, con fases, techos y recuentos por veredicto', async () => {
    const r = await api('GET', `/api/timeline?${qs}`);
    expect(r.status).toBe(200);
    expect(r.json.economies.map((e: any) => e.id)).toEqual(['anniversary', 'forever', 'era']);
    expect(r.json.phases.find((p: any) => p.economy === 'forever' && p.phase === 'Fase 2')).toMatchObject({ day: 35, confirmed: true });
    expect(r.json.phases.find((p: any) => p.economy === 'forever' && p.phase === 'Fase 3')).toMatchObject({ day: 136, confirmed: false });
    expect(r.json.annivWindow).toEqual({ from: 49, to: 161 });
    expect(r.json.vendorCaps.map((c: any) => c.itemId).sort()).toEqual([12363, 13468]);
    const ids = r.json.items.map((i: any) => i.itemId);
    expect(ids).toEqual([900004, 900001]); // con puntuación primero; sin datos al final
    const herb = r.json.items[0];
    expect(herb).toMatchObject({ name: 'Hierba de prueba', uses: 3, daysWithData: 10 });
    expect(herb.score).not.toBeNull();
    // Precio de hoy = valor de mercado de la foto actual (8000 c), no 0.
    expect(Q.fromJSON(herb.priceToday).eq(Q.of(8000))).toBe(true);
    const ore = r.json.items[1];
    expect(ore.verdict).toBe('sin_datos');
    expect(ore.score).toBeNull();
    expect(r.json.counts.sin_datos).toBe(1);
    expect(Object.values(r.json.counts).reduce((a: number, b: any) => a + b, 0)).toBe(2);
  });

  it('sin casa de subastas no hay ranking, pero sí las fases', async () => {
    const r = await api('GET', '/api/timeline?version=forever&region=us');
    expect(r.status).toBe(200);
    expect(r.json.items).toEqual([]);
    expect(r.json.phases.length).toBe(8);
  });

  it('detalle: historial por día de Forever, referencias con su fase, resultado y tramos', async () => {
    const r = await api('GET', `/api/timeline/items/900004?${qs}`);
    expect(r.status).toBe(200);
    expect(r.json.history).toHaveLength(10);
    expect(r.json.history[0].foreverDay).toBeTypeOf('number');
    expect(r.json.tiers.length).toBeGreaterThan(0);
    const lotus = await api('GET', `/api/timeline/items/13468?${qs}`);
    expect(lotus.json.vendorCap).toMatchObject({ itemId: 13468, cap: '500000' });
    expect(lotus.json.references.length).toBe(5);
    const r59 = lotus.json.references.find((x: any) => x.observedOn === '2025-01-19');
    expect(r59).toMatchObject({ day: 59, phase: 'Fase 2' });
    expect(lotus.json.result.verdict).toBe('sin_datos'); // sin historial de este objeto en la base de prueba
    const rune = await api('GET', `/api/timeline/items/20520?${qs}`);
    expect(rune.json.references[0]).toMatchObject({ economy: 'era', day: null, phase: 'Contexto (economía madura)' });
    expect((await api('GET', `/api/timeline/items/abc?${qs}`)).status).toBe(400);
  });

  it('referencias: alta, edición y borrado validados (fuente https)', async () => {
    const ref = { economy: 'anniversary', itemId: 900004, observedOn: '2025-02-01', gold: '1,5', confidence: 'baja', sourceUrl: 'https://example.com/hilo' };
    expect((await api('POST', '/api/timeline/references', { ...ref, sourceUrl: 'http://example.com' })).status).toBe(400);
    expect((await api('POST', '/api/timeline/references', { ...ref, gold: '0' })).status).toBe(400);
    expect((await api('POST', '/api/timeline/references', { ...ref, goldMin: '3' })).status).toBe(400);
    const c = await api('POST', '/api/timeline/references', ref);
    expect(c.status).toBe(200);
    expect((await api('POST', '/api/timeline/references', ref)).status).toBe(409);
    const d = await api('GET', `/api/timeline/items/900004?${qs}`);
    expect(d.json.references).toEqual([expect.objectContaining({ id: c.json.id, price: '15000', day: 72, phase: 'Fase 2', confidence: 'baja' })]);
    expect(d.json.result.annivMedian).not.toBeNull();
    expect((await api('PUT', `/api/timeline/references/${c.json.id}`, { ...ref, gold: 2 })).status).toBe(200);
    expect((await api('PUT', '/api/timeline/references/999999', ref)).status).toBe(404);
    expect((await api('DELETE', `/api/timeline/references/${c.json.id}`)).status).toBe(200);
    expect((await api('DELETE', `/api/timeline/references/${c.json.id}`)).status).toBe(404);
  });

  describe('con APP_PASSWORD', () => {
    const prev = process.env.APP_PASSWORD;
    beforeAll(() => { process.env.APP_PASSWORD = 'clave-de-prueba-123'; });
    afterAll(() => { if (prev === undefined) delete process.env.APP_PASSWORD; else process.env.APP_PASSWORD = prev; });

    it('consultar es abierto; escribir referencias sin sesión responde 401', async () => {
      expect((await api('GET', `/api/timeline?${qs}`)).status).toBe(200);
      const body = { economy: 'anniversary', itemId: 900004, observedOn: '2025-02-02', gold: '1', sourceUrl: 'https://example.com/x' };
      for (const [m, p] of [['POST', '/api/timeline/references'], ['PUT', '/api/timeline/references/1'], ['DELETE', '/api/timeline/references/1']]) {
        const r = await api(m, p, m === 'DELETE' ? undefined : body);
        expect(r.status, `${m} ${p}`).toBe(401);
        expect(r.json.auth).toBe(true);
      }
    });
  });
});
