/**
 * «Línea de tiempo» (D36): ranking de todos los materiales con historial en la casa elegida y detalle por objeto,
 * comparando WoW Forever con Classic Anniversary por días desde el lanzamiento. La lógica está en src/engine/timeline.ts.
 */
import { z } from 'zod';
import type { Db } from './db.js';
import { toBig, toNum } from './db.js';
import { HttpError, loadSnapshot, type MarketContext } from './market.js';
import { loadSettings } from './evaluate.js';
import { commissionFor } from './config.js';
import { Q, COPPER_PER_GOLD } from '../engine/rational.js';
import {
  evaluateTimeline, sellTiers, daysBetween, DEFAULT_ANNIV_WINDOW, type TimelineDay, type TimelineRef, type TimelineResult,
} from '../engine/timeline.js';

const HISTORY_DAYS = 60;
const today = () => new Date().toISOString().slice(0, 10);

interface Economy { id: string; name: string; launch: string | null; source: string | null }
interface Phase { economy: string; phase: string; milestone: string; start: string; day: number | null; confirmed: boolean; note: string | null; source: string | null }

async function loadFrame(db: Db) {
  const [eco, ph, gv, caps] = await Promise.all([
    db.query<any>(`select id, name, to_char(launch_date,'YYYY-MM-DD') as launch, source from timeline_economy order by launch_date nulls last`),
    db.query<any>(`select economy_id, phase, milestone, to_char(start_date,'YYYY-MM-DD') as start, confirmed, note, source from timeline_phase order by economy_id, start_date`),
    db.query<any>(`select economy_id, day, period, market, usd_per_gold::text as usd, source from timeline_gold_value order by economy_id, day`),
    db.query<any>(`select item_id, item_name, cap_copper, vendor, source from timeline_vendor_cap`),
  ]);
  const economies: Economy[] = eco.map((e) => ({ id: e.id, name: e.name, launch: e.launch, source: e.source }));
  const launch = new Map(economies.map((e) => [e.id, e.launch]));
  const phases: Phase[] = ph.map((p) => {
    const l = launch.get(p.economy_id);
    return { economy: p.economy_id, phase: p.phase, milestone: p.milestone, start: p.start, day: l ? daysBetween(l, p.start) : null, confirmed: Boolean(p.confirmed), note: p.note, source: p.source };
  });
  const goldValues = gv.map((g) => ({ economy: g.economy_id, day: Number(g.day), period: g.period, market: g.market, usdPerGold: Number(g.usd), source: g.source }));
  const vendorCaps = new Map<number, { itemId: number; name: string | null; cap: bigint; vendor: string; source: string | null }>(
    caps.map((c) => [Number(c.item_id), { itemId: Number(c.item_id), name: c.item_name, cap: toBig(c.cap_copper)!, vendor: c.vendor, source: c.source }]));
  // Ventana del potencial: de la fase 2 de Anniversary (incluida) a la fase 4 (excluida).
  const aStart = (name: string) => phases.find((p) => p.economy === 'anniversary' && p.phase === name)?.day ?? null;
  const annivWindow = { from: aStart('Fase 2') ?? DEFAULT_ANNIV_WINDOW.from, to: aStart('Fase 4') ?? DEFAULT_ANNIV_WINDOW.to };
  const foreverLaunch = launch.get('forever') ?? '2026-11-04';
  return { economies, phases, goldValues, vendorCaps, annivWindow, launch, foreverDay: daysBetween(foreverLaunch, today()) };
}

/** Fase de Anniversary en la que cae un día (la última que empezó antes o ese día). */
function phaseOf(phases: Phase[], economy: string, day: number | null): string | null {
  if (day === null) return null;
  const ps = phases.filter((p) => p.economy === economy && p.day !== null && p.day <= day);
  return ps.length ? ps[ps.length - 1].phase : null;
}

async function loadReferences(db: Db, frame: Awaited<ReturnType<typeof loadFrame>>, itemIds?: number[]) {
  const rows = await db.query<any>(
    `select id, economy_id, item_id, item_name, to_char(observed_on,'YYYY-MM-DD') as observed, price_copper, price_min_copper, price_max_copper,
            realm, note, confidence, source_url, created_at
     from timeline_reference ${itemIds ? 'where item_id = any($1::int[])' : ''} order by item_id, observed_on`,
    itemIds ? [itemIds] : [],
  );
  return rows.map((r) => {
    const l = frame.launch.get(r.economy_id) ?? null;
    const day = l ? daysBetween(l, r.observed) : null;
    return {
      id: Number(r.id), economy: r.economy_id as string, itemId: Number(r.item_id), itemName: r.item_name as string | null, observedOn: r.observed as string,
      day, phase: r.economy_id === 'era' ? 'Contexto (economía madura)' : phaseOf(frame.phases, r.economy_id, day),
      price: toBig(r.price_copper)!, min: toBig(r.price_min_copper), max: toBig(r.price_max_copper),
      realm: r.realm as string | null, note: r.note as string | null, confidence: r.confidence as string, source: r.source_url as string,
      createdAt: new Date(r.created_at).toISOString(),
    };
  });
}

type Ref = Awaited<ReturnType<typeof loadReferences>>[number];
const engineRefs = (refs: Ref[]): TimelineRef[] => refs.map((r) => ({ economy: r.economy, day: r.day, price: r.price, min: r.min, max: r.max }));

function evaluate(
  frame: Awaited<ReturnType<typeof loadFrame>>, snap: Awaited<ReturnType<typeof loadSnapshot>>, itemId: number,
  history: TimelineDay[], refs: Ref[], commission: Q, commonGathered = false,
): TimelineResult {
  const loc = snap.local.get(itemId);
  const reg = snap.region.get(itemId);
  return evaluateTimeline({
    history,
    current: loc ? { marketValue: loc.marketValue, minBuyout: loc.minBuyout, quantity: loc.quantity ?? null, auctions: loc.auctions ?? null } : null,
    region: reg ? { soldPerDay: reg.soldPerDay, saleRate: reg.saleRate, avgSalePrice: reg.avgSalePrice, historical: reg.historical } : null,
    references: engineRefs(refs),
    vendorCap: frame.vendorCaps.get(itemId)?.cap ?? null,
    annivWindow: frame.annivWindow,
    commission,
    commonGathered,
  });
}

const VERDICT_ORDER = { comprar: 0, vigilar: 1, esperar: 2, no_conviene: 3, sin_datos: 4 } as const;

/** Hierba (9), metal y piedra (7) o cuero (6) de los objetos comerciales (clase 7) de Blizzard, de calidad común. */
const GATHERED_SUBCLASS = new Set([6, 7, 9]);
const isCommonGathered = (n: any) => n && n.quality === 'COMMON' && Number(n.cls) === 7 && GATHERED_SUBCLASS.has(Number(n.sub));
const ITEM_COLS = `id, name, quality, raw->'item_class'->>'id' as cls, raw->'item_subclass'->>'id' as sub`;

/** Ranking de todos los materiales (reactivos de alguna receta, o con referencia o techo) que tienen historial en la casa. */
export async function timelineRanking(db: Db, ctx: MarketContext) {
  const frame = await loadFrame(db);
  const base = { foreverDay: frame.foreverDay, economies: frame.economies, phases: frame.phases, goldValues: frame.goldValues, annivWindow: frame.annivWindow,
    vendorCaps: [...frame.vendorCaps.values()] };
  if (!ctx.realm) return { ...base, items: [], counts: emptyCounts(), note: 'Elige una casa de subastas para ver el historial.' };
  // Una sola consulta para el historial de todos los materiales (no una por material).
  const hist = await db.query<any>(
    `with mats as (
       select distinct item_id from recipe_reagent where game_version = $1
       union select item_id from timeline_reference union select item_id from timeline_vendor_cap)
     select h.item_id, to_char(h.day,'YYYY-MM-DD') as day, floor(h.market_value_sum / h.samples)::bigint as mv, h.min_buyout_min,
            case when h.quantity_samples > 0 then round(h.quantity_sum::numeric / h.quantity_samples)::int end as qty
     from price_history h join mats m on m.item_id = h.item_id
     where h.game_version = $1 and h.region = $2 and h.realm = $3 and h.day > current_date - $4::int
     order by h.item_id, h.day`,
    [ctx.version, ctx.region, ctx.realm, HISTORY_DAYS],
  );
  const byItem = new Map<number, TimelineDay[]>();
  for (const r of hist) {
    const id = Number(r.item_id);
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id)!.push({ day: r.day, marketValue: toBig(r.mv), minBuyout: toBig(r.min_buyout_min), quantity: toNum(r.qty) });
  }
  const ids = [...byItem.keys()];
  const [snap, settings, names, uses, refs] = await Promise.all([
    loadSnapshot(db, ctx, ids),
    loadSettings(db),
    db.query<any>(`select ${ITEM_COLS} from item where game_version = $1 and id = any($2::int[])`, [ctx.version, ids]),
    db.query<any>(`select item_id, count(distinct recipe_id)::int as n from recipe_reagent where game_version = $1 and item_id = any($2::int[]) group by item_id`, [ctx.version, ids]),
    loadReferences(db, frame, ids),
  ]);
  const commission = Q.parse(commissionFor(settings, ctx.realm));
  const nameOf = new Map(names.map((n) => [Number(n.id), n]));
  const usesOf = new Map(uses.map((u) => [Number(u.item_id), Number(u.n)]));
  const refsOf = new Map<number, Ref[]>();
  for (const r of refs) { if (!refsOf.has(r.itemId)) refsOf.set(r.itemId, []); refsOf.get(r.itemId)!.push(r); }
  const items = ids.map((id) => {
    const n = nameOf.get(id);
    const res = evaluate(frame, snap, id, byItem.get(id)!, refsOf.get(id) ?? [], commission, isCommonGathered(n));
    const fallback = refsOf.get(id)?.[0]?.itemName ?? frame.vendorCaps.get(id)?.name ?? snap.local.get(id)?.name ?? null;
    return {
      itemId: id, name: n?.name ?? fallback, quality: n?.quality ?? null, uses: usesOf.get(id) ?? 0, references: refsOf.get(id)?.length ?? 0,
      auctions: snap.local.get(id)?.auctions ?? null, ...res,
    };
  });
  items.sort((a, b) => (a.score === null ? 1 : 0) - (b.score === null ? 1 : 0) || (b.score ?? 0) - (a.score ?? 0)
    || VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || (b.soldPerDay ?? -1) - (a.soldPerDay ?? -1) || String(a.name).localeCompare(String(b.name)));
  const counts = emptyCounts();
  for (const i of items) counts[i.verdict]++;
  return { ...base, items, counts, market: { runs: snap.runs } };
}

function emptyCounts() {
  return { comprar: 0, vigilar: 0, esperar: 0, no_conviene: 0, sin_datos: 0 };
}

/** Detalle de un material: historial completo (hasta 60 días), referencias, resultado del motor y tramos de venta. */
export async function timelineItem(db: Db, ctx: MarketContext, itemId: number) {
  const frame = await loadFrame(db);
  const hist = ctx.realm ? await db.query<any>(
    `select to_char(day,'YYYY-MM-DD') as day, samples, floor(market_value_sum / samples)::bigint as mv, min_buyout_min,
            case when quantity_samples > 0 then round(quantity_sum::numeric / quantity_samples)::int end as qty
     from price_history where game_version=$1 and region=$2 and realm=$3 and item_id=$4 and day > current_date - $5::int order by day`,
    [ctx.version, ctx.region, ctx.realm, itemId, HISTORY_DAYS],
  ) : [];
  const history = hist.map((r) => ({ day: r.day as string, marketValue: toBig(r.mv), minBuyout: toBig(r.min_buyout_min), quantity: toNum(r.qty), samples: Number(r.samples) }));
  const [snap, settings, it, uses, refs] = await Promise.all([
    loadSnapshot(db, ctx, [itemId]),
    loadSettings(db),
    db.query<any>(`select ${ITEM_COLS} from item where game_version=$1 and id=$2`, [ctx.version, itemId]),
    db.query<any>(`select count(distinct recipe_id)::int as n from recipe_reagent where game_version=$1 and item_id=$2`, [ctx.version, itemId]),
    loadReferences(db, frame, [itemId]),
  ]);
  const commission = Q.parse(commissionFor(settings, ctx.realm));
  const result = evaluate(frame, snap, itemId, history, refs, commission, isCommonGathered(it[0]));
  const tiers = sellTiers(result.priceToday, { peak: result.peak, annivRef: result.annivMedian, cap: result.vendorCap, commission });
  const cap = frame.vendorCaps.get(itemId) ?? null;
  const name = it[0]?.name ?? refs[0]?.itemName ?? cap?.name ?? snap.local.get(itemId)?.name ?? null;
  const launch = frame.launch.get('forever') ?? '2026-11-04';
  return {
    itemId, name, quality: it[0]?.quality ?? null, uses: Number(uses[0]?.n ?? 0), realm: ctx.realm,
    foreverDay: frame.foreverDay, economies: frame.economies, phases: frame.phases, annivWindow: frame.annivWindow,
    history: history.map((h) => ({ ...h, foreverDay: daysBetween(launch, h.day) })),
    references: refs, vendorCap: cap, result, tiers, commission: commissionFor(settings, ctx.realm),
    current: snap.local.get(itemId) ? { quantity: snap.local.get(itemId)!.quantity ?? null, auctions: snap.local.get(itemId)!.auctions ?? null } : null,
  };
}

// --- Referencias (solo administrador: isOpenRequest exige la contraseña para POST, PUT y DELETE) ---

const gold = z.union([z.string(), z.number()]).transform((v, c) => {
  try {
    const x = Q.parse(String(v)).mul(COPPER_PER_GOLD);
    if (!x.isInteger() || x.sign() <= 0) throw new Error();
    return x.n;
  } catch {
    c.addIssue({ code: z.ZodIssueCode.custom, message: 'Importe inválido (oro mayor que 0, hasta 4 decimales).' });
    return z.NEVER;
  }
});
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const ReferenceInput = z.object({
  economy: z.enum(['anniversary', 'forever', 'era']),
  itemId: z.coerce.number().int().positive(),
  itemName: optText(120),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD).').refine((d) => !Number.isNaN(Date.parse(d)), 'Fecha inválida.'),
  gold,
  goldMin: gold.optional().nullable(),
  goldMax: gold.optional().nullable(),
  realm: optText(120),
  note: optText(300),
  confidence: z.enum(['alta', 'media', 'baja']).default('media'),
  sourceUrl: z.string().trim().max(500).url('Enlace inválido.').refine((u) => u.startsWith('https://'), 'La fuente tiene que empezar por https://.'),
}).refine((r) => !r.goldMin || r.goldMin <= r.gold, { message: 'El mínimo no puede ser mayor que el precio.', path: ['goldMin'] })
  .refine((r) => !r.goldMax || r.goldMax >= r.gold, { message: 'El máximo no puede ser menor que el precio.', path: ['goldMax'] });

function parseReference(b: unknown) {
  const r = ReferenceInput.safeParse(b);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? 'Referencia inválida.', r.error.issues);
  return r.data;
}

/** Una referencia idéntica (misma economía, objeto, fecha, reino y precio) ya existe → 409. */
async function noDuplicate<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (/duplicate|unique|23505/i.test(`${(e as any)?.code ?? ''} ${(e as Error).message}`)) {
      throw new HttpError(409, 'Ya existe una referencia igual (misma economía, objeto, fecha, reino y precio).');
    }
    throw e;
  }
}

export async function createReference(db: Db, b: unknown) {
  const r = parseReference(b);
  const [row] = await noDuplicate(db.query<any>(
    `insert into timeline_reference (economy_id, item_id, item_name, observed_on, price_copper, price_min_copper, price_max_copper, realm, note, confidence, source_url)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [r.economy, r.itemId, r.itemName, r.observedOn, r.gold.toString(), r.goldMin?.toString() ?? null, r.goldMax?.toString() ?? null, r.realm, r.note, r.confidence, r.sourceUrl],
  ));
  return { id: Number(row.id) };
}

export async function updateReference(db: Db, id: number, b: unknown) {
  const r = parseReference(b);
  const rows = await noDuplicate(db.query<any>(
    `update timeline_reference set economy_id=$2, item_id=$3, item_name=$4, observed_on=$5, price_copper=$6, price_min_copper=$7, price_max_copper=$8,
       realm=$9, note=$10, confidence=$11, source_url=$12 where id=$1 returning id`,
    [id, r.economy, r.itemId, r.itemName, r.observedOn, r.gold.toString(), r.goldMin?.toString() ?? null, r.goldMax?.toString() ?? null, r.realm, r.note, r.confidence, r.sourceUrl],
  ));
  if (!rows.length) throw new HttpError(404, 'Referencia no encontrada.');
  return { id };
}

export async function deleteReference(db: Db, id: number) {
  const rows = await db.query<any>(`delete from timeline_reference where id=$1 returning id`, [id]);
  if (!rows.length) throw new HttpError(404, 'Referencia no encontrada.');
  return { ok: true };
}
