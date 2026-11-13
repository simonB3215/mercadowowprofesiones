import { describe, it, expect, beforeAll } from 'vitest';

process.env.DATABASE_URL = 'pglite:memory';
const { getDb, migrate } = await import('../src/server/db.js');
const { handle } = await import('../src/server/router.js');
const { parseManualPrices, availabilityOf } = await import('../src/server/leveling.js');
const { TEST_CTX } = await import('./helpers/seed.js');

const qs = new URLSearchParams(TEST_CTX).toString();
async function api(path: string) {
  const res = await handle(new Request(`http://x${path}`));
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  await migrate(await getDb());
});

describe('API de subida de nivel', () => {
  it('lista las 9 profesiones con datos de Wowhead y su procedencia', async () => {
    const r = await api('/api/leveling/professions?version=forever');
    expect(r.status).toBe(200);
    expect(r.json.professions.map((p: any) => p.id).sort((a: number, b: number) => a - b)).toEqual([129, 164, 165, 171, 185, 186, 197, 202, 333]);
    for (const p of r.json.professions) {
      expect(p.sourceUrl).toMatch(/^https:\/\/www\.wowhead\.com\/forever\/spells\//);
      expect(p.defaultTo).toBeLessThanOrEqual(300);
    }
  });

  it('sin precios cargados no inventa costos: todo el tramo queda sin datos', async () => {
    const r = await api(`/api/leveling?${qs}&profession=197&from=1&to=20`);
    expect(r.status).toBe(200);
    expect(r.json.incomplete).toBe(true);
    expect(r.json.steps.every((s: any) => s.recipe === null && s.cost === null)).toBe(true);
    expect(r.json.steps[0].missingItems.length).toBeGreaterThan(0);
  });

  it('con un precio manual para Paño de lino (2589), Sastrería 1→20 tiene receta y costo', async () => {
    const r = await api(`/api/leveling?${qs}&profession=197&from=1&to=20&manual=2589:0.01`);
    expect(r.status).toBe(200);
    const first = r.json.steps[0];
    expect(first.recipe).not.toBeNull();
    expect(first.materials.every((m: any) => m.priceSource === 'manual')).toBe(true);
  });

  it('valida profesión, rango y precios manuales', async () => {
    expect((await api(`/api/leveling?${qs}&profession=182&from=1&to=20`)).status).toBe(404); // Herboristería: se sube recolectando
    expect((await api(`/api/leveling?${qs}&profession=197&from=20&to=20`)).status).toBe(400);
    expect((await api(`/api/leveling?${qs}&profession=197&from=1&to=999`)).status).toBe(400);
    expect((await api(`/api/leveling?${qs}&profession=197&manual=abc`)).status).toBe(400);
    expect(() => parseManualPrices('2589:-1')).toThrow();
    expect(parseManualPrices('2589:1.5').get(2589)!.toDecimal(0)).toBe('15000');
  });

  it('disponibilidad: instructor por fuente 6; inicial solo sin fuente, naranja desde 0 y ≤ 50', () => {
    expect(availabilityOf({ source: [6], colors: [1, 2, 3, 4], learnedAt: 1 })).toBe('instructor');
    expect(availabilityOf({ source: [], colors: [0, 25, 37, 50], learnedAt: 25 })).toBe('inicial');
    expect(availabilityOf({ source: [], colors: [0, 300, 305, 310], learnedAt: 230 })).toBe('otra');
    expect(availabilityOf({ source: [5], colors: [0, 10, 12, 15], learnedAt: 10 })).toBe('otra');
  });
});
