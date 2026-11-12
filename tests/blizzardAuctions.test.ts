import { describe, it, expect } from 'vitest';
import { marketValue, summarize, toCsv, fetchHouseCsv } from '../src/server/providers/blizzardAuctions.js';
import { parseTsmCsv } from '../src/server/providers/tsm.js';
import { openDb, migrate } from '../src/server/db.js';
import { ingest, loadSnapshot, recordHistory } from '../src/server/market.js';
import { FOREVER_REALMS, commissionFor, DEFAULT_SETTINGS, findHouse } from '../src/server/config.js';
import type { BlizzardClient } from '../src/server/providers/blizzard.js';

const L = (unit: number, qty: number) => ({ unit: BigInt(unit), qty: BigInt(qty) });

describe('Resumen de la casa de subastas de Blizzard', () => {
  it('valor de mercado: media ponderada del 15 % más barato del volumen', () => {
    // 100 unidades → se promedian las 15 más baratas: 10 a 100 y 5 a 200.
    expect(marketValue([L(1000, 85), L(200, 5), L(100, 10)])).toBe(133n);
  });
  it('con poco volumen usa al menos una unidad (la más barata)', () => {
    expect(marketValue([L(500, 1), L(900, 1)])).toBe(500n);
    expect(marketValue([])).toBeNull();
  });
  it('une subastas y commodities, ignora las que no tienen compra inmediata y divide el buyout por la cantidad', () => {
    const by = summarize(
      [{ item: { id: 7 }, buyout: 1000, quantity: 2 }, { item: { id: 7 }, bid: 10, quantity: 1 }, { item: { id: 8, bonus_lists: [1] }, buyout: 300, quantity: 1 }],
      [{ item: { id: 7 }, unit_price: 400, quantity: 3 }],
    );
    expect(by.get(7)).toEqual([L(500, 2), L(400, 3)]);
    expect(by.get(8)).toEqual([L(300, 1)]);
  });
  it('genera el CSV por casa de TSM: el parser lo acepta, sin historical', () => {
    const csv = toCsv(summarize([{ item: { id: 5 }, buyout: 700, quantity: 1 }], [{ item: { id: 3 }, unit_price: 90, quantity: 20 }]), '2026-11-12T10:00:00Z');
    const p = parseTsmCsv('realm_items', csv);
    expect(p.rejected).toBe(0);
    expect(p.rows.map((r) => [r.itemId, r.minBuyout, r.marketValue, r.historical])).toEqual([[3, 90n, 90n, null], [5, 700n, 700n, null]]);
    expect(p.sourceTime).toBe('2026-11-12T10:00:00Z');
  });
});

describe('Casas de subastas de WoW Forever', () => {
  it('cuatro modos × Alianza, Horda y Aguasnegras, con ids de Blizzard únicos', () => {
    expect(FOREVER_REALMS).toHaveLength(12);
    expect(new Set(FOREVER_REALMS.map((r) => r.blizzardHouseId)).size).toBe(12);
    expect(findHouse('normal-alliance')!.blizzardHouseId).toBe(111);
    expect(findHouse('pvp-aguasnegras')!.faction).toBe('neutral');
    expect(findHouse('roleplay-aguasnegras')!.tsm).toBe(false);
  });
  it('Aguasnegras usa su propia comisión', () => {
    expect(commissionFor(DEFAULT_SETTINGS, 'normal-horde')).toBe('0.05');
    expect(commissionFor(DEFAULT_SETTINGS, 'normal-aguasnegras')).toBe('0.15');
  });
  it('descarga la casa y la ingiere como lote de Blizzard', async () => {
    const client: BlizzardClient = {
      region: 'us',
      get: async () => ({}),
      getRaw: async (path) => path.endsWith('/commodities')
        ? { json: { auctions: [{ item: { id: 2589 }, unit_price: 25, quantity: 40 }] }, lastModified: 'Thu, 12 Nov 2026 10:05:00 GMT' }
        : { json: { auctions: [{ item: { id: 2589 }, buyout: 30, quantity: 1 }] }, lastModified: 'Thu, 12 Nov 2026 10:00:00 GMT' },
    };
    const { text, url } = await fetchHouseCsv(client, 117);
    expect(url).toContain('/auctions/117?namespace=dynamic-forever-us');
    const db = await openDb('pglite:memory');
    await migrate(db);
    const ctx = { version: 'forever', region: 'us', realm: 'normal-aguasnegras' };
    expect((await ingest(db, ctx, 'realm_items', { text, provider: 'blizzard', sourceUrl: url })).status).toBe('ok');
    const s = await loadSnapshot(db, ctx);
    expect(s.runs.realm_items!.provider).toBe('blizzard');
    expect(s.runs.realm_items!.sourceTime).toBe('2026-11-12T10:05:00.000Z');
    expect(s.local.get(2589)!.minBuyout).toBe(25n);
  });
});

describe('Historial propio de la casa de subastas', () => {
  const ctx = { version: 'forever', region: 'us', realm: 'pvp-horde' };
  const csv = (rows: Array<[number, number]>, at: string) =>
    'itemId,name,marketValue,minBuyout,recent,historical,updatedAt\n' + rows.map(([id, mv]) => `${id},,${mv},${mv},${mv},,${at}`).join('\n') + '\n';
  const load = async (db: any, rows: Array<[number, number]>, at: string) => {
    const r = await ingest(db, ctx, 'realm_items', { text: csv(rows, at), provider: 'blizzard' });
    return { r, h: await recordHistory(db, ctx, r.runId) };
  };

  it('promedia por día, no cuenta dos veces la misma foto y rellena historical', async () => {
    const db = await openDb('pglite:memory');
    await migrate(db);
    await load(db, [[1, 100]], '2026-11-10T10:00:00Z');
    await load(db, [[1, 300]], '2026-11-10T11:00:00Z'); // día 10: media 200
    const again = await load(db, [[1, 300]], '2026-11-10T11:00:00Z'); // misma foto: no suma
    expect(again.h.recorded).toBe(false);
    const { h } = await load(db, [[1, 500], [2, 70]], '2026-11-11T09:00:00Z'); // día 11: 500
    expect(h).toEqual({ recorded: true, days: 2 });
    const s = await loadSnapshot(db, ctx);
    expect(s.local.get(1)!.historical).toBe(350n); // (200 + 500) / 2
    expect(s.local.get(2)!.historical).toBe(70n);
  });
});
