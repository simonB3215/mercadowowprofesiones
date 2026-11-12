import { describe, it, expect } from 'vitest';
import { openDb, migrate } from '../src/server/db.js';

describe('Migraciones', () => {
  it('se aplican sobre PostgreSQL embebido y son idempotentes', async () => {
    const db = await openDb('pglite:memory');
    const first = await migrate(db);
    expect(first.length).toBeGreaterThan(0);
    expect(await migrate(db)).toEqual([]);
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('recipe','price_row','ledger_entry')");
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    await db.close();
  });
});
