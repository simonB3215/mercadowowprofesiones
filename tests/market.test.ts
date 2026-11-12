import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { openDb, migrate, type Db } from '../src/server/db.js';
import { ingest, loadSnapshot } from '../src/server/market.js';
import { parseTsmCsv } from '../src/server/providers/tsm.js';

const fx = (f: string) => fs.readFileSync(`tests/fixtures/${f}`, 'utf8');
let db: Db;
const us = { version: 'retail', region: 'us', realm: 'area-52' };

beforeAll(async () => {
  db = await openDb('pglite:memory');
  await migrate(db);
});

describe('Parser TSM (muestras reales)', () => {
  it('lee nombres entrecomillados con comas y comillas', () => {
    const p = parseTsmCsv('commodities', fx('tsm_commodities_sample.csv'));
    const vantus = p.rows.find((r) => r.itemId === 204860)!;
    expect(vantus.name).toBe('Vantus Rune: Aberrus, the Shadowed Crucible');
    expect(p.rows.find((r) => r.itemId === 168310)!.name).toBe('Mech-Dowel\'s "Big Mech"');
    expect(p.rejected).toBe(0);
    expect(p.sourceTime).toMatch(/^2026-/);
  });
  it('rangos de calidad tienen itemId propios con el mismo nombre', () => {
    const p = parseTsmCsv('commodities', fx('tsm_commodities_sample.csv'));
    const bismuth = p.rows.filter((r) => r.name === 'Bismuth').map((r) => r.itemId).sort();
    expect(bismuth).toEqual([210930, 210931, 210932]);
  });
  it('rechaza cabeceras inesperadas', () => {
    expect(() => parseTsmCsv('region_items', fx('tsm_commodities_sample.csv'))).toThrow(/Cabecera inesperada/);
  });
  it('minBuyout 0 se guarda como null, no como precio gratuito', () => {
    const p = parseTsmCsv('commodities', 'itemId,name,marketValue,minBuyout,recent,historical,updatedAt\n5,X,100,0,0,90,2026-11-11T00:00:00Z\n');
    expect(p.rows[0].minBuyout).toBeNull();
    expect(p.rows[0].marketValue).toBe(100n);
  });
});

describe('Ingesta atómica', () => {
  it('importa y activa los tres archivos', async () => {
    expect((await ingest(db, us, 'commodities', { text: fx('tsm_commodities_sample.csv') })).status).toBe('ok');
    expect((await ingest(db, us, 'realm_items', { text: fx('tsm_realm_sample.csv') })).status).toBe('ok');
    expect((await ingest(db, us, 'region_items', { text: fx('tsm_region_sample.csv') })).status).toBe('ok');
    const s = await loadSnapshot(db, us);
    expect(s.local.get(210930)!.kind).toBe('commodities');
    expect(s.region.get(210930)!.saleRate).toBeGreaterThan(0);
    expect(s.runs.realm_items!.scope).toBe('reino');
  });

  it('un fallo de sincronización conserva el último lote válido', async () => {
    const before = await loadSnapshot(db, us);
    const failing = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
    const r = await ingest(db, us, 'commodities', { fetchImpl: failing });
    expect(r.status).toBe('failed');
    const after = await loadSnapshot(db, us);
    expect(after.runs.commodities!.id).toBe(before.runs.commodities!.id);
    expect(after.lastAttempt.commodities!.status).toBe('failed');
    expect(after.local.size).toBe(before.local.size);
  });

  it('un archivo con cabecera incorrecta se rechaza sin activar', async () => {
    const r = await ingest(db, us, 'realm_items', { text: 'a,b\n1,2\n' });
    expect(r.status).toBe('rejected');
    const s = await loadSnapshot(db, us);
    expect(s.runs.realm_items!.status).toBe('ok');
  });

  it('cambiar de reino o región no mezcla datos', async () => {
    const other = await loadSnapshot(db, { version: 'retail', region: 'us', realm: 'ragnaros' });
    expect(other.runs.realm_items).toBeUndefined();
    expect(other.runs.commodities).toBeDefined(); // commodities son regionales
    const eu = await loadSnapshot(db, { version: 'retail', region: 'eu', realm: 'area-52' });
    expect(Object.keys(eu.runs)).toEqual([]);
    expect(eu.local.size).toBe(0);
  });

  it('reimportar conserva como máximo dos lotes con filas', async () => {
    for (let i = 0; i < 3; i++) await ingest(db, us, 'commodities', { text: fx('tsm_commodities_sample.csv') });
    const rows = await db.query<{ c: number }>(
      `select count(distinct run_id)::int as c from price_row p join ingestion_run r on r.id=p.run_id where r.file_kind='commodities'`);
    expect(Number(rows[0].c)).toBeLessThanOrEqual(2);
  });
});
