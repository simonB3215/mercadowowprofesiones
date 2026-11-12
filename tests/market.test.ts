import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { openDb, migrate, type Db } from '../src/server/db.js';
import { ingest, loadSnapshot } from '../src/server/market.js';
import { parseTsmCsv } from '../src/server/providers/tsm.js';

// Muestras reales de WoW Forever descargadas de TSM (ver docs/VALIDACION_FUENTES.md).
const fx = (f: string) => fs.readFileSync(`tests/fixtures/${f}`, 'utf8');
const REALM = 'forever_realm_normal-alliance_sample.csv';
const REGION = 'forever_region_sample.csv';
let db: Db;
const na = { version: 'forever', region: 'us', realm: 'normal-alliance' };

beforeAll(async () => {
  db = await openDb('pglite:memory');
  await migrate(db);
});

describe('Parser TSM (muestras reales de WoW Forever)', () => {
  it('lee la casa de subastas: cobre entero, fecha de escaneo y sin rechazos', () => {
    const p = parseTsmCsv('realm_items', fx(REALM));
    expect(p.rejected).toBe(0);
    expect(p.rows.length).toBeGreaterThan(20);
    expect(p.sourceTime).toMatch(/^2026-/);
    expect(p.rows.every((r) => r.marketValue === null || typeof r.marketValue === 'bigint')).toBe(true);
  });
  it('lee nombres entrecomillados con comas', () => {
    const p = parseTsmCsv('region_items', fx(REGION));
    expect(p.rejected).toBe(0);
    expect(p.rows.some((r) => (r.name ?? '').includes(','))).toBe(true);
  });
  it('rechaza cabeceras inesperadas', () => {
    expect(() => parseTsmCsv('region_items', fx(REALM))).toThrow(/Cabecera inesperada/);
  });
  it('minBuyout 0 se guarda como null, no como precio gratuito', () => {
    const p = parseTsmCsv('realm_items', 'itemId,name,marketValue,minBuyout,recent,historical,updatedAt\n5,X,100,0,0,90,2026-11-11T00:00:00Z\n');
    expect(p.rows[0].minBuyout).toBeNull();
    expect(p.rows[0].marketValue).toBe(100n);
  });
});

describe('Ingesta atómica', () => {
  it('importa y activa casa de subastas y región', async () => {
    expect((await ingest(db, na, 'realm_items', { text: fx(REALM) })).status).toBe('ok');
    expect((await ingest(db, na, 'region_items', { text: fx(REGION) })).status).toBe('ok');
    const s = await loadSnapshot(db, na);
    expect(s.local.size).toBeGreaterThan(0);
    expect(s.region.size).toBeGreaterThan(0);
    expect(s.runs.realm_items!.scope).toBe('casa de subastas');
  });

  it('un fallo de sincronización conserva el último lote válido', async () => {
    const before = await loadSnapshot(db, na);
    const failing = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
    const r = await ingest(db, na, 'realm_items', { fetchImpl: failing });
    expect(r.status).toBe('failed');
    const after = await loadSnapshot(db, na);
    expect(after.runs.realm_items!.id).toBe(before.runs.realm_items!.id);
    expect(after.lastAttempt.realm_items!.status).toBe('failed');
    expect(after.local.size).toBe(before.local.size);
  });

  it('un archivo con cabecera incorrecta se rechaza sin activar', async () => {
    const r = await ingest(db, na, 'realm_items', { text: 'a,b\n1,2\n' });
    expect(r.status).toBe('rejected');
    const s = await loadSnapshot(db, na);
    expect(s.runs.realm_items!.status).toBe('ok');
  });

  it('cambiar de casa de subastas o de región no mezcla datos', async () => {
    const horde = await loadSnapshot(db, { version: 'forever', region: 'us', realm: 'normal-horde' });
    expect(horde.runs.realm_items).toBeUndefined();
    expect(horde.local.size).toBe(0);
    expect(horde.runs.region_items).toBeDefined(); // las estadísticas regionales son comunes
    const eu = await loadSnapshot(db, { version: 'forever', region: 'eu', realm: 'normal-alliance' });
    expect(Object.keys(eu.runs)).toEqual([]);
  });

  it('reimportar conserva como máximo dos lotes con filas', async () => {
    for (let i = 0; i < 3; i++) await ingest(db, na, 'realm_items', { text: fx(REALM) });
    const rows = await db.query<{ c: number }>(
      `select count(distinct run_id)::int as c from price_row p join ingestion_run r on r.id=p.run_id where r.file_kind='realm_items'`);
    expect(Number(rows[0].c)).toBeLessThanOrEqual(2);
  });
});
