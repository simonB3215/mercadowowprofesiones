import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.DATABASE_URL = 'pglite:memory';
const { getDb, migrate } = await import('../src/server/db.js');
const { handle } = await import('../src/server/router.js');
const { setVendorPrices, vendorUnitPrice } = await import('../src/server/vendorItems.js');
const { parseItemXml } = await import('../scripts/sync-vendor-items.js');
const { TEST_CTX } = await import('./helpers/seed.js');

const qs = new URLSearchParams(TEST_CTX).toString();
async function api(path: string) {
  const res = await handle(new Request(`http://x${path}`));
  return { status: res.status, json: await res.json() };
}
const materials = (j: any) => j.steps.flatMap((s: any) => s.materials ?? []);

beforeAll(async () => { await migrate(await getDb()); });
afterAll(() => setVendorPrices(null));

describe('precios de vendedor (D35)', () => {
  it('lee fuentes y precio del XML de Wowhead; sin bloque JSON no inventa', () => {
    const xml = '<json><![CDATA["id":2320,"source":[5]]]></json><jsonEquip><![CDATA["avgbuyout":139,"buyprice":10,"sellprice":2]]></jsonEquip>';
    expect(parseItemXml(xml)).toEqual({ sources: [5], buyPrice: 10 });
    expect(parseItemXml('<json><![CDATA["source":[1,2,16]]]></json>')).toEqual({ sources: [1, 2, 16], buyPrice: null });
    expect(parseItemXml('<html>403</html>')).toBeNull();
  });

  it('el precio por unidad divide el precio del lote', () => {
    setVendorPrices({ 3371: { price: 20, lot: 5 } });
    expect(vendorUnitPrice(3371)!.toDecimal(0)).toBe('4');
    expect(vendorUnitPrice(2320)).toBeNull();
  });

  it('sin casa de subastas, un material de vendedor tiene precio y procedencia «vendedor»; el manual manda', async () => {
    setVendorPrices({ 2320: { price: 10, lot: 1 } });
    const r = await api(`/api/leveling?${qs}&profession=197&from=1&to=60&manual=2589:0.01,2996:0.02`);
    expect(r.status).toBe(200);
    const thread = materials(r.json).filter((m: any) => m.itemId === 2320);
    expect(thread.length).toBeGreaterThan(0);
    expect(thread.every((m: any) => m.priceSource === 'vendedor')).toBe(true);
    expect(r.json.source.vendor.items).toBe(1);

    const m = await api(`/api/leveling?${qs}&profession=197&from=1&to=60&manual=2589:0.01,2996:0.02,2320:0.5`);
    expect(materials(m.json).filter((x: any) => x.itemId === 2320).every((x: any) => x.priceSource === 'manual')).toBe(true);
  });

  it('sin precio de vendedor, el material sigue sin datos (nunca gratis)', async () => {
    setVendorPrices({});
    const r = await api(`/api/leveling?${qs}&profession=197&from=1&to=60&manual=2589:0.01,2996:0.02`);
    expect(materials(r.json).some((m: any) => m.itemId === 2320 && m.priceSource === 'vendedor')).toBe(false);
  });
});

describe('vendedores restringidos (D35)', () => {
  it('descarta el vendedor si la subasta cuesta más del triple, y los de reputación', async () => {
    const { bestBuyPrice, REPUTATION_VENDOR } = await import('../src/server/vendorItems.js');
    const { Q } = await import('../src/engine/rational.js');
    setVendorPrices({ 2320: { price: 10, lot: 1 }, 11382: { price: 3000, lot: 1 }, 248822: { price: 6000, lot: 1 } });
    expect(bestBuyPrice(2320, Q.of(13))).toMatchObject({ source: 'vendedor' });
    expect(bestBuyPrice(2320, Q.of(30)).source).toBe('vendedor');          // justo el triple: aún vale
    expect(bestBuyPrice(2320, Q.of(8)).source).toBe('casa de subastas');   // subasta más barata
    expect(bestBuyPrice(248822, Q.of(170000)).source).toBe('casa de subastas'); // 28× → vendedor restringido
    expect(REPUTATION_VENDOR.has(11382)).toBe(true);
    expect(vendorUnitPrice(11382)).toBeNull();
    expect(bestBuyPrice(2320, null).source).toBe('vendedor');
    expect(bestBuyPrice(99999, null)).toEqual({ copper: null, source: 'sin datos' });
  });
});
