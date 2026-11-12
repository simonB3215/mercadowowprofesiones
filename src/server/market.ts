/**
 * Ingesta atómica de precios y lectura del lote activo por contexto de mercado.
 * Si una importación falla, el lote activo anterior permanece (PB-05).
 */
import type { Db } from './db.js';
import { toBig, toNum } from './db.js';
import { fetchTsm, parseTsmCsv, tsmUrl, TsmHttpError, type FileKind, type PriceRow } from './providers/tsm.js';
import { VERSIONS } from './config.js';

export interface MarketContext {
  version: string;
  region: string;
  realm: string | null;
}

export function contextKey(c: MarketContext) {
  return `${c.version}:${c.region}:${c.realm ?? '-'}`;
}

export function validateContext(c: Partial<MarketContext>): MarketContext {
  const v = VERSIONS.find((x) => x.id === c.version);
  if (!v) throw new HttpError(400, 'Versión no disponible. Esta aplicación solo trabaja con WoW Forever.');
  if (!c.region || !v.regions.includes(c.region)) throw new HttpError(400, 'Región no soportada para esta versión.');
  const realm = c.realm ? String(c.realm).toLowerCase() : null;
  if (realm && !/^[a-z0-9-]{2,64}$/.test(realm)) throw new HttpError(400, 'Slug de reino inválido.');
  return { version: v.id, region: c.region, realm };
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

const KEEP_RUNS = 2;
const MIN_VALID_RATIO = 0.95;

export interface IngestResult {
  runId: number;
  status: 'ok' | 'failed' | 'rejected';
  rowsValid: number;
  rowsRejected: number;
  error?: string;
  sourceTime?: string | null;
}

/** Descarga, valida y activa un archivo de forma atómica. */
export async function ingest(
  db: Db,
  ctx: MarketContext,
  kind: FileKind,
  opts: { fetchImpl?: typeof fetch; text?: string; provider?: string; sourceUrl?: string; storeRaw?: (key: string, text: string) => Promise<string | null> } = {},
): Promise<IngestResult> {
  const version = VERSIONS.find((v) => v.id === ctx.version)!;
  const realm = kind === 'realm_items' ? ctx.realm : null;
  const url = opts.sourceUrl ?? tsmUrl(version.tsmGameType, ctx.region, kind, realm ?? undefined);
  const [run] = await db.query<{ id: number }>(
    `insert into ingestion_run (provider, game_version, region, realm, file_kind, source_url, status)
     values ($1,$2,$3,$4,$5,$6,'staging') returning id`,
    [opts.provider ?? 'tsm', ctx.version, ctx.region, realm, kind, url],
  );
  const runId = Number(run.id);
  const fail = async (status: 'failed' | 'rejected', error: string, extra: Partial<{ rows_valid: number; rows_rejected: number; checksum: string; bytes: number }> = {}) => {
    await db.query(
      `update ingestion_run set status=$2, error=$3, finished_at=now(), rows_valid=$4, rows_rejected=$5, checksum=$6, bytes=$7 where id=$1`,
      [runId, status, error, extra.rows_valid ?? 0, extra.rows_rejected ?? 0, extra.checksum ?? null, extra.bytes ?? null],
    );
    return { runId, status, rowsValid: extra.rows_valid ?? 0, rowsRejected: extra.rows_rejected ?? 0, error };
  };
  let text: string;
  try {
    text = opts.text ?? (await fetchTsm(url!, opts.fetchImpl));
  } catch (e) {
    return fail('failed', (e as Error).message);
  }
  let parsed;
  try {
    parsed = parseTsmCsv(kind, text);
  } catch (e) {
    return fail('rejected', (e as Error).message);
  }
  const total = parsed.rows.length + parsed.rejected;
  if (!parsed.rows.length || parsed.rows.length / total < MIN_VALID_RATIO) {
    return fail('rejected', `Demasiadas filas inválidas (${parsed.rejected}/${total}). ${parsed.rejectSamples.join('; ')}`, {
      rows_valid: parsed.rows.length, rows_rejected: parsed.rejected, checksum: parsed.checksum, bytes: parsed.bytes,
    });
  }
  let rawPath: string | null = null;
  if (opts.storeRaw) {
    try {
      rawPath = await opts.storeRaw(`${ctx.version}/${ctx.region}/${realm ?? '_region'}/${kind}/${runId}.csv`, text);
    } catch {
      rawPath = null; // el archivo original es opcional; el checksum queda registrado
    }
  }
  try {
    await db.tx(async (t) => {
      await insertRows(t, runId, parsed.rows);
      await t.query(
        `update ingestion_run set active=false where active and game_version=$1 and region=$2 and coalesce(realm,'')=coalesce($3,'') and file_kind=$4`,
        [ctx.version, ctx.region, realm, kind],
      );
      await t.query(
        `update ingestion_run set status='ok', active=true, finished_at=now(), source_time=$2, checksum=$3, bytes=$4,
           rows_valid=$5, rows_rejected=$6, raw_path=$7, error=$8 where id=$1`,
        [runId, parsed.sourceTime, parsed.checksum, parsed.bytes, parsed.rows.length, parsed.rejected, rawPath,
          parsed.rejected ? `Filas rechazadas: ${parsed.rejectSamples.join('; ')}` : null],
      );
    });
  } catch (e) {
    return fail('failed', `Error al guardar: ${(e as Error).message}`);
  }
  await prune(db, ctx, kind, realm);
  return { runId, status: 'ok', rowsValid: parsed.rows.length, rowsRejected: parsed.rejected, sourceTime: parsed.sourceTime };
}

async function insertRows(db: Db, runId: number, rows: PriceRow[]) {
  const CHUNK = 4000;
  const s = (v: bigint | null) => (v === null ? null : v.toString());
  for (let i = 0; i < rows.length; i += CHUNK) {
    const c = rows.slice(i, i + CHUNK);
    await db.query(
      `insert into price_row (run_id,item_id,name,market_value,min_buyout,recent,historical,avg_sale_price,sale_rate,sold_per_day)
       select $1, * from unnest($2::int[], $3::text[], $4::bigint[], $5::bigint[], $6::bigint[], $7::bigint[], $8::bigint[], $9::numeric[], $10::numeric[])`,
      [runId, c.map((r) => r.itemId), c.map((r) => r.name), c.map((r) => s(r.marketValue)), c.map((r) => s(r.minBuyout)),
        c.map((r) => s(r.recent)), c.map((r) => s(r.historical)), c.map((r) => s(r.avgSalePrice)), c.map((r) => r.saleRate), c.map((r) => r.soldPerDay)],
    );
  }
}

/** Conserva solo los últimos lotes válidos; los registros de ejecuciones fallidas se mantienen (sin filas). */
async function prune(db: Db, ctx: MarketContext, kind: FileKind, realm: string | null) {
  await db.query(
    `delete from price_row where run_id in (
       select id from ingestion_run where game_version=$1 and region=$2 and coalesce(realm,'')=coalesce($3,'') and file_kind=$4
         and status='ok' and not active and id not in (
           select id from ingestion_run where game_version=$1 and region=$2 and coalesce(realm,'')=coalesce($3,'') and file_kind=$4 and status='ok'
           order by id desc limit $5))`,
    [ctx.version, ctx.region, realm, kind, KEEP_RUNS],
  );
}

export const HISTORY_DAYS = 14;
const HISTORY_KEEP_DAYS = 60;

/**
 * Historial propio (casas cargadas desde Blizzard, que solo dan la foto actual):
 * suma la carga al día UTC de su escaneo y rellena `historical` del lote con la media
 * de los promedios diarios de los últimos 14 días. Una misma foto (mismo escaneo) cuenta una sola vez.
 */
export async function recordHistory(db: Db, ctx: MarketContext, runId: number): Promise<{ recorded: boolean; days: number }> {
  if (!ctx.realm) return { recorded: false, days: 0 };
  const [run] = await db.query<{ source_time: string | null }>(`select source_time from ingestion_run where id=$1`, [runId]);
  if (!run?.source_time) return { recorded: false, days: 0 };
  const dup = await db.query(
    `select 1 from ingestion_run where id<>$1 and status='ok' and game_version=$2 and region=$3 and realm=$4
       and file_kind='realm_items' and provider='blizzard' and source_time=$5 limit 1`,
    [runId, ctx.version, ctx.region, ctx.realm, run.source_time],
  );
  const recorded = dup.length === 0;
  await db.tx(async (t) => {
    if (recorded) {
      await t.query(
        `insert into price_history (game_version, region, realm, item_id, day, samples, market_value_sum, min_buyout_min)
         select $2, $3, $4, p.item_id, (r.source_time at time zone 'UTC')::date, 1, p.market_value, p.min_buyout
         from price_row p join ingestion_run r on r.id = p.run_id
         where p.run_id = $1 and p.market_value is not null
         on conflict (game_version, region, realm, item_id, day) do update set
           samples = price_history.samples + 1,
           market_value_sum = price_history.market_value_sum + excluded.market_value_sum,
           min_buyout_min = least(price_history.min_buyout_min, excluded.min_buyout_min)`,
        [runId, ctx.version, ctx.region, ctx.realm],
      );
    }
    await t.query(
      `update price_row p set historical = h.v from (
         select item_id, floor(avg(market_value_sum / samples))::bigint as v from price_history
         where game_version=$2 and region=$3 and realm=$4
           and day > (select (source_time at time zone 'UTC')::date from ingestion_run where id=$1) - $5::int
         group by item_id) h
       where p.run_id = $1 and p.item_id = h.item_id`,
      [runId, ctx.version, ctx.region, ctx.realm, HISTORY_DAYS],
    );
    await t.query(`delete from price_history where game_version=$1 and region=$2 and realm=$3 and day < current_date - $4::int`,
      [ctx.version, ctx.region, ctx.realm, HISTORY_KEEP_DAYS]);
  });
  const [d] = await db.query<{ c: number }>(
    `select count(distinct day)::int as c from price_history where game_version=$1 and region=$2 and realm=$3`,
    [ctx.version, ctx.region, ctx.realm],
  );
  return { recorded, days: Number(d?.c ?? 0) };
}

export interface RunInfo {
  id: number;
  kind: FileKind;
  status: string;
  sourceTime: string | null;
  fetchedAt: string | null;
  rows: number;
  scope: 'casa de subastas' | 'region';
  provider: string;
}

export interface MarketSnapshot {
  ctx: MarketContext;
  runs: Partial<Record<FileKind, RunInfo>>;
  lastAttempt: Partial<Record<FileKind, { status: string; at: string; error: string | null }>>;
  /** itemId → precios de la casa de subastas elegida (modo de juego + facción). */
  local: Map<number, { kind: 'realm_items'; marketValue: bigint | null; minBuyout: bigint | null; recent: bigint | null; historical: bigint | null; name: string | null }>;
  region: Map<number, { marketValue: bigint | null; historical: bigint | null; avgSalePrice: bigint | null; saleRate: number | null; soldPerDay: number | null; name: string | null }>;
}

const iso = (v: any) => (v ? new Date(v).toISOString() : null);

export async function loadSnapshot(db: Db, ctx: MarketContext, itemIds?: number[]): Promise<MarketSnapshot> {
  const runs = await db.query<any>(
    `select id, provider, file_kind, status, source_time, finished_at, rows_valid from ingestion_run
     where active and game_version=$1 and region=$2 and (file_kind<>'realm_items' or realm=$3)`,
    [ctx.version, ctx.region, ctx.realm],
  );
  const attempts = await db.query<any>(
    `select distinct on (file_kind) file_kind, status, started_at, error from ingestion_run
     where game_version=$1 and region=$2 and (file_kind<>'realm_items' or realm=$3) order by file_kind, id desc`,
    [ctx.version, ctx.region, ctx.realm],
  );
  const snap: MarketSnapshot = { ctx, runs: {}, lastAttempt: {}, local: new Map(), region: new Map() };
  for (const a of attempts) snap.lastAttempt[a.file_kind as FileKind] = { status: a.status, at: iso(a.started_at)!, error: a.error };
  for (const r of runs) {
    snap.runs[r.file_kind as FileKind] = {
      id: Number(r.id), kind: r.file_kind, status: r.status, sourceTime: iso(r.source_time), fetchedAt: iso(r.finished_at),
      rows: Number(r.rows_valid), scope: r.file_kind === 'realm_items' ? 'casa de subastas' : 'region', provider: r.provider,
    };
  }
  const ids = runs.map((r) => Number(r.id));
  if (!ids.length) return snap;
  const filter = itemIds ? ' and item_id = any($2::int[])' : '';
  const params: unknown[] = [ids];
  if (itemIds) params.push(itemIds);
  const rows = await db.query<any>(
    `select p.run_id, p.item_id, p.name, p.market_value, p.min_buyout, p.recent, p.historical, p.avg_sale_price, p.sale_rate, p.sold_per_day
     from price_row p where run_id = any($1::bigint[])${filter}`,
    params,
  );
  const kindById = new Map(runs.map((r) => [Number(r.id), r.file_kind as FileKind]));
  for (const r of rows) {
    const k = kindById.get(Number(r.run_id))!;
    const id = Number(r.item_id);
    if (k === 'region_items') {
      snap.region.set(id, {
        marketValue: toBig(r.market_value), historical: toBig(r.historical), avgSalePrice: toBig(r.avg_sale_price),
        saleRate: toNum(r.sale_rate), soldPerDay: toNum(r.sold_per_day), name: r.name,
      });
    } else {
      snap.local.set(id, { kind: k, marketValue: toBig(r.market_value), minBuyout: toBig(r.min_buyout), recent: toBig(r.recent), historical: toBig(r.historical), name: r.name });
    }
  }
  return snap;
}

export function ageHours(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return (now - Date.parse(iso)) / 3600000;
}

export { TsmHttpError };
