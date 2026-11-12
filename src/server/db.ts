/**
 * Capa mínima de acceso a PostgreSQL.
 * - Producción / Supabase: DATABASE_URL (postgres.js; usar el pooler de transacciones, puerto 6543).
 * - Desarrollo y pruebas sin Supabase: PGlite (PostgreSQL embebido) con DATABASE_URL=pglite:<ruta>|memory.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  /** Ejecuta varias sentencias sin parámetros (migraciones). */
  exec(text: string): Promise<void>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: 'postgres' | 'pglite';
}

let shared: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!shared) {
    let url = process.env.DATABASE_URL ?? '';
    if (!url && !process.env.VERCEL && process.env.NODE_ENV !== 'production') {
      url = 'pglite:./data/pglite';
      console.warn('[db] DATABASE_URL no definido: usando PostgreSQL embebido (PGlite) en ./data/pglite para desarrollo.');
    }
    // Si una consulta se queda colgada, se descarta el pool y la siguiente petición abre uno nuevo.
    shared = openDb(url, { onStuck: () => { shared = null; } }).then(async (db) => {
      if (db.kind === 'pglite') await migrate(db);
      return db;
    });
  }
  return shared;
}

/** Tiempo máximo de una lectura fuera de transacción (las ingestas en transacción no se limitan). */
const QUERY_TIMEOUT_MS = Number(process.env.DATABASE_QUERY_TIMEOUT_MS ?? 30000);

export async function openDb(url: string, opts: { onStuck?: () => void } = {}): Promise<Db> {
  if (!url) {
    throw new Error('Falta DATABASE_URL. Usa la cadena de conexión de Supabase o "pglite:./data/pglite" para desarrollo local.');
  }
  if (url.startsWith('pglite:')) return openPglite(url.slice('pglite:'.length));
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, {
    prepare: false, // obligatorio con el pooler de transacciones de Supabase
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    types: { bigint: postgres.BigInt },
    onnotice: () => {},
  });
  // Con el pooler de transacciones se observaron consultas que nunca terminan (el servidor queda en
  // ClientRead esperando el resto del mensaje). Sin límite, ocupan el pool para siempre y la API deja de
  // responder; con él, la petición falla con un error visible y el pool se reemplaza.
  let stuck = false;
  const timed = <T>(p: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new Error(`La base de datos no respondió en ${QUERY_TIMEOUT_MS / 1000} s. Vuelve a intentarlo.`));
        if (!stuck) {
          stuck = true;
          console.error('[db] consulta colgada: se descarta el pool de conexiones');
          opts.onStuck?.();
          sql.end({ timeout: 0 }).catch(() => {});
        }
      }, QUERY_TIMEOUT_MS);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  const wrap = (s: any, inTx = false): Db => ({
    kind: 'postgres',
    query: async (text, params = []) => {
      const q = s.unsafe(text, params as any[]) as Promise<any>;
      return (inTx ? await q : await timed(q)) as any;
    },
    exec: async (text) => { await s.unsafe(text); },
    tx: (fn) => sql.begin((t: any) => fn(wrap(t, true))) as any,
    close: () => sql.end(),
  });
  return wrap(sql);
}

async function openPglite(where: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = where === 'memory' || where === '' ? undefined : path.resolve(where);
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  const wrap = (c: any): Db => ({
    kind: 'pglite',
    query: async (text, params = []) => (await c.query(text, params)).rows,
    exec: async (text) => { await c.exec(text); },
    tx: (fn) => (c.transaction ? c.transaction((t: any) => fn(wrap(t))) : fn(wrap(c))),
    close: () => (c.close ? c.close() : Promise.resolve()),
  });
  return wrap(pg);
}

/** Aplica supabase/migrations/*.sql en orden, registrándolas en schema_migrations. */
export async function migrate(db: Db, dir = path.resolve('supabase/migrations')): Promise<string[]> {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  await db.query('alter table schema_migrations enable row level security');
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sqlText = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.tx(async (t) => {
      await t.exec(sqlText);
      await t.query('insert into schema_migrations(name) values ($1)', [f]);
    });
    applied.push(f);
  }
  return applied;
}

export const toBig = (v: unknown): bigint | null =>
  v === null || v === undefined ? null : typeof v === 'bigint' ? v : BigInt(String(v).split('.')[0]);
export const toNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
