/**
 * API interna. Un único manejador Web (Request → Response) que usan
 * la función de Vercel (api/index.ts) y el servidor local (scripts/dev-server.ts).
 */
import { getDb, type Db } from './db.js';
import { VERSIONS, REGION_LABEL, DEFAULT_SETTINGS, PRICE_FIELD_LABEL, findHouse, commissionFor, type Settings } from './config.js';
import { HttpError, ingest, recordHistory, itemHistory, loadSnapshot, validateContext, ageHours, type MarketContext } from './market.js';
import { tsmUrl, type FileKind } from './providers/tsm.js';
import { hasBlizzardCredentials, createBlizzardClient } from './providers/blizzard.js';
import { fetchHouseCsv } from './providers/blizzardAuctions.js';
import { buildEvalContext, evaluateRecipe, loadRecipes, loadSettings, resolvePrice, type Overrides, type Profile, type Evaluation } from './evaluate.js';
import { requiredProfessions, PROFESSION_ES } from './catalog/rules.js';
import { Q, COPPER_PER_GOLD } from '../engine/rational.js';
import { buildPlan, resolveSourcing, type CraftOption } from '../engine/calc.js';
import { buyOrCraft } from '../engine/buyOrCraft.js';
import { buildItemTooltip } from './itemTooltip.js';
import { transmutations } from './transmutations.js';
import { potions, potionVerdict, POTION_KINDS, type PotionKind, type PotionVerdict } from './potions.js';
import { gameChanges, patchNotes } from './gameChanges.js';
import { cooldownLabel, durationLabel, minTimeForRuns } from '../engine/cooldown.js';
import { storeRaw } from './storage.js';
import { loadAssets, type IconSize } from './assets.js';
import { levelingProfessions, levelingPlan, parseManualPrices, routePlan, knownSpellIds, learnInfo, itemCrafting, quickLearn } from './leveling.js';
import { battlenetConfig, currentSession, requireSession, startLogin, finishLogin, disconnect, redirectUri, profileNamespaces, checkSameOrigin, syncCharacters, syncProfessions, syncCharacterProfile, ownedCharacter, characterProfessions } from './battlenet.js';
import { authRequired, isAuthenticated, checkPassword, sessionCookie, clearCookie, isOpenRequest } from './auth.js';

type Handler = (req: Request, params: Record<string, string>, url: URL, db: Db) => Promise<unknown>;
const routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Handler }> = [];
function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, pattern, keys, handler });
}

export function jsonReplacer(_k: string, v: unknown) {
  return typeof v === 'bigint' ? v.toString() : v;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, jsonReplacer), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function body(req: Request): Promise<any> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > 1_000_000) throw new HttpError(413, 'Petición demasiado grande.');
  const t = await req.text();
  if (t.length > 1_000_000) throw new HttpError(413, 'Petición demasiado grande.');
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

function ctxFrom(u: URL | Record<string, any>): MarketContext {
  const get = (k: string) => (u instanceof URL ? u.searchParams.get(k) ?? undefined : u[k]);
  return validateContext({ version: get('version'), region: get('region'), realm: get('realm') || null });
}

const uuidRe = /^[0-9a-f-]{36}$/i;
async function loadProfile(db: Db, id: string | null | undefined): Promise<Profile | null> {
  if (!id) return null;
  if (!uuidRe.test(id)) throw new HttpError(400, 'Identificador de perfil inválido.');
  const r = await db.query<any>(`select id, name, data, updated_at from character_profile where id=$1`, [id]);
  if (!r.length) throw new HttpError(404, 'Perfil no encontrado.');
  return { ...(r[0].data ?? {}), id: r[0].id, name: r[0].name, updatedAt: new Date(r[0].updated_at).toISOString() };
}

const int = (v: string | null | undefined, def?: number) => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(400, `Entero inválido: ${v}`);
  return n;
};

// ---------------------------------------------------------------------------
// Metadatos, mercado y sincronización
// ---------------------------------------------------------------------------

/** Iconos verificados por id (capa central de recursos visuales, ver src/server/assets.ts). */
route('GET', '/api/assets', async (_r, _p, u, db) => {
  const ids = (k: string) => (u.searchParams.get(k) ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 300);
  const size = (['small', 'medium', 'large'] as IconSize[]).find((x) => x === u.searchParams.get('size')) ?? 'medium';
  return loadAssets(db, 'forever', ids('items'), ids('professions'), size);
});

route('GET', '/api/meta', async (_r, _p, _u, db) => {
  const settings = await loadSettings(db);
  const catalog = await db.query<any>(`select game_version, status, started_at, finished_at, stats, error from catalog_run order by id desc limit 5`);
  const counts = await db.query<any>(`select game_version, count(*)::int as recipes from recipe group by game_version`);
  return {
    versions: VERSIONS.map(({ blizzardNamespace, ...v }) => v),
    regions: REGION_LABEL,
    settings,
    defaults: DEFAULT_SETTINGS,
    priceFields: PRICE_FIELD_LABEL,
    blizzardConfigured: hasBlizzardCredentials(),
    catalog: { runs: catalog, recipes: Object.fromEntries(counts.map((c) => [c.game_version, Number(c.recipes)])) },
  };
});

route('GET', '/api/realms', async (_r, _p, u, db) => {
  const version = u.searchParams.get('version') ?? 'forever';
  const region = u.searchParams.get('region') ?? '';
  const rows = await db.query<any>(`select slug, name, source from realm where game_version=$1 and region=$2 order by name`, [version, region]);
  const v = VERSIONS.find((x) => x.id === version);
  const fixed = (v?.fixedRealms ?? []).map((r) => ({ slug: r.slug, name: r.name, source: 'fijo', faction: r.faction, tsm: r.tsm }));
  return { realms: [...fixed, ...rows.filter((r) => !fixed.some((f) => f.slug === r.slug))], realmLabel: v?.realmLabel ?? 'Reino' };
});

route('POST', '/api/realms', async (req, _p, _u, db) => {
  const b = await body(req);
  const ctx = ctxFrom(b);
  if (!ctx.realm) throw new HttpError(400, 'Indica el slug de la casa de subastas (por ejemplo, normal-alliance).');
  const v = VERSIONS.find((x) => x.id === ctx.version)!;
  const url = tsmUrl(v.tsmGameType!, ctx.region, 'realm_items', ctx.realm);
  const res = await fetch(url, { method: 'HEAD' });
  if (res.status === 404) throw new HttpError(404, `TSM no publica la casa de subastas "${ctx.realm}" de WoW Forever en ${ctx.region.toUpperCase()}.`);
  if (!res.ok) throw new HttpError(502, `No se pudo comprobar la casa de subastas en TSM (HTTP ${res.status}).`);
  const name = String(b.name || ctx.realm);
  await db.query(
    `insert into realm (game_version,region,slug,name,source) values ($1,$2,$3,$4,'usuario') on conflict (game_version,region,slug) do nothing`,
    [ctx.version, ctx.region, ctx.realm, name.slice(0, 80)],
  );
  return { ok: true, realm: { slug: ctx.realm, name } };
});

/** Archivos de TSM del contexto (WoW Forever no tiene commodities). */
function fileKinds(ctx: MarketContext): FileKind[] {
  return ['region_items', ...(ctx.realm ? (['realm_items'] as FileKind[]) : [])];
}

async function marketStatus(db: Db, ctx: MarketContext) {
  const snap = await loadSnapshot(db, ctx, []);
  const settings = await loadSettings(db);
  const kinds = fileKinds(ctx);
  return {
    ctx,
    files: kinds.map((k) => {
      const run = snap.runs[k];
      const age = ageHours(run?.sourceTime);
      const max = k === 'region_items' ? settings.maxAgeHoursRegion : settings.maxAgeHoursRealm;
      return {
        kind: k,
        scope: k === 'realm_items' ? 'casa de subastas' : 'región',
        label: k === 'region_items' ? 'Estadísticas regionales (TSM)' : `Casa de subastas ${findHouse(ctx.realm)?.name ?? ctx.realm}`,
        active: run ?? null,
        sourceAgeHours: age,
        stale: age === null ? null : age > max,
        maxAgeHours: max,
        lastAttempt: snap.lastAttempt[k] ?? null,
      };
    }),
  };
}

route('GET', '/api/market/status', async (_r, _p, u, db) => marketStatus(db, ctxFrom(u)));

/** Blizzard renueva la foto cada hora; con 50 min el cron horario no se salta ninguna. */
const MIN_REFETCH_MIN = 50;
const REGION_REFETCH_MIN = 6 * 60;

/**
 * Precios de la casa de subastas: Blizzard (foto actual de la casa, incluida Aguasnegras) si hay credenciales;
 * si falla o no hay credenciales, TSM, que solo publica las casas Normal y JcJ de Alianza y Horda.
 */
async function ingestHouse(db: Db, ctx: MarketContext) {
  const house = findHouse(ctx.realm);
  let blizzardError: string | null = null;
  if (house && hasBlizzardCredentials()) {
    try {
      const { text, url } = await fetchHouseCsv(createBlizzardClient(ctx.region), house.blizzardHouseId);
      const r = await ingest(db, ctx, 'realm_items', { text, provider: 'blizzard', sourceUrl: url, storeRaw });
      if (r.status !== 'ok') return r;
      return { ...r, history: await recordHistory(db, ctx, r.runId) };
    } catch (e) {
      blizzardError = (e as Error).message;
    }
  }
  if (!house || house.tsm) {
    const r = await ingest(db, ctx, 'realm_items', { storeRaw });
    return blizzardError ? { ...r, blizzardError } : r;
  }
  return { status: 'failed', error: blizzardError ?? 'Esta casa de subastas solo está disponible con la API de Blizzard: configura BLIZZARD_CLIENT_ID y BLIZZARD_CLIENT_SECRET.' };
}

export async function syncPrices(db: Db, ctx: MarketContext, force = false) {
  const kinds = fileKinds(ctx);
  const results: Record<string, unknown> = {};
  for (const k of kinds) {
    const last = await db.query<any>(
      `select finished_at from ingestion_run where status='ok' and game_version=$1 and region=$2 and file_kind=$3 and coalesce(realm,'')=coalesce($4,'') order by id desc limit 1`,
      [ctx.version, ctx.region, k, k === 'realm_items' ? ctx.realm : null],
    );
    const mins = last[0] ? (Date.now() - new Date(last[0].finished_at).getTime()) / 60000 : Infinity;
    // Las estadísticas regionales de TSM cambian como mucho unas veces al día: no se piden cada hora.
    if (!force && mins < (k === 'region_items' ? REGION_REFETCH_MIN : MIN_REFETCH_MIN)) {
      results[k] = { status: 'omitido', reason: `Descargado hace ${Math.round(mins)} min; las fuentes se actualizan cada hora o más.` };
      continue;
    }
    results[k] = k === 'realm_items' ? await ingestHouse(db, ctx) : await ingest(db, ctx, k, { storeRaw });
  }
  // Registrar el contexto para el cron.
  const key = `${ctx.version}|${ctx.region}|${ctx.realm ?? ''}`;
  const cur = await db.query<any>(`select value from app_setting where key='tracked_contexts'`);
  const list: string[] = cur[0]?.value ?? [];
  if (!list.includes(key)) {
    list.unshift(key);
    await db.query(`insert into app_setting(key,value) values ('tracked_contexts',$1::text::jsonb) on conflict (key) do update set value=excluded.value, updated_at=now()`, [JSON.stringify(list.slice(0, 10))]);
  }
  return results;
}

route('POST', '/api/sync/prices', async (req, _p, _u, db) => {
  const b = await body(req);
  return { results: await syncPrices(db, ctxFrom(b), Boolean(b.force)), status: await marketStatus(db, ctxFrom(b)) };
});

route('GET', '/api/cron/sync-prices', async (req, _p, _u, db) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'No autorizado.');
  const cur = await db.query<any>(`select value from app_setting where key='tracked_contexts'`);
  const list: string[] = cur[0]?.value ?? [];
  const out: Record<string, unknown> = {};
  for (const key of list) {
    const [version, region, realm] = key.split('|');
    if (version !== 'forever') continue; // contextos antiguos de otras versiones: se ignoran
    try {
      out[key] = await syncPrices(db, validateContext({ version, region, realm: realm || null }));
    } catch (e) {
      out[key] = { error: (e as Error).message };
    }
  }
  return { synced: out };
});

// ---------------------------------------------------------------------------
// Catálogo y cobertura
// ---------------------------------------------------------------------------

route('GET', '/api/professions', async (_r, _p, u, db) => {
  const version = u.searchParams.get('version') ?? 'forever';
  const rows = await db.query<any>(
    `select p.id, p.name, p.name_en, p.kind, count(r.id)::int as recipes,
            count(r.id) filter (where r.fetch_error is null)::int as complete
     from profession p left join recipe r on r.game_version=p.game_version and r.profession_id=p.id
     where p.game_version=$1 group by p.id, p.name, p.name_en, p.kind order by p.name`,
    [version],
  );
  const present = new Set(rows.map((r) => r.name_en));
  const missing = requiredProfessions(version).filter((n) => !present.has(n)).map((n) => ({ name: PROFESSION_ES[n] ?? n, name_en: n }));
  const expansions = await db.query<any>(
    `select expansion, count(*)::int as tiers from skill_tier where game_version=$1 group by expansion order by expansion`, [version]);
  return { professions: rows, missingRequired: missing, expansions };
});

route('GET', '/api/coverage', async (_r, _p, u, db) => {
  const version = u.searchParams.get('version') ?? 'forever';
  const rows = await db.query<any>(
    `select p.name as profession, p.kind, coalesce(t.expansion,'Sin clasificar') as expansion,
            count(r.id)::int as total,
            count(r.id) filter (where r.fetch_error is null and r.raw is not null
              and exists (select 1 from recipe_reagent g where g.game_version=r.game_version and g.recipe_id=r.id)
              and r.qty_min is not null and r.qty_min = r.qty_max)::int as complete,
            count(r.id) filter (where r.fetch_error is not null)::int as with_errors,
            count(r.id) filter (where r.qty_min is not null and r.qty_min <> r.qty_max)::int as variable_yield,
            count(r.id) filter (where r.crafted_item_id is null and r.alliance_item_id is null and r.horde_item_id is null)::int as no_item,
            count(r.id) filter (where not exists (select 1 from recipe_reagent g where g.game_version=r.game_version and g.recipe_id=r.id))::int as no_reagents
     from profession p
     left join recipe r on r.game_version=p.game_version and r.profession_id=p.id
     left join skill_tier t on t.game_version=r.game_version and t.id=r.skill_tier_id
     where p.game_version=$1
     group by p.name, p.kind, coalesce(t.expansion,'Sin clasificar') order by p.name, expansion`,
    [version],
  );
  const items = await db.query<any>(
    `select count(*)::int as total, count(*) filter (where fetch_error is not null)::int as errors from item where game_version=$1`, [version]);
  const errors = await db.query<any>(
    `select fetch_error as reason, count(*)::int as n from recipe where game_version=$1 and fetch_error is not null group by fetch_error order by n desc limit 20`, [version]);
  const runs = await db.query<any>(`select status, started_at, finished_at, stats, error from catalog_run where game_version=$1 order by id desc limit 1`, [version]);
  return { rows, items: items[0], errors, lastRun: runs[0] ?? null, blizzardConfigured: hasBlizzardCredentials() };
});

// ---------------------------------------------------------------------------
// Oportunidades y detalle
// ---------------------------------------------------------------------------

/** Margen = ganancia por unidad ÷ precio de venta (en %). null si falta alguno o el precio es 0. */
const marginOf = (e: Evaluation): Q | null =>
  e.profit.profitUnit && e.sellPrice.copper && e.sellPrice.copper.sign() > 0 ? e.profit.profitUnit.div(e.sellPrice.copper).mul(Q.of(100)) : null;
const numQ = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? null : Q.parse(n.toFixed(6)));

const metricKey = (e: Evaluation, sort: string): Q | null => {
  if (sort === 'roi') return e.profit.roiPct;
  if (sort === 'margin') return marginOf(e);
  if (sort === 'soldPerDay') return numQ(e.demand?.soldPerDay);
  if (sort === 'saleRate') return numQ(e.demand?.saleRate);
  if (sort === 'profitBatch') return e.profit.profitBatch;
  if (sort === 'profitHour') return e.profitHour;
  if (sort === 'cost') return e.cost.unit;
  return e.profit.profitUnit;
};

/** Lista de ids de receta («1,2,3»), como mucho 200 (favoritas). undefined si no se pide. */
function idsParam(v: string | null): number[] | undefined {
  if (v === null) return undefined;
  const ids = v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length > 200) throw new HttpError(400, 'Como mucho 200 recetas.');
  return ids;
}

route('GET', '/api/opportunities', async (_r, _p, u, db) => {
  const ctx = ctxFrom(u);
  const profile = await loadProfile(db, u.searchParams.get('profileId'));
  const recipes = await loadRecipes(db, ctx.version, {
    professionId: int(u.searchParams.get('professionId')),
    expansion: u.searchParams.get('expansion') || undefined,
    search: (u.searchParams.get('search') || '').slice(0, 80) || undefined,
    recipeIds: idsParam(u.searchParams.get('ids')),
  });
  const ectx = await buildEvalContext(db, ctx, recipes, profile);
  let list = recipes.map((r) => evaluateRecipe(r, ectx));
  if (u.searchParams.get('onlyKnown') === '1') list = list.filter((e) => e.character === 'conoce');
  if (u.searchParams.get('hideUnsellable') === '1') list = list.filter((e) => e.channel !== 'vinculado' && e.channel !== 'servicio');
  const quality = u.searchParams.get('quality');
  if (quality) list = list.filter((e) => (e.output?.quality ?? 'DESCONOCIDA') === quality);
  // El recuento por estado se hace con el resto de filtros pero sin el de estado: así el usuario ve cuántas hay de cada uno
  // aunque esté mirando solo uno (las tarjetas del comparador sirven para cambiar de estado).
  const counts: Record<string, number> = {};
  for (const e of list) counts[e.status] = (counts[e.status] ?? 0) + 1;
  // Veredicto sencillo (el mismo que «Pociones»): ¿conviene fabricarla para vender?
  const verdicts: Record<PotionVerdict, number> = { si: 0, poco: 0, dudoso: 0, no: 0, sin_datos: 0 };
  for (const e of list) verdicts[potionVerdict(e)]++;
  const statusF = u.searchParams.get('status');
  if (statusF) list = list.filter((e) => statusF.split(',').includes(e.status));
  const sort = u.searchParams.get('sort') ?? 'profitUnit';
  const dir = u.searchParams.get('dir') === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    // Con un precio de venta atípico la ganancia no es fiable: va detrás de las confirmadas (salvo al ordenar por costo).
    if (sort !== 'cost' && !a.sellCheck !== !b.sellCheck) return a.sellCheck ? 1 : -1;
    const x = metricKey(a, sort);
    const y = metricKey(b, sort);
    if (!x && !y) return a.name.localeCompare(b.name);
    if (!x) return 1; // los valores ausentes van siempre al final, nunca como cero
    if (!y) return -1;
    return x.cmp(y) * dir;
  });
  const rowById = new Map(recipes.map((r) => [r.id, r]));
  const learnOf = (id: number) => {
    const r = rowById.get(id);
    return r ? quickLearn(ctx.version, r.profession_id, r.crafted_item_id, ectx.required?.get(id) ?? []) : null;
  };
  // Exportar (CSV) pide la lista entera filtrada de una vez; la tabla va por páginas.
  const pageSize = Math.max(1, Math.min(u.searchParams.get('export') === '1' ? 5000 : 200, int(u.searchParams.get('pageSize'), 50)!));
  const page = Math.max(1, int(u.searchParams.get('page'), 1)!);
  const slice = list.slice((page - 1) * pageSize, page * pageSize);
  return {
    ctx,
    total: list.length,
    page,
    pageSize,
    counts,
    verdicts,
    market: { runs: ectx.snap.runs },
    profile: profile ? { id: profile.id, name: profile.name } : null,
    items: slice.map((e) => ({
      verdict: potionVerdict(e), learn: learnOf(e.recipeId),
      recipeId: e.recipeId, name: e.name, profession: e.profession, professionId: e.professionId, expansion: e.expansion, output: e.output,
      unitsPerRun: e.unitsPerRun, yieldRange: e.yieldRange, costUnit: e.cost.unit, sellPrice: e.sellPrice.copper, sellScope: e.sellPrice.scope, sellSupply: e.sellPrice.supply ?? null,
      sellCheck: e.sellCheck ? { kind: e.sellCheck.kind, ratio: e.sellCheck.ratio } : null, cooldown: e.cooldown, castSeconds: e.castSeconds, profitHour: e.profitHour,
      profitUnit: e.profit.profitUnit, profitBatch: e.profit.profitBatch, roiPct: e.profit.roiPct, roiUndefined: e.profit.roiUndefined, marginPct: marginOf(e),
      demand: e.demand, noSales: e.noSales, sourceTime: e.sellPrice.sourceTime, freshness: e.freshness, status: e.status, reasons: e.reasons, channel: e.channel, character: e.character,
    })),
  };
});

async function sourcingFor(db: Db, ctx: MarketContext, ev: Evaluation, profile: Profile | null) {
  // Carga recetas que producen los materiales (hasta 4 niveles) para comparar comprar vs fabricar.
  const byOutput = new Map<number, Array<{ id: number; name: string; units: number | null; reagents: Array<{ itemKey: string; quantity: number }>; known: boolean | null; prof: number }>>();
  let frontier = ev.reagents.map((r) => r.itemId);
  const seen = new Set<number>();
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    frontier = frontier.filter((x) => !seen.has(x));
    frontier.forEach((x) => seen.add(x));
    if (!frontier.length) break;
    const rs = await db.query<any>(
      `select r.id, r.name, r.crafted_item_id, r.qty_min, r.qty_max, r.profession_id from recipe r where r.game_version=$1 and r.crafted_item_id = any($2::int[]) and r.fetch_error is null`,
      [ctx.version, frontier],
    );
    if (!rs.length) break;
    const rg = await db.query<any>(`select recipe_id, item_id, quantity from recipe_reagent where game_version=$1 and recipe_id = any($2::int[])`, [ctx.version, rs.map((r) => r.id)]);
    const next: number[] = [];
    for (const r of rs) {
      const reagents = rg.filter((g) => Number(g.recipe_id) === Number(r.id) && g.quantity !== null).map((g) => ({ itemKey: String(g.item_id), quantity: Number(g.quantity) }));
      reagents.forEach((g) => next.push(Number(g.itemKey)));
      const units = r.qty_min !== null && r.qty_min === r.qty_max ? Number(r.qty_min) : null;
      const known = profile ? (profile.knownRecipes ?? []).includes(Number(r.id)) : null;
      const arr = byOutput.get(Number(r.crafted_item_id)) ?? [];
      arr.push({ id: Number(r.id), name: r.name, units, reagents, known, prof: Number(r.profession_id) });
      byOutput.set(Number(r.crafted_item_id), arr);
    }
    frontier = next;
  }
  const allIds = new Set<number>([...seen]);
  for (const arr of byOutput.values()) for (const r of arr) r.reagents.forEach((g) => allIds.add(Number(g.itemKey)));
  const snap = await loadSnapshot(db, ctx, [...allIds]);
  const settings = await loadSettings(db);
  const buy = (k: string) => resolvePrice(snap, Number(k), settings.buySource).copper;
  // Solo recetas accesibles: con perfil, las conocidas; sin perfil, todas pero marcadas como sin confirmar.
  const craftable = (k: string): CraftOption[] =>
    (byOutput.get(Number(k)) ?? [])
      .filter((r) => r.units !== null && (profile ? r.known : true))
      .map((r) => ({ recipeId: String(r.id), name: r.name, unitsPerRun: r.units!, reagents: r.reagents }));
  return ev.reagents.map((r) => ({
    itemId: r.itemId,
    name: r.name,
    node: resolveSourcing(String(r.itemId), buy, craftable),
    recipesAvailable: (byOutput.get(r.itemId) ?? []).length,
    accessibility: profile ? 'según recetas conocidas del perfil' : 'sin perfil: accesibilidad sin confirmar',
  }));
}

async function evaluateOne(db: Db, ctx: MarketContext, recipeId: number, profileId: string | null, ov: Overrides) {
  const profile = await loadProfile(db, profileId);
  const recipes = await loadRecipes(db, ctx.version, { recipeIds: [recipeId] });
  if (!recipes.length) throw new HttpError(404, 'Receta no encontrada en el catálogo de esta versión.');
  const ectx = await buildEvalContext(db, ctx, recipes, profile);
  const base = evaluateRecipe(recipes[0], ectx);
  const hasOv = Object.values(ov ?? {}).some((v) => v !== undefined && v !== '' && !(typeof v === 'object' && v && !Object.keys(v).length));
  const scenario = hasOv ? evaluateRecipe(recipes[0], ectx, ov) : null;
  const raw = await db.query<any>(`select raw from recipe where game_version=$1 and id=$2`, [ctx.version, recipeId]);
  return { base, scenario, profile, ectx, rawRecipe: raw[0]?.raw ?? null };
}

route('GET', '/api/recipes/:id', async (_r, p, u, db) => {
  const ctx = ctxFrom(u);
  const { base, profile, ectx, rawRecipe } = await evaluateOne(db, ctx, int(p.id)!, u.searchParams.get('profileId'), {});
  const sourcing = await sourcingFor(db, ctx, base, profile);
  const learn = await learnInfo(db, ctx.version, int(p.id)!);
  return { evaluation: base, sourcing, learn, market: ectx.snap.runs, settings: { ...ectx.settings, commission: commissionFor(ectx.settings, ctx.realm) }, rawRecipe };
});

// ---------------------------------------------------------------------------
// ¿Comprar el objeto o fabricarlo? (para usarlo, no para venderlo)
// ---------------------------------------------------------------------------

async function buyOrCraftFor(db: Db, ctx: MarketContext, recipeId: number, quantity: number, profile: Profile | null) {
  const recipes = await loadRecipes(db, ctx.version, { recipeIds: [recipeId] });
  if (!recipes.length) throw new HttpError(404, 'Receta no encontrada en el catálogo de esta versión.');
  const ectx = await buildEvalContext(db, ctx, recipes, profile);
  const ev = evaluateRecipe(recipes[0], ectx);
  const sourcing = await sourcingFor(db, ctx, ev, profile);
  const learn = await learnInfo(db, ctx.version, recipeId);
  const outId = ev.output?.itemId ?? null;
  const buy = outId !== null ? resolvePrice(ectx.snap, outId, ectx.settings.buySource) : null;
  const cheapest = outId !== null ? resolvePrice(ectx.snap, outId, 'minBuyout') : null;
  // Costo por unidad fabricando: cada material por lo más barato entre comprarlo o fabricarlo.
  let craftUnit: Q | null = null;
  const complete = ev.unitsPerRun !== null && ev.reagents.length > 0 && ev.reagents.every((r) => r.quantity !== null);
  if (complete) {
    let total: Q | null = Q.zero;
    for (const r of ev.reagents) {
      const n = sourcing.find((s) => s.itemId === r.itemId)?.node;
      total = total && n?.unitCost ? total.add(n.unitCost.mul(r.quantity!)) : null;
    }
    craftUnit = total ? total.div(ev.unitsPerRun!) : null;
  }
  // Lo que cuesta aprender la receta: instructor, objeto de receta del vendedor o, si no, su precio en la subasta.
  let learnCost: Q | null = null;
  let learnFrom: 'instructor' | 'vendedor' | 'subasta' | 'inicial' | null = null;
  if (learn?.availability === 'inicial') { learnCost = Q.zero; learnFrom = 'inicial'; }
  else if (learn?.availability === 'instructor') { learnCost = Q.parse(learn.trainingCost); learnFrom = 'instructor'; }
  else if (learn?.recipeItem) {
    if (learn.recipeItem.buyPrice) { learnCost = Q.parse(learn.recipeItem.buyPrice); learnFrom = 'vendedor'; }
    else {
      const p = resolvePrice(ectx.snap, learn.recipeItem.itemId, ectx.settings.buySource).copper;
      if (p) { learnCost = p; learnFrom = 'subasta'; }
    }
  }
  // Sin perfil no se sabe si la conoces: se compara sin aprenderla y se indica desde cuántas unidades compensaría.
  const needsLearning = ev.character === 'no_conoce' || ev.character === 'requisito_no_cumplido';
  const result = buyOrCraft({
    quantity, buyUnit: buy?.copper ?? null, buyAvailable: buy?.supply?.quantity ?? null,
    canBuy: ev.channel !== 'vinculado', craftUnit, learnCost, needsLearning,
  });
  if (ev.channel === 'servicio') result.reasons.unshift('La receta no produce un objeto: no hay nada que comprar.');
  return {
    recipeId: ev.recipeId, name: ev.name, profession: ev.profession, professionId: ev.professionId, output: ev.output, unitsPerRun: ev.unitsPerRun, quantity,
    buyUnit: buy?.copper ?? null, buyField: buy?.field ?? null, buyScope: buy?.scope ?? null, buySupply: buy?.supply ?? null,
    cheapestNow: cheapest?.copper ?? null, craftUnit, character: ev.character, needsLearning,
    learn: learn ? { availability: learn.availability, cost: learnCost, from: learnFrom, learnedAt: learn.learnedAt, recipeItem: learn.recipeItem } : null,
    materials: ev.reagents.map((r) => {
      const n = sourcing.find((s) => s.itemId === r.itemId)?.node;
      return { itemId: r.itemId, name: r.name, quantity: r.quantity, choice: n?.choice ?? 'sin_datos', unitCost: n?.unitCost ?? null, owned: r.owned };
    }),
    ...result,
  };
}

function quantityParam(u: URL) {
  const n = int(u.searchParams.get('qty'), 1)!;
  if (n < 1 || n > 10000) throw new HttpError(400, 'La cantidad debe estar entre 1 y 10000.');
  return n;
}

/** Cambios del juego: mejoras, empeoramientos y correcciones de clases y razas (foros oficiales de Blizzard). */
route('GET', '/api/game-changes', async (_r, _p, _u, db) => gameChanges(db));
/** Notas completas de los últimos hotfixes de WoW Forever (página de inicio). */
route('GET', '/api/patch-notes', async (_r, _p, u, db) => patchNotes(db, { days: Number(u.searchParams.get('days')) || 3 }));

/** Transmutaciones y demás recetas con reutilización, con la ganancia por fabricación y el oro al día. */
route('GET', '/api/transmutations', async (_r, _p, u, db) => {
  const ctx = ctxFrom(u);
  const profile = await loadProfile(db, u.searchParams.get('profileId'));
  return { ctx, profile: profile ? { id: profile.id, name: profile.name } : null, ...(await transmutations(db, ctx, profile)) };
});

/** Pociones, elíxires y frascos de Alquimia: los más vendidos en la región y si sigue saliendo a cuenta fabricarlos para vender. */
route('GET', '/api/potions', async (_r, _p, u, db) => {
  const ctx = ctxFrom(u);
  const profile = await loadProfile(db, u.searchParams.get('profileId'));
  const k = u.searchParams.get('kind') ?? 'todas';
  if (k !== 'todas' && !(k in POTION_KINDS)) throw new HttpError(400, 'Tipo inválido: «pociones», «elixires», «frascos» o «todas».');
  return { ctx, profile: profile ? { id: profile.id, name: profile.name } : null, ...(await potions(db, ctx, profile, k as PotionKind | 'todas')) };
});

/** Comprar o fabricar por receta (recipeId) o por objeto (itemId: compara todas las recetas que lo fabrican). */
route('GET', '/api/buy-or-craft', async (_r, _p, u, db) => {
  const ctx = ctxFrom(u);
  const qty = quantityParam(u);
  const profile = await loadProfile(db, u.searchParams.get('profileId'));
  const recipeId = int(u.searchParams.get('recipeId'));
  const itemId = int(u.searchParams.get('itemId'));
  let ids: number[];
  if (recipeId) ids = [recipeId];
  else if (itemId) {
    const rs = await db.query<any>(
      `select id from recipe where game_version=$1 and fetch_error is null and (crafted_item_id=$2 or alliance_item_id=$2 or horde_item_id=$2) order by id limit 10`, [ctx.version, itemId]);
    ids = rs.map((r) => Number(r.id));
  } else throw new HttpError(400, 'Indica recipeId o itemId.');
  const options = [];
  for (const id of ids) options.push(await buyOrCraftFor(db, ctx, id, qty, profile));
  // Primero la receta más barata de fabricar (las que no tienen precio, al final).
  options.sort((a, b) => (!a.craftTotal ? 1 : !b.craftTotal ? -1 : a.craftTotal.cmp(b.craftTotal)));
  let item = null;
  if (itemId) {
    const it = await db.query<any>(`select id, name, quality from item where game_version=$1 and id=$2`, [ctx.version, itemId]);
    item = it[0] ? { itemId: Number(it[0].id), name: it[0].name, quality: it[0].quality } : { itemId, name: null, quality: null };
  }
  return { ctx, quantity: qty, item, profile: profile ? { id: profile.id, name: profile.name } : null, options };
});

route('POST', '/api/calculate', async (req, _p, _u, db) => {
  const b = await body(req);
  const ctx = ctxFrom(b);
  const ov: Overrides = b.overrides ?? {};
  try {
    const { base, scenario } = await evaluateOne(db, ctx, Number(b.recipeId), b.profileId ?? null, ov);
    return { base, scenario };
  } catch (e) {
    if (e instanceof RangeError) throw new HttpError(400, `Valor inválido: ${e.message}`);
    throw e;
  }
});

// ---------------------------------------------------------------------------
// Materiales: vender o usar (PB-24)
// ---------------------------------------------------------------------------

route('GET', '/api/materials/:id', async (_r, p, u, db) => {
  const ctx = ctxFrom(u);
  const itemId = int(p.id)!;
  const settings = await loadSettings(db);
  const commission = Q.parse(commissionFor(settings, ctx.realm));
  const uses = await db.query<any>(`select distinct recipe_id from recipe_reagent where game_version=$1 and item_id=$2`, [ctx.version, itemId]);
  const recipes = await loadRecipes(db, ctx.version, { recipeIds: uses.map((x) => Number(x.recipe_id)) });
  const ectx = await buildEvalContext(db, ctx, recipes, null, settings);
  const own = resolvePrice(ectx.snap, itemId, settings.sellSource);
  const sellNet = own.copper ? own.copper.mul(Q.one.sub(commission)) : null;
  const alternatives = recipes.map((r) => {
    const ev = evaluateRecipe(r, ectx);
    const me = ev.reagents.find((x) => x.itemId === itemId);
    // Valor por unidad del material = (ingreso neto − costo del resto de materiales) / cantidad usada.
    let perUnit: Q | null = null;
    const others = ev.reagents.filter((x) => x.itemId !== itemId);
    const othersCost = others.every((x) => x.subtotal) ? others.reduce((a, x) => a.add(x.subtotal!), Q.zero) : null;
    if (ev.profit.netRevenue && othersCost && me?.quantity && ev.status !== 'datos_insuficientes' && ev.status !== 'no_vendible') {
      perUnit = ev.profit.netRevenue.sub(othersCost).div(me.quantity * ev.runs);
    }
    return { recipeId: ev.recipeId, name: ev.name, profession: ev.profession, status: ev.status, quantity: me?.quantity ?? null, valuePerUnit: perUnit, reasons: ev.reasons };
  });
  alternatives.sort((a, b) => (!a.valuePerUnit ? 1 : !b.valuePerUnit ? -1 : b.valuePerUnit.cmp(a.valuePerUnit)));
  const item = ectx.items.get(itemId);
  return { itemId, name: item?.name ?? ectx.snap.local.get(itemId)?.name ?? null, price: own, sellNet, alternatives, commission: commissionFor(settings, ctx.realm) };
});

/** Descripción del objeto para la ventana al pasar el ratón; con casa de subastas, también su precio ahí. */
route('GET', '/api/items/:id/tooltip', async (_r, p, u, db) => {
  const version = u.searchParams.get('version') ?? 'forever';
  const itemId = int(p.id);
  if (!itemId || itemId <= 0) throw new HttpError(400, 'Objeto inválido.');
  const rows = await db.query<any>(`select id, name, quality, item_class, item_subclass, raw from item where game_version=$1 and id=$2`, [version, itemId]);
  if (!rows.length) throw new HttpError(404, 'Objeto no encontrado en el catálogo.');
  const tip = buildItemTooltip({ ...rows[0], id: Number(rows[0].id) });
  let market: { price: Q | null; field: string; scope: string; supply: unknown } | null = null;
  if (u.searchParams.get('region')) {
    const ctx = ctxFrom(u);
    const snap = await loadSnapshot(db, ctx, [itemId]);
    const settings = await loadSettings(db);
    const pr = resolvePrice(snap, itemId, settings.buySource);
    market = { price: pr.copper, field: pr.field, scope: pr.scope, supply: pr.supply ?? null };
  }
  return { ...tip, market, crafting: await itemCrafting(db, version, itemId) };
});

/** Cómo se fabrica un objeto: recetas que lo crean (profesión, nivel y cómo se aprende) y en cuántas es material. */
route('GET', '/api/items/:id/crafting', async (_r, p, u, db) => {
  const itemId = int(p.id);
  if (!itemId || itemId <= 0) throw new HttpError(400, 'Objeto inválido.');
  return itemCrafting(db, u.searchParams.get('version') ?? 'forever', itemId);
});

/** Historial diario del precio de un objeto en la casa elegida (solo casas cargadas desde Blizzard). */
route('GET', '/api/items/:id/history', async (_r, p, u, db) => {
  const ctx = ctxFrom(u);
  const itemId = int(p.id);
  if (!itemId || itemId <= 0) throw new HttpError(400, 'Objeto inválido.');
  const days = Math.min(60, Math.max(7, int(u.searchParams.get('days') ?? '30') ?? 30));
  return { itemId, days, realm: ctx.realm, history: await itemHistory(db, ctx, itemId, days) };
});

route('GET', '/api/materials', async (_r, _p, u, db) => {
  const version = u.searchParams.get('version') ?? 'forever';
  const search = (u.searchParams.get('search') ?? '').toLowerCase().slice(0, 60);
  const rows = await db.query<any>(
    `select g.item_id, coalesce(i.name, 'Objeto ' || g.item_id) as name, count(distinct g.recipe_id)::int as uses,
            bool_or(p.kind = 'recoleccion') as gathered_prof
     from recipe_reagent g left join item i on i.game_version=g.game_version and i.id=g.item_id
     left join recipe r on r.game_version=g.game_version and r.crafted_item_id=g.item_id
     left join profession p on p.game_version=r.game_version and p.id=r.profession_id
     where g.game_version=$1 and ($2 = '' or lower(coalesce(i.name,'')) like '%' || $2 || '%' or lower(coalesce(i.name_en,'')) like '%' || $2 || '%')
     group by g.item_id, i.name order by uses desc limit 100`,
    [version, search],
  );
  return { materials: rows };
});

/**
 * Precio actual de varios objetos en la casa elegida (avisos de precio): el mismo precio de compra que usan los cálculos
 * («Precio de los materiales» en Ajustes). Como mucho 200 objetos; null = sin datos (nunca 0).
 */
route('GET', '/api/prices', async (_r, _p, u, db) => {
  const ctx = ctxFrom(u);
  const ids = idsParam(u.searchParams.get('ids')) ?? [];
  if (!ids.length) return { items: [] };
  const [snap, settings, names] = await Promise.all([
    loadSnapshot(db, ctx, ids), loadSettings(db),
    db.query<any>(`select id, name, quality from item where game_version=$1 and id = any($2::int[])`, [ctx.version, ids]),
  ]);
  const byId = new Map(names.map((n) => [Number(n.id), n]));
  return {
    items: ids.map((id) => {
      const p = resolvePrice(snap, id, settings.buySource);
      return { itemId: id, name: byId.get(id)?.name ?? null, quality: byId.get(id)?.quality ?? null, price: p.copper, scope: p.scope, sourceTime: p.sourceTime, supply: p.supply ?? null };
    }),
  };
});

/**
 * Nombres en inglés de los datos del juego (para la web en inglés): {nombre en español → nombre en inglés} de objetos,
 * recetas y profesiones. Sale del catálogo de Blizzard (name_en o raw.name.en_US). Se guarda en memoria por versión.
 */
const namesCache = new Map<string, { at: number; names: Record<string, string> }>();
export async function gameNamesEn(db: Db, version: string): Promise<Record<string, string>> {
  const hit = namesCache.get(version);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.names;
  const rows = await db.query<{ es: string | null; en: string | null }>(
    `select name as es, coalesce(name_en, raw->'name'->>'en_US') as en from item where game_version=$1
     union all select name, raw->'name'->>'en_US' from recipe where game_version=$1 and fetch_error is null
     union all select name, name_en from profession where game_version=$1
     union all select name, name_en from skill_tier where game_version=$1
     union all select coalesce(c->'name'->>'es_MX', c->'name'->>'es_ES'), c->'name'->>'en_US'
       from skill_tier st, jsonb_array_elements(case when jsonb_typeof(st.raw->'categories') = 'array' then st.raw->'categories' else '[]'::jsonb end) c
       where st.game_version=$1`,
    [version],
  );
  const names: Record<string, string> = {};
  for (const r of rows) if (r.es && r.en && r.es !== r.en && !(r.es in names)) names[r.es] = r.en;
  namesCache.set(version, { at: Date.now(), names });
  return names;
}
route('GET', '/api/names', async (_r, _p, u, db) => ({ names: await gameNamesEn(db, u.searchParams.get('version') ?? 'forever') }));

/**
 * Buscador global (cabecera): recetas y objetos por nombre en español o inglés. Mínimo 2 letras; como mucho 8 de cada.
 * Los objetos dicen si son material de alguna receta (enlazan a «Materiales») o el resultado de una (enlazan a la receta).
 */
route('GET', '/api/search', async (_r, _p, u, db) => {
  const version = u.searchParams.get('version') ?? 'forever';
  const q = (u.searchParams.get('q') ?? '').trim().toLowerCase().replace(/[%_\\]/g, '').slice(0, 60);
  if (q.length < 2) return { recipes: [], items: [] };
  const [recipes, items] = await Promise.all([
    db.query<any>(
      `select r.id, r.name, p.name as profession, r.profession_id, r.crafted_item_id as item_id, i.quality
       from recipe r join profession p on p.game_version=r.game_version and p.id=r.profession_id
       left join item i on i.game_version=r.game_version and i.id=r.crafted_item_id
       where r.game_version=$1 and r.fetch_error is null and r.name is not null and (lower(r.name) like '%' || $2 || '%' or lower(coalesce(i.name_en,'')) like '%' || $2 || '%')
       order by (lower(r.name) = $2) desc, (lower(r.name) like $2 || '%') desc, length(r.name), r.id limit 8`,
      [version, q],
    ),
    db.query<any>(
      `select item.id as item_id, item.name, item.quality,
              exists (select 1 from recipe_reagent g where g.game_version=item.game_version and g.item_id=item.id) as reagent,
              (select min(r.id) from recipe r where r.game_version=item.game_version and r.fetch_error is null and item.id in (r.crafted_item_id, r.alliance_item_id, r.horde_item_id)) as recipe_id
       from item
       where game_version=$1 and name is not null and (lower(name) like '%' || $2 || '%' or lower(coalesce(name_en,'')) like '%' || $2 || '%')
       order by (lower(name) = $2) desc, (lower(name) like $2 || '%') desc, length(name), id limit 8`,
      [version, q],
    ),
  ]);
  return {
    recipes: recipes.map((r) => ({ id: Number(r.id), name: r.name, profession: r.profession, professionId: Number(r.profession_id), itemId: r.item_id === null ? null : Number(r.item_id), quality: r.quality })),
    items: items.map((i) => ({ itemId: Number(i.item_id), name: i.name, quality: i.quality, reagent: Boolean(i.reagent), recipeId: i.recipe_id === null ? null : Number(i.recipe_id) })),
  };
});

/** Buscador de objetos por nombre (para elegir un objeto sin conocer su ID). Mínimo 2 letras, como mucho 20 resultados. */
route('GET', '/api/items', async (_r, _p, u, db) => {
  const version = u.searchParams.get('version') ?? 'forever';
  const byIds = idsParam(u.searchParams.get('ids'));
  if (byIds?.length) {
    return { items: await db.query<any>(`select id as item_id, name, quality from item where game_version=$1 and id = any($2::int[])`, [version, byIds]) };
  }
  const search = (u.searchParams.get('search') ?? '').trim().toLowerCase().slice(0, 60);
  if (search.length < 2) return { items: [] };
  // craftable=1: solo objetos que fabrica alguna receta (buscador de «Comprar o fabricar»).
  const craftable = u.searchParams.get('craftable') === '1'
    ? ` and exists (select 1 from recipe r where r.game_version=item.game_version and r.fetch_error is null and item.id in (r.crafted_item_id, r.alliance_item_id, r.horde_item_id))` : '';
  const rows = await db.query<any>(
    `select id as item_id, name, quality from item
     where game_version=$1 and name is not null${craftable} and (lower(name) like '%' || $2 || '%' or lower(coalesce(name_en,'')) like '%' || $2 || '%')
     order by (lower(name) = $2) desc, (lower(name) like $2 || '%') desc, length(name), id limit 20`,
    [version, search],
  );
  return { items: rows };
});

// ---------------------------------------------------------------------------
// Subida de nivel por profesión (recetas y dificultad de Wowhead + precios de la casa de subastas)
// ---------------------------------------------------------------------------

route('GET', '/api/leveling/professions', async (_r, _p, u, db) => levelingProfessions(db, u.searchParams.get('version') ?? 'forever'));

route('GET', '/api/leveling', async (_r, _p, u, db) => {
  const ctx = ctxFrom(u);
  const settings = await loadSettings(db);
  return levelingPlan(db, ctx, settings, {
    professionId: int(u.searchParams.get('profession'))!,
    from: int(u.searchParams.get('from'), 1)!,
    to: int(u.searchParams.get('to'), 300)!,
    trainerOnly: u.searchParams.get('trainerOnly') !== '0',
    manual: parseManualPrices(u.searchParams.get('manual')),
    exclude: parseExclude(u.searchParams.get('exclude')),
    mode: levelingMode(u.searchParams.get('mode')),
  });
});

/** «rapida» (por defecto) o «barata»: la prioridad la elige el usuario. */
function levelingMode(v: string | null): 'guia' | 'rapida' | 'barata' | undefined {
  // Sin modo: la guía de la profesión si la hay (la decide levelingPlan).
  if (v === null || v === '') return undefined;
  if (v !== 'guia' && v !== 'rapida' && v !== 'barata') throw new HttpError(400, 'Modo inválido: «guia», «rapida» o «barata».');
  return v;
}

// ---------------------------------------------------------------------------
// Ruta recomendada (más rápida o más barata) sin cuenta: nivel indicado a mano (PC-08 a PC-12, PC-16)
// ---------------------------------------------------------------------------

/** Recetas a evitar (ids de hechizo): «1,2,3» o lista JSON; como mucho 50. */
function parseExclude(v: unknown): Set<number> {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const ids = list.map((x) => Number(String(x).trim())).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length > 50) throw new HttpError(400, 'Como mucho 50 recetas a evitar.');
  return new Set(ids);
}

/** Opciones de la ruta desde la petición (query o cuerpo JSON). El presupuesto llega en oro. */
function routeOptions(get: (k: string) => unknown) {
  const s = (k: string) => { const v = get(k); return v === undefined || v === null || v === '' ? null : String(v); };
  const mode = s('mode') ?? 'rapida';
  if (mode !== 'rapida' && mode !== 'barata') throw new HttpError(400, 'Modo inválido: «rapida» o «barata».');
  const chance = s('chance') ?? 'comunidad';
  if (chance !== 'comunidad' && chance !== 'garantizado') throw new HttpError(400, 'Probabilidad inválida: «comunidad» o «garantizado».');
  const budgetRaw = s('budget');
  let budget: Q | null = null;
  if (budgetRaw !== null) {
    if (!/^\d{1,7}(\.\d{1,4})?$/.test(budgetRaw)) throw new HttpError(400, 'Presupuesto inválido (oro, hasta 4 decimales).');
    budget = Q.parse(budgetRaw).mul(COPPER_PER_GOLD);
  }
  const bool = (k: string, def: boolean) => { const v = get(k); return v === undefined || v === null || v === '' ? def : v === true || v === '1' || v === 'true'; };
  return {
    mode: mode as 'rapida' | 'barata', chanceModel: chance as 'comunidad' | 'garantizado', budget, budgetGold: budgetRaw,
    trainerOnly: bool('trainerOnly', true), useKnown: bool('useKnown', true),
    manualRaw: s('manual'), manual: parseManualPrices(s('manual')), exclude: parseExclude(get('exclude')),
  };
}

route('GET', '/api/route', async (_r, _p, u, db) => {
  const ctx = ctxFrom(u);
  const o = routeOptions((k) => u.searchParams.get(k));
  return routePlan(db, ctx, await loadSettings(db), {
    ...o, professionId: int(u.searchParams.get('profession'))!, from: int(u.searchParams.get('from'), 1)!, to: int(u.searchParams.get('to'), 300)!,
    currentMax: int(u.searchParams.get('currentMax')) ?? null, characterLevel: int(u.searchParams.get('characterLevel')) ?? null,
  });
});

// ---------------------------------------------------------------------------
// Battle.net: conexión, personajes propios, profesiones, rutas guardadas y progreso (PC-02 a PC-15)
// ---------------------------------------------------------------------------

route('GET', '/api/battlenet/status', async (req, _p, _u, db) => {
  const cfg = battlenetConfig();
  const s = cfg.configured ? await currentSession(db, req) : null;
  return {
    configured: cfg.configured, missing: cfg.missing, redirectUri: redirectUri(req), namespaces: profileNamespaces(s?.region ?? 'us'),
    connected: Boolean(s), account: s ? { battletag: s.battletag, region: s.region, expiresAt: s.expiresAt, scope: s.scope, tokenOk: s.token !== null } : null,
  };
});
route('GET', '/api/battlenet/start', async (req, _p, u, db) => startLogin(db, req, u.searchParams.get('region') ?? 'us'));
route('GET', '/api/auth/battlenet/callback', async (req, _p, u, db) => finishLogin(db, req, u));
route('POST', '/api/battlenet/disconnect', async (req, _p, _u, db) => {
  checkSameOrigin(req);
  const b = await body(req);
  return disconnect(db, req, b.deleteData === true);
});

async function characterView(db: Db, c: any) {
  const sync = await db.query<any>(`select status, http_status, detail, checked_at from character_sync where character_id=$1`, [c.id]);
  return {
    id: c.id, name: c.name, level: c.level, className: c.class_name, raceName: c.race_name, faction: c.faction,
    realm: { id: c.realm_id === null ? null : Number(c.realm_id), slug: c.realm_slug, name: c.realm_name }, namespace: c.namespace, surname: c.surname ?? null,
    syncedAt: new Date(c.synced_at).toISOString(),
    guild: c.guild_name ?? null, media: c.media ?? null, equipment: c.equipment ?? null,
    profileSyncedAt: c.profile_synced_at ? new Date(c.profile_synced_at).toISOString() : null, profileDetail: c.profile_detail ?? null,
    professionSync: sync[0] ? { status: sync[0].status, httpStatus: sync[0].http_status, detail: sync[0].detail, checkedAt: new Date(sync[0].checked_at).toISOString() } : null,
    professions: await characterProfessions(db, c.id),
  };
}

route('GET', '/api/me/characters', async (req, _p, _u, db) => {
  const s = await requireSession(db, req);
  const rows = await db.query<any>(`select * from bnet_character where account_id=$1 order by level desc nulls last, name`, [s.accountId]);
  return { characters: await Promise.all(rows.map((c) => characterView(db, c))) };
});
route('POST', '/api/me/characters/sync', async (req, _p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const r = await syncCharacters(db, s);
  const rows = await db.query<any>(`select * from bnet_character where account_id=$1 order by level desc nulls last, name`, [s.accountId]);
  return { ...r, characters: await Promise.all(rows.map((c) => characterView(db, c))) };
});
route('GET', '/api/me/characters/:id', async (req, p, _u, db) => {
  const s = await requireSession(db, req);
  return { character: await characterView(db, await ownedCharacter(db, s, p.id)) };
});
route('POST', '/api/me/characters/:id/professions/sync', async (req, p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const c = await ownedCharacter(db, s, p.id);
  const r = await syncProfessions(db, s, c);
  return { result: r, character: await characterView(db, c) };
});
/** Actualiza todo desde Blizzard: nivel, retrato, equipo puesto y profesiones. */
route('POST', '/api/me/characters/:id/sync', async (req, p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const c = await ownedCharacter(db, s, p.id);
  const [profile, professions] = await Promise.all([syncCharacterProfile(db, s, c), syncProfessions(db, s, c)]);
  return { result: { profile, professions }, character: await characterView(db, await ownedCharacter(db, s, p.id)) };
});
route('PUT', '/api/me/characters/:id/professions/:pid', async (req, p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const c = await ownedCharacter(db, s, p.id);
  const pid = int(p.pid)!;
  const b = await body(req);
  const opt = (v: unknown, name: string) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 1000) throw new HttpError(400, `${name} inválido (entero entre 0 y 1000).`);
    return n;
  };
  const skill = opt(b.skillPoints, 'Nivel');
  const max = opt(b.maxSkillPoints, 'Máximo');
  if (skill !== null && max !== null && skill > max) throw new HttpError(400, 'El nivel no puede superar el máximo.');
  const preferred = b.preferred === 'blizzard' ? 'blizzard' : 'manual';
  await db.query(
    `insert into profession_manual (character_id, profession_id, skill_points, max_skill_points, note, preferred, updated_at) values ($1,$2,$3,$4,$5,$6,now())
     on conflict (character_id, profession_id) do update set skill_points=excluded.skill_points, max_skill_points=excluded.max_skill_points,
       note=excluded.note, preferred=excluded.preferred, updated_at=now()`,
    [c.id, pid, skill, max, typeof b.note === 'string' ? b.note.slice(0, 200) : null, preferred],
  );
  return { character: await characterView(db, c) };
});
route('DELETE', '/api/me/characters/:id/professions/:pid', async (req, p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const c = await ownedCharacter(db, s, p.id);
  await db.query(`delete from profession_manual where character_id=$1 and profession_id=$2`, [c.id, int(p.pid)]);
  return { character: await characterView(db, c) };
});

// «La hice ahora» (Transmutaciones) guardado con el personaje: solo el dueño lo lee o lo cambia.
const cooldownView = (r: any) => ({ slot: r.slot, at: new Date(r.done_at).getTime(), cd: Number(r.cooldown_s), name: r.name });
const SLOT_RE = /^[a-z0-9:_-]{1,80}$/i;
route('GET', '/api/me/characters/:id/cooldowns', async (req, p, _u, db) => {
  const s = await requireSession(db, req);
  const c = await ownedCharacter(db, s, p.id);
  const rows = await db.query<any>(`select * from character_cooldown where character_id=$1`, [c.id]);
  return { cooldowns: rows.map(cooldownView) };
});
route('PUT', '/api/me/characters/:id/cooldowns', async (req, p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const c = await ownedCharacter(db, s, p.id);
  const b = await body(req);
  const slot = String(b.slot ?? '');
  const cd = Number(b.cooldown);
  const at = b.at === undefined ? Date.now() : Number(b.at);
  if (!SLOT_RE.test(slot)) throw new HttpError(400, 'Receta inválida.');
  if (!Number.isInteger(cd) || cd <= 0 || cd > 30 * 86400) throw new HttpError(400, 'Espera inválida.');
  if (!Number.isFinite(at) || at > Date.now() + 60_000 || at < Date.now() - 30 * 86400_000) throw new HttpError(400, 'Fecha inválida.');
  const name = String(b.name ?? '').slice(0, 120) || slot;
  await db.query(
    `insert into character_cooldown (character_id, slot, done_at, cooldown_s, name) values ($1,$2,$3,$4,$5)
     on conflict (character_id, slot) do update set done_at=excluded.done_at, cooldown_s=excluded.cooldown_s, name=excluded.name`,
    [c.id, slot, new Date(at).toISOString(), cd, name],
  );
  const rows = await db.query<any>(`select * from character_cooldown where character_id=$1`, [c.id]);
  return { cooldowns: rows.map(cooldownView) };
});
route('DELETE', '/api/me/characters/:id/cooldowns/:slot', async (req, p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const c = await ownedCharacter(db, s, p.id);
  await db.query(`delete from character_cooldown where character_id=$1 and slot=$2`, [c.id, p.slot]);
  const rows = await db.query<any>(`select * from character_cooldown where character_id=$1`, [c.id]);
  return { cooldowns: rows.map(cooldownView) };
});

/** Ruta para un personaje propio: nivel de partida = el observado (Blizzard o manual) salvo que se indique otro. */
async function characterRoute(db: Db, s: Awaited<ReturnType<typeof requireSession>>, c: any, b: any, fromOverride?: number) {
  const ctx = ctxFrom(b);
  const o = routeOptions((k) => b[k]);
  const professionId = Number(b.professionId);
  if (!Number.isInteger(professionId)) throw new HttpError(400, 'Elige una profesión.');
  const prof = (await characterProfessions(db, c.id)).find((x) => x.professionId === professionId);
  const observed = fromOverride ?? (b.from !== undefined && b.from !== null && b.from !== '' ? Number(b.from) : prof?.effective.skillPoints ?? null);
  if (observed === null || !Number.isInteger(observed)) {
    throw new HttpError(400, 'No se conoce el nivel actual de esa profesión: sincroniza con Blizzard o indícalo a mano.');
  }
  const startSource = fromOverride !== undefined ? 'progreso' : b.from !== undefined && b.from !== null && b.from !== '' ? 'manual' : prof?.effective.source ?? 'manual';
  const to = Number(b.to ?? 300);
  let known: Set<number> | undefined;
  let unmatchedKnown = 0;
  if (o.useKnown && prof?.blizzard?.knownRecipes?.length) {
    const k = await knownSpellIds(db, ctx.version, professionId, prof.blizzard.knownRecipes);
    known = k.known;
    unmatchedKnown = k.unmatched;
  }
  const result = await routePlan(db, ctx, await loadSettings(db), {
    professionId, from: Math.max(1, observed), to, mode: o.mode, budget: o.budget, trainerOnly: o.trainerOnly, chanceModel: o.chanceModel,
    manual: o.manual, known, exclude: o.exclude, currentMax: prof?.effective.maxSkillPoints ?? null, characterLevel: c.level ?? null,
  });
  return {
    result: { ...result, startSkill: observed, startSource, unmatchedKnownRecipes: unmatchedKnown },
    constraints: { ...ctx, professionId, to, mode: o.mode, budget: o.budgetGold, trainerOnly: o.trainerOnly, chanceModel: o.chanceModel, useKnown: o.useKnown, manual: o.manualRaw, exclude: [...o.exclude] },
    startSkill: observed, startSource,
  };
}

route('POST', '/api/me/characters/:id/route', async (req, p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const c = await ownedCharacter(db, s, p.id);
  return (await characterRoute(db, s, c, await body(req))).result;
});

const toJson = (v: unknown) => JSON.stringify(v, jsonReplacer);
function planView(r: any, events: any[] = []) {
  return {
    id: r.id, characterId: r.character_id, professionId: r.profession_id, target: r.target, mode: r.mode, algorithm: r.algorithm,
    constraints: r.constraints, startSkill: r.start_skill, startSource: r.start_source, status: r.status,
    createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(), result: r.result,
    progress: events.map((e) => ({ observedSkill: e.observed_skill, source: e.source, note: e.note, at: new Date(e.created_at).toISOString() })),
  };
}
async function ownedPlan(db: Db, accountId: string, id: string) {
  if (!uuidRe.test(id)) throw new HttpError(400, 'Identificador de ruta inválido.');
  const rows = await db.query<any>(`select * from leveling_plan where id=$1 and account_id=$2`, [id, accountId]);
  if (!rows.length) throw new HttpError(404, 'Ruta no encontrada.');
  return rows[0];
}

route('GET', '/api/me/plans', async (req, _p, u, db) => {
  const s = await requireSession(db, req);
  const ch = u.searchParams.get('character');
  if (ch && !uuidRe.test(ch)) throw new HttpError(400, 'Identificador de personaje inválido.');
  const rows = await db.query<any>(
    `select id, character_id, profession_id, target, mode, algorithm, constraints, start_skill, start_source, status, created_at, updated_at, null as result
     from leveling_plan where account_id=$1 and ($2::uuid is null or character_id=$2::uuid) order by updated_at desc limit 50`,
    [s.accountId, ch || null],
  );
  return { plans: rows.map((r) => planView(r)) };
});
route('POST', '/api/me/plans', async (req, _p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const b = await body(req);
  const c = await ownedCharacter(db, s, String(b.characterId ?? ''));
  const r = await characterRoute(db, s, c, b);
  const row = await db.query<any>(
    `insert into leveling_plan (account_id, character_id, profession_id, target, mode, constraints, algorithm, start_skill, start_source, result, status)
     values ($1,$2,$3,$4,$5,$6::text::jsonb,$7,$8,$9,$10::text::jsonb,$11) returning *`,
    [s.accountId, c.id, r.constraints.professionId, r.constraints.to, r.constraints.mode, toJson(r.constraints), 'algorithm' in r.result ? r.result.algorithm : 'completado', r.startSkill, r.startSource, toJson(r.result), 'completed' in r.result ? 'completado' : 'activo'],
  );
  return { plan: planView(row[0]) };
});
route('GET', '/api/me/plans/:id', async (req, p, _u, db) => {
  const s = await requireSession(db, req);
  const plan = await ownedPlan(db, s.accountId, p.id);
  const ev = await db.query<any>(`select * from progress_event where plan_id=$1 order by created_at`, [plan.id]);
  return { plan: planView(plan, ev) };
});
route('DELETE', '/api/me/plans/:id', async (req, p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const plan = await ownedPlan(db, s.accountId, p.id);
  await db.query(`delete from leveling_plan where id=$1 and account_id=$2`, [plan.id, s.accountId]);
  return { ok: true };
});
/**
 * Progreso (PC-14): el usuario indica el nivel observado (o se lee de Blizzard) y la ruta se recalcula desde ahí con las
 * mismas restricciones y los precios actuales. Cada observación queda registrada con su procedencia.
 */
route('POST', '/api/me/plans/:id/progress', async (req, p, _u, db) => {
  checkSameOrigin(req);
  const s = await requireSession(db, req);
  const plan = await ownedPlan(db, s.accountId, p.id);
  const c = await ownedCharacter(db, s, plan.character_id);
  const b = await body(req);
  let observed: number | null = null;
  let source = 'manual';
  if (b.sync === true) {
    await syncProfessions(db, s, c);
    const prof = (await characterProfessions(db, c.id)).find((x) => x.professionId === Number(plan.profession_id));
    observed = prof?.blizzard?.skillPoints ?? null;
    source = 'blizzard';
    if (observed === null) throw new HttpError(409, 'Blizzard no devolvió el nivel de esta profesión: indícalo a mano.');
    // Un dato de Blizzard más bajo que el último registrado puede ser una foto atrasada: no se retrocede sin confirmación.
    const last = await db.query<any>(`select max(observed_skill) as m from progress_event where plan_id=$1`, [plan.id]);
    const latest = Math.max(Number(plan.start_skill), Number(last[0]?.m ?? 0));
    if (observed < latest) {
      throw new HttpError(409, `Blizzard indica ${observed}, menos que el último nivel registrado (${latest}). Puede ser un dato atrasado: si ${observed} es correcto, indícalo a mano.`);
    }
  } else {
    observed = Number(b.observedSkill);
    if (!Number.isInteger(observed) || observed < 1 || observed > 1000) throw new HttpError(400, 'Nivel observado inválido.');
  }
  await db.query(`insert into progress_event (plan_id, observed_skill, source, note) values ($1,$2,$3,$4)`,
    [plan.id, observed, source, typeof b.note === 'string' ? b.note.slice(0, 200) : null]);
  if (observed >= Number(plan.target)) {
    await db.query(`update leveling_plan set status='completado', updated_at=now() where id=$1`, [plan.id]);
  } else {
    const r = await characterRoute(db, s, c, { ...plan.constraints }, observed);
    await db.query(`update leveling_plan set result=$2::text::jsonb, status='activo', updated_at=now() where id=$1`, [plan.id, toJson(r.result)]);
  }
  const fresh = await ownedPlan(db, s.accountId, plan.id);
  const ev = await db.query<any>(`select * from progress_event where plan_id=$1 order by created_at`, [plan.id]);
  return { plan: planView(fresh, ev) };
});

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

route('GET', '/api/settings', async (_r, _p, _u, db) => ({ settings: await loadSettings(db), defaults: DEFAULT_SETTINGS }));
route('PUT', '/api/settings', async (req, _p, _u, db) => {
  const b = await body(req);
  const cur = await loadSettings(db);
  const next: Settings = { ...cur };
  const fields = Object.keys(PRICE_FIELD_LABEL);
  for (const k of ['commission', 'commissionNeutral', 'minProfitUnitGold', 'minRoiPct'] as const) {
    if (b[k] !== undefined) {
      try { Q.parse(String(b[k])); } catch { throw new HttpError(400, `Valor inválido para ${k}.`); }
      next[k] = String(b[k]).replace(',', '.');
    }
  }
  for (const c of [Q.parse(next.commission), Q.parse(next.commissionNeutral)]) {
    if (c.sign() < 0 || c.cmp(Q.one) >= 0) throw new HttpError(400, 'La comisión debe cumplir 0 ≤ t < 1 (por ejemplo 0.05).');
  }
  for (const k of ['minSaleRate', 'minSoldPerDay', 'maxAgeHoursRealm', 'maxAgeHoursRegion'] as const) {
    if (b[k] !== undefined) {
      const n = Number(b[k]);
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `Valor inválido para ${k}.`);
      next[k] = n;
    }
  }
  for (const k of ['buySource', 'sellSource'] as const) {
    if (b[k] !== undefined) {
      if (!fields.includes(b[k])) throw new HttpError(400, `Fuente de precio inválida: ${b[k]}`);
      next[k] = b[k];
    }
  }
  await db.query(`insert into app_setting(key,value) values ('settings',$1::text::jsonb) on conflict (key) do update set value=excluded.value, updated_at=now()`, [JSON.stringify(next)]);
  return { settings: next };
});

// ---------------------------------------------------------------------------
// Perfiles, escenarios, planes y registro real
// ---------------------------------------------------------------------------

function cleanProfile(b: any): { name: string; data: Profile } {
  const name = String(b.name ?? '').trim().slice(0, 60);
  if (!name) throw new HttpError(400, 'El perfil necesita un nombre.');
  const faction = b.faction === 'alliance' || b.faction === 'horde' ? b.faction : null;
  const professions = Array.isArray(b.professions)
    ? b.professions.filter((p: any) => Number.isInteger(Number(p?.professionId))).map((p: any) => ({
      professionId: Number(p.professionId),
      skill: p.skill === null || p.skill === undefined || p.skill === '' ? null : Math.max(0, Math.floor(Number(p.skill))),
    }))
    : [];
  const knownRecipes = Array.isArray(b.knownRecipes) ? [...new Set(b.knownRecipes.map(Number).filter(Number.isInteger))] as number[] : [];
  const inventory: Record<string, number> = {};
  if (b.inventory && typeof b.inventory === 'object') {
    for (const [k, v] of Object.entries(b.inventory)) {
      const n = Number(v);
      if (/^\d+$/.test(k) && Number.isInteger(n) && n > 0) inventory[k] = n;
    }
  }
  return { name, data: { faction, professions, knownRecipes, inventory } };
}

route('GET', '/api/profiles', async (_r, _p, _u, db) => ({
  profiles: (await db.query<any>(`select id, name, data, updated_at from character_profile order by name`)).map((r) => ({ id: r.id, name: r.name, ...r.data, updatedAt: r.updated_at })),
}));
route('POST', '/api/profiles', async (req, _p, _u, db) => {
  const { name, data } = cleanProfile(await body(req));
  const [r] = await db.query<any>(`insert into character_profile(name,data) values ($1,$2::text::jsonb) returning id`, [name, JSON.stringify(data)]);
  return { id: r.id };
});
route('GET', '/api/profiles/:id', async (_r, p, _u, db) => ({ profile: await loadProfile(db, p.id) }));
route('PUT', '/api/profiles/:id', async (req, p, _u, db) => {
  await loadProfile(db, p.id);
  const { name, data } = cleanProfile(await body(req));
  await db.query(`update character_profile set name=$2, data=$3::text::jsonb, updated_at=now() where id=$1`, [p.id, name, JSON.stringify(data)]);
  return { ok: true };
});
route('DELETE', '/api/profiles/:id', async (_r, p, _u, db) => {
  await loadProfile(db, p.id);
  await db.query(`delete from character_profile where id=$1`, [p.id]);
  return { ok: true };
});

route('GET', '/api/scenarios', async (_r, _p, u, db) => ({
  scenarios: await db.query<any>(`select id, name, data, updated_at from scenario where recipe_key=$1 order by updated_at desc`, [u.searchParams.get('recipeKey') ?? '']),
}));
route('POST', '/api/scenarios', async (req, _p, _u, db) => {
  const b = await body(req);
  if (!b.recipeKey || typeof b.recipeKey !== 'string') throw new HttpError(400, 'Falta recipeKey.');
  const [r] = await db.query<any>(`insert into scenario(recipe_key,name,data) values ($1,$2,$3::text::jsonb) returning id`, [b.recipeKey.slice(0, 64), String(b.name ?? 'Escenario').slice(0, 60), JSON.stringify(b.overrides ?? {})]);
  return { id: r.id };
});
route('DELETE', '/api/scenarios/:id', async (_r, p, _u, db) => {
  if (!uuidRe.test(p.id)) throw new HttpError(400, 'Id inválido.');
  await db.query(`delete from scenario where id=$1`, [p.id]);
  return { ok: true };
});

route('POST', '/api/crafting-plan', async (req, _p, _u, db) => {
  const b = await body(req);
  const ctx = ctxFrom(b);
  const profile = await loadProfile(db, b.profileId);
  const entries: Array<{ recipeId: number; amount: number; mode: 'ejecuciones' | 'unidades' }> = Array.isArray(b.entries) ? b.entries : [];
  if (!entries.length) throw new HttpError(400, 'El plan no tiene recetas.');
  if (entries.length > 100) throw new HttpError(400, 'Máximo 100 recetas por plan.');
  const recipes = await loadRecipes(db, ctx.version, { recipeIds: entries.map((e) => Number(e.recipeId)) });
  const ectx = await buildEvalContext(db, ctx, recipes, profile);
  const settings = ectx.settings;
  const commission = Q.parse(commissionFor(settings, ctx.realm));
  const warnings: string[] = [];
  const planEntries = entries.map((e) => {
    const r = recipes.find((x) => x.id === Number(e.recipeId));
    if (!r) throw new HttpError(404, `Receta ${e.recipeId} no encontrada.`);
    const ev = evaluateRecipe(r, ectx);
    if (ev.status === 'datos_insuficientes') warnings.push(`${ev.name}: ${ev.reasons.join(' ')}`);
    if (ev.status === 'no_vendible') warnings.push(`${ev.name}: no vendible en subasta.`);
    return {
      recipe: {
        recipeId: String(r.id), name: ev.name, unitsPerRun: ev.unitsPerRun ?? 0, outputPrice: ev.channel === 'subasta' ? ev.sellPrice.copper : null,
        reagents: ev.reagents.filter((x) => x.quantity !== null).map((x) => ({ itemKey: String(x.itemId), name: x.name ?? `Objeto ${x.itemId}`, quantity: x.quantity!, unitPrice: x.price.copper })),
      },
      amount: Number(e.amount),
      mode: e.mode === 'unidades' ? 'unidades' as const : 'ejecuciones' as const,
    };
  });
  const plan = buildPlan(planEntries, profile?.inventory ?? {}, commission);
  // PB-22: una receta con reutilización no se puede repetir seguida.
  for (const pe of plan.entries) {
    const cd = ectx.cooldowns?.get(Number(pe.recipeId));
    if (cd && pe.runs > 1) {
      warnings.push(`${pe.name}: reutilización de ${cooldownLabel(cd)}. ${pe.runs} fabricaciones necesitan al menos ${durationLabel(minTimeForRuns(pe.runs, cd))} (una cada ${cooldownLabel(cd)}).`);
    }
  }
  return { plan, warnings, commission: commissionFor(settings, ctx.realm), note: 'Las cantidades son una planificación, no una garantía de venta.' };
});

route('GET', '/api/plans', async (_r, _p, _u, db) => ({ plans: await db.query<any>(`select id, name, profile_id, data, updated_at from crafting_plan order by updated_at desc`) }));
route('POST', '/api/plans', async (req, _p, _u, db) => {
  const b = await body(req);
  const name = String(b.name ?? '').trim().slice(0, 60) || 'Plan';
  if (b.profileId && !uuidRe.test(b.profileId)) throw new HttpError(400, 'Perfil inválido.');
  const data = { ctx: b.ctx ?? null, entries: Array.isArray(b.entries) ? b.entries.slice(0, 100) : [] };
  if (b.id) {
    if (!uuidRe.test(b.id)) throw new HttpError(400, 'Id inválido.');
    await db.query(`update crafting_plan set name=$2, profile_id=$3, data=$4::text::jsonb, updated_at=now() where id=$1`, [b.id, name, b.profileId ?? null, JSON.stringify(data)]);
    return { id: b.id };
  }
  const [r] = await db.query<any>(`insert into crafting_plan(name,profile_id,data) values ($1,$2,$3::text::jsonb) returning id`, [name, b.profileId ?? null, JSON.stringify(data)]);
  return { id: r.id };
});
route('DELETE', '/api/plans/:id', async (_r, p, _u, db) => {
  if (!uuidRe.test(p.id)) throw new HttpError(400, 'Id inválido.');
  await db.query(`delete from crafting_plan where id=$1`, [p.id]);
  return { ok: true };
});

const LEDGER_KINDS = ['compra', 'venta', 'gasto', 'deposito_perdido', 'fabricacion'];
route('GET', '/api/ledger', async (_r, _p, u, db) => {
  const pid = u.searchParams.get('profileId');
  if (pid && !uuidRe.test(pid)) throw new HttpError(400, 'Perfil inválido.');
  const rows = await db.query<any>(
    `select * from ledger_entry where ($1::uuid is null or profile_id=$1) order by occurred_at desc, created_at desc limit 500`, [pid || null]);
  // Resumen: solo asientos vigentes. Beneficio realizado = ventas − compras − gastos − depósitos perdidos.
  const active = rows.filter((r) => !r.voided);
  const sum = (k: string) => active.filter((r) => r.kind === k).reduce((a, r) => a + BigInt(r.unit_price_copper) * BigInt(r.quantity), 0n);
  const sales = sum('venta');
  const costs = sum('compra') + sum('gasto') + sum('deposito_perdido');
  const crafted = active.filter((r) => r.kind === 'fabricacion').reduce((m, r) => m.set(r.item_id, (m.get(r.item_id) ?? 0) + r.quantity), new Map<number, number>());
  const sold = active.filter((r) => r.kind === 'venta').reduce((m, r) => m.set(r.item_id, (m.get(r.item_id) ?? 0) + r.quantity), new Map<number, number>());
  const pending = [...crafted.entries()].map(([id, n]) => ({ itemId: id, name: active.find((r) => r.item_id === id)?.item_name, pending: n - (sold.get(id) ?? 0) })).filter((x) => x.pending > 0);
  return { entries: rows, summary: { sales: sales.toString(), costs: costs.toString(), realized: (sales - costs).toString(), pendingToSell: pending } };
});
route('POST', '/api/ledger', async (req, _p, _u, db) => {
  const b = await body(req);
  if (!LEDGER_KINDS.includes(b.kind)) throw new HttpError(400, 'Tipo de asiento inválido.');
  const qty = Number(b.quantity);
  if (!Number.isInteger(qty) || qty <= 0) throw new HttpError(400, 'La cantidad debe ser un entero mayor que 0.');
  let price: bigint;
  try {
    const qv = Q.parse(String(b.unitPriceGold ?? '0')).mul(COPPER_PER_GOLD);
    if (!qv.isInteger() || qv.sign() < 0) throw new Error();
    price = qv.n;
  } catch {
    throw new HttpError(400, 'Precio inválido (oro, hasta 4 decimales = cobre entero).');
  }
  const occurred = b.occurredAt ? new Date(b.occurredAt) : new Date();
  if (Number.isNaN(occurred.getTime())) throw new HttpError(400, 'Fecha inválida.');
  for (const k of ['profileId', 'planId', 'replacesId']) if (b[k] && !uuidRe.test(b[k])) throw new HttpError(400, `${k} inválido.`);
  return db.tx(async (t) => {
    if (b.replacesId) await t.query(`update ledger_entry set voided=true where id=$1`, [b.replacesId]);
    const [r] = await t.query<any>(
      `insert into ledger_entry(profile_id,plan_id,kind,item_id,item_name,quantity,unit_price_copper,occurred_at,note,estimate,replaces_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text::jsonb,$11) returning id`,
      [b.profileId ?? null, b.planId ?? null, b.kind, b.itemId ? Number(b.itemId) : null, b.itemName ? String(b.itemName).slice(0, 120) : null,
        qty, price.toString(), occurred.toISOString(), b.note ? String(b.note).slice(0, 300) : null, b.estimate ? JSON.stringify(b.estimate) : null, b.replacesId ?? null],
    );
    return { id: r.id };
  });
});
route('POST', '/api/ledger/:id/void', async (_r, p, _u, db) => {
  if (!uuidRe.test(p.id)) throw new HttpError(400, 'Id inválido.');
  await db.query(`update ledger_entry set voided=true where id=$1`, [p.id]);
  return { ok: true };
});

// Herramienta avanzada manual (valor esperado, PB-23): cálculo puro, siempre etiquetado como manual.
route('POST', '/api/tools/expected', async (req) => {
  const b = await body(req);
  const { expectedRevenue } = await import('../engine/calc.js');
  const gq = (s: any) => Q.parse(String(s)).mul(COPPER_PER_GOLD);
  try {
    const scen = (b.scenarios ?? []).map((s: any) => ({ label: String(s.label ?? ''), probability: Q.parse(String(s.probability)), netRevenue: gq(s.netRevenueGold) }));
    const r = expectedRevenue(scen);
    const cost = b.costGold !== undefined && b.costGold !== '' ? gq(b.costGold) : null;
    return { manual: true, ...r, expectedProfit: r.expected && cost ? r.expected.sub(cost) : null };
  } catch (e) {
    throw new HttpError(400, `Valor inválido: ${(e as Error).message}`);
  }
});


// ---------------------------------------------------------------------------

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // En Vercel la reescritura envía la ruta original en ?path=
  const p = url.searchParams.get('__path');
  const pathname = p !== null ? '/api/' + p.replace(/^\/+/, '') : url.pathname;
  try {
    // Acceso con contraseña compartida (APP_PASSWORD). Ver src/server/auth.ts.
    if (pathname === '/api/auth/status' && req.method === 'GET') {
      return json({ required: authRequired(), authenticated: isAuthenticated(req) });
    }
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      if (!authRequired()) return json({ ok: true, required: false });
      const b = await body(req);
      if (!checkPassword(b.password)) {
        await new Promise((r) => setTimeout(r, 800)); // frena intentos repetidos
        return json({ error: 'Contraseña incorrecta.' }, 401);
      }
      const res = json({ ok: true });
      res.headers.append('set-cookie', sessionCookie(req));
      return res;
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const res = json({ ok: true });
      res.headers.append('set-cookie', clearCookie(req));
      return res;
    }
    if (!isOpenRequest(req.method, pathname) && !isAuthenticated(req)) {
      return json({ error: 'Esta acción cambia datos compartidos y necesita la contraseña de administrador.', auth: true }, 401);
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const db = await getDb();
      const out = await r.handler(req, params, url, db);
      return out instanceof Response ? out : json(out);
    }
    return json({ error: 'Ruta no encontrada.' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, detail: e.detail }, e.status);
    console.error(e);
    const msg = (e as Error).message ?? 'Error interno';
    if (/DATABASE_URL/.test(msg)) return json({ error: msg }, 503);
    return json({ error: 'Error interno del servidor.', detail: process.env.NODE_ENV === 'production' ? undefined : msg }, 500);
  }
}

