/**
 * Evaluación de recetas contra un contexto de mercado: precios, canal de venta,
 * calidades, demanda, perfil del personaje y clasificación. Usa el motor puro.
 */
import { Q, COPPER_PER_GOLD } from '../engine/rational.js';
import { computeCost, computeProfit, classify, applyPriceDrop, type Status, type ProfitResult, type CostResult } from '../engine/calc.js';
import type { Db } from './db.js';
import { loadSnapshot, ageHours, type MarketContext, type MarketSnapshot } from './market.js';
import { DEFAULT_SETTINGS, type Settings, type PriceField } from './config.js';
import { QUALITY_SYSTEM_EXPANSIONS } from './catalog/rules.js';

export interface RecipeRow {
  id: number;
  profession_id: number;
  profession: string;
  profession_kind: string;
  skill_tier_id: number | null;
  tier: string | null;
  expansion: string;
  category: string | null;
  name: string | null;
  crafted_item_id: number | null;
  alliance_item_id: number | null;
  horde_item_id: number | null;
  qty_min: number | null;
  qty_max: number | null;
  has_modified_slots: boolean | null;
  fetch_error: string | null;
}

export interface ItemRow {
  id: number;
  name: string | null;
  name_en: string | null;
  quality: string | null;
  binding: string | null;
  fetch_error: string | null;
}

export interface Profile {
  id?: string;
  name?: string;
  faction?: 'alliance' | 'horde' | null;
  professions?: Array<{ professionId: number; skill?: number | null }>;
  knownRecipes?: number[];
  inventory?: Record<string, number>;
  updatedAt?: string;
}

export interface Overrides {
  /** Precios manuales de materiales en oro, por itemId. */
  prices?: Record<string, string>;
  sellPrice?: string;
  commission?: string;
  lostDeposits?: string;
  recoverableDeposits?: string;
  targetProfit?: string;
  additionalCost?: string;
  priceDrop?: string;
  /** Unidades por ejecución manuales (para rendimiento variable). */
  units?: number;
  runs?: number;
  /** Escenario de calidad asumido manualmente (identificado como manual). */
  assumeQuality?: boolean;
}

export interface PriceInfo {
  copper: Q | null;
  field: PriceField | 'manual';
  scope: 'commodity (región)' | 'reino' | 'región' | 'manual' | 'sin datos';
  sourceTime: string | null;
  observed: Partial<Record<PriceField, string | null>>;
}

export interface Evaluation {
  recipeKey: string;
  recipeId: number;
  name: string;
  profession: string;
  professionId: number;
  professionKind: string;
  expansion: string;
  tier: string | null;
  category: string | null;
  output: { itemId: number | null; name: string | null; quality: string | null; binding: string | null } | null;
  unitsPerRun: number | null;
  yieldRange: [number | null, number | null];
  runs: number;
  reagents: Array<{ itemId: number; name: string | null; quantity: number | null; price: PriceInfo; subtotal: Q | null; owned: number; toBuy: number; variants: number[] }>;
  sellPrice: PriceInfo;
  channel: 'subasta' | 'vinculado' | 'servicio' | 'desconocido';
  channelReason: string;
  cost: Pick<CostResult, 'materials' | 'batch' | 'unit' | 'outOfPocket' | 'missing'>;
  profit: ProfitResult;
  dropScenario: { drop: string; price: Q | null; profit: ProfitResult } | null;
  demand: { saleRate: number | null; soldPerDay: number | null; avgSalePrice: Q | null; sourceTime: string | null; scope: 'región' } | null;
  freshness: { localHours: number | null; regionHours: number | null; stale: boolean };
  status: Status;
  reasons: string[];
  notes: string[];
  manual: boolean;
  /** Hay cualquier modificación del usuario (incluida la caída de precio). */
  edited: boolean;
  character: string;
}

const g = (s: string | undefined | null): Q | null => (s === undefined || s === null || s.trim() === '' ? null : Q.parse(s).mul(COPPER_PER_GOLD));
const q = (b: bigint | null | undefined): Q | null => (b === null || b === undefined ? null : Q.of(b));

function observedFor(snap: MarketSnapshot, itemId: number) {
  const l = snap.local.get(itemId);
  const r = snap.region.get(itemId);
  const s = (v: bigint | null | undefined) => (v === null || v === undefined ? null : v.toString());
  return {
    local: l,
    region: r,
    observed: {
      marketValue: s(l?.marketValue), minBuyout: s(l?.minBuyout), recent: s(l?.recent), historical: s(l?.historical),
      regionMarketValue: s(r?.marketValue), regionAvgSalePrice: s(r?.avgSalePrice),
    } as Partial<Record<PriceField, string | null>>,
  };
}

export function resolvePrice(snap: MarketSnapshot, itemId: number, field: PriceField, manualGold?: string): PriceInfo {
  const o = observedFor(snap, itemId);
  if (manualGold !== undefined && manualGold !== '') {
    return { copper: g(manualGold), field: 'manual', scope: 'manual', sourceTime: null, observed: o.observed };
  }
  const regionField = field === 'regionMarketValue' || field === 'regionAvgSalePrice';
  if (regionField) {
    const v = field === 'regionMarketValue' ? o.region?.marketValue : o.region?.avgSalePrice;
    return { copper: q(v), field, scope: v ? 'región' : 'sin datos', sourceTime: snap.runs.region_items?.sourceTime ?? null, observed: o.observed };
  }
  const l = o.local;
  const v = l ? (l as any)[field] as bigint | null : null;
  const scope = !v ? 'sin datos' : l!.kind === 'commodities' ? 'commodity (región)' : 'reino';
  const st = l ? snap.runs[l.kind]?.sourceTime ?? null : null;
  return { copper: q(v), field, scope, sourceTime: st, observed: o.observed };
}

/** Índice nombre → itemIds observados en TSM, para detectar variantes de calidad (no para unir precios). */
export function variantIndex(snap: MarketSnapshot): Map<string, number[]> {
  const m = new Map<string, number[]>();
  const add = (id: number, name: string | null) => {
    if (!name) return;
    const arr = m.get(name) ?? [];
    if (!arr.includes(id)) arr.push(id);
    m.set(name, arr);
  };
  for (const [id, v] of snap.local) add(id, v.name);
  for (const [id, v] of snap.region) add(id, v.name);
  return m;
}

export interface EvalContext {
  snap: MarketSnapshot;
  settings: Settings;
  items: Map<number, ItemRow>;
  reagents: Map<number, Array<{ item_id: number; quantity: number | null }>>;
  variants: Map<string, number[]>;
  profile: Profile | null;
  now?: number;
}

function sellability(output: ItemRow | undefined, itemId: number | null, snap: MarketSnapshot): { channel: Evaluation['channel']; reason: string } {
  if (itemId === null) return { channel: 'servicio', reason: 'La receta no produce un objeto (efecto aplicado o servicio); no se compara con una venta en subasta.' };
  const b = output?.binding ?? null;
  if (b && /ON_ACQUIRE|ON_PICKUP|QUEST/i.test(b)) return { channel: 'vinculado', reason: `El resultado se liga al recogerlo (${b}).` };
  if (b && /ACCOUNT|WARBOUND|BNET/i.test(b) && !/EQUIP/i.test(b)) return { channel: 'vinculado', reason: `El resultado está ligado a la cuenta (${b}).` };
  const observed = snap.local.has(itemId) || snap.region.has(itemId);
  if (observed) return { channel: 'subasta', reason: 'Observado en los datos de subasta de TSM para este mercado.' };
  if (b) return { channel: 'desconocido', reason: `Vinculación "${b}" sin observaciones en subasta para este mercado.` };
  return { channel: 'desconocido', reason: 'No hay datos de vinculación ni observaciones en subasta.' };
}

export function evaluateRecipe(r: RecipeRow, ctx: EvalContext, ov: Overrides = {}): Evaluation {
  const { snap, settings, items, profile } = ctx;
  const now = ctx.now ?? Date.now();
  const blockers: string[] = [];
  const notes: string[] = [];
  let manual = false;
  if (r.fetch_error) blockers.push(`Receta incompleta: ${r.fetch_error}`);

  // Resultado y facción
  let outId = r.crafted_item_id;
  if (outId === null && (r.alliance_item_id || r.horde_item_id)) {
    if (r.alliance_item_id === r.horde_item_id) outId = r.alliance_item_id;
    else if (profile?.faction === 'alliance') outId = r.alliance_item_id;
    else if (profile?.faction === 'horde') outId = r.horde_item_id;
    else {
      outId = r.alliance_item_id ?? r.horde_item_id;
      blockers.push('El resultado depende de la facción; indícala en el perfil.');
    }
  }
  const outItem = outId !== null ? items.get(outId) : undefined;
  if (outId !== null && (!outItem || outItem.fetch_error)) notes.push('Faltan los detalles del objeto resultante en el catálogo.');
  const sell = sellability(outItem, outId, snap);

  // Rendimiento
  let unitsPerRun: number | null = r.qty_min !== null && r.qty_min === r.qty_max ? r.qty_min : null;
  let yieldKnown = unitsPerRun !== null && unitsPerRun > 0;
  if (r.qty_min !== null && r.qty_max !== null && r.qty_min !== r.qty_max) {
    blockers.push(`Rendimiento variable (${r.qty_min}–${r.qty_max} por ejecución) sin regla verificada.`);
  }
  if (ov.units !== undefined) {
    unitsPerRun = ov.units;
    yieldKnown = Number.isInteger(ov.units) && ov.units > 0;
    manual = true;
    if (yieldKnown) {
      const i = blockers.findIndex((b) => b.startsWith('Rendimiento variable'));
      if (i >= 0) blockers.splice(i, 1);
    }
  }
  const runs = ov.runs ?? 1;

  // Calidades
  const quality = QUALITY_SYSTEM_EXPANSIONS.has(r.expansion);
  const outName = outItem?.name_en ?? snap.local.get(outId ?? -1)?.name ?? snap.region.get(outId ?? -1)?.name ?? null;
  const outVariants = outName ? (ctx.variants.get(outName) ?? []).filter((x) => x !== outId) : [];
  if (quality || outVariants.length) {
    const why = outVariants.length
      ? `El resultado tiene otras variantes de calidad con el mismo nombre (IDs ${outVariants.join(', ')}); no se puede determinar cuál se obtiene.`
      : `Receta de ${r.expansion}: la calidad del resultado depende de habilidad, especialización y reactivos, y TSM no distingue variantes de calidad del equipo. No hay reglas verificadas.`;
    if (ov.assumeQuality) {
      manual = true;
      notes.push(`Calidad asumida manualmente: ${why}`);
    } else blockers.push(why);
  }

  // Materiales
  const inv = profile?.inventory ?? {};
  const rlist = ctx.reagents.get(r.id) ?? [];
  if (!rlist.length && !r.fetch_error) blockers.push('La receta no tiene ingredientes registrados en el catálogo.');
  const reagents = rlist.map((x) => {
    const manualPrice = ov.prices?.[String(x.item_id)];
    if (manualPrice !== undefined && manualPrice !== '') manual = true;
    const price = resolvePrice(snap, x.item_id, settings.buySource, manualPrice);
    const it = items.get(x.item_id);
    const nm = it?.name ?? snap.local.get(x.item_id)?.name ?? snap.region.get(x.item_id)?.name ?? null;
    const variants = (it?.name_en ?? nm) ? (ctx.variants.get(it?.name_en ?? nm!) ?? []).filter((v) => v !== x.item_id) : [];
    return { itemId: x.item_id, name: nm, quantity: x.quantity, price, owned: Number(inv[String(x.item_id)] ?? 0), variants };
  });
  if (reagents.some((x) => x.quantity === null)) blockers.push('Hay ingredientes sin cantidad definida.');
  if (reagents.some((x) => x.variants.length)) notes.push('Algunos materiales existen en varias calidades: se usa el precio del ID exacto que indica la receta.');
  const lines = reagents
    .filter((x) => x.quantity !== null)
    .map((x) => ({ itemKey: String(x.itemId), name: x.name ?? `Objeto ${x.itemId}`, quantity: x.quantity!, unitPrice: x.price.copper, owned: x.owned }));
  if (lines.some((l) => l.unitPrice)) notes.push('El costo es estimado: no se conoce la profundidad del mercado para comprar toda la cantidad al precio indicado.');

  let additional = Q.zero;
  if (ov.additionalCost) { additional = g(ov.additionalCost) ?? Q.zero; manual = true; }
  const cost = yieldKnown ? computeCost(lines, unitsPerRun!, additional, runs) : computeCost(lines, 1, additional, runs);
  if (cost.errors.length) blockers.push(...cost.errors);

  // Precio de venta
  if (ov.sellPrice !== undefined && ov.sellPrice !== '') manual = true;
  const sellPrice = outId !== null ? resolvePrice(snap, outId, settings.sellSource, ov.sellPrice) : { copper: null, field: settings.sellSource, scope: 'sin datos' as const, sourceTime: null, observed: {} };
  const commission = ov.commission !== undefined && ov.commission !== '' ? Q.parse(ov.commission) : Q.parse(settings.commission);
  if (ov.commission) manual = true;
  const lost = g(ov.lostDeposits) ?? Q.zero;
  const recov = g(ov.recoverableDeposits) ?? Q.zero;
  const target = g(ov.targetProfit) ?? Q.zero;
  const totalUnits = yieldKnown ? unitsPerRun! * runs : 0;
  // Sin rendimiento conocido no se calcula ganancia (no se asume 1 unidad).
  const profit = computeProfit({
    units: yieldKnown ? totalUnits : 1, price: yieldKnown ? sellPrice.copper : null, commission, cost: yieldKnown ? cost.batch : null,
    lostDeposits: lost, recoverableDeposits: recov, targetProfit: target,
  });
  let dropScenario: Evaluation['dropScenario'] = null;
  if (ov.priceDrop) {
    const drop = Q.parse(ov.priceDrop).div(100);
    const p2 = applyPriceDrop(sellPrice.copper, drop);
    dropScenario = { drop: ov.priceDrop, price: p2, profit: computeProfit({ units: yieldKnown ? totalUnits : 1, price: p2, commission, cost: cost.batch, lostDeposits: lost, recoverableDeposits: recov, targetProfit: target }) };
  }

  // Frescura
  const usedLocal = [sellPrice, ...reagents.map((x) => x.price)].some((p) => p.scope === 'reino' || p.scope === 'commodity (región)');
  const localTimes = [snap.runs.commodities?.sourceTime, snap.runs.realm_items?.sourceTime].filter(Boolean) as string[];
  const localHours = localTimes.length ? Math.max(...localTimes.map((t) => ageHours(t, now)!)) : null;
  const regionHours = ageHours(snap.runs.region_items?.sourceTime, now);
  const staleParts: string[] = [];
  if (usedLocal && localHours !== null && localHours > settings.maxAgeHoursRealm) staleParts.push(`precios de reino/commodities con ${localHours.toFixed(1)} h (máx. ${settings.maxAgeHoursRealm} h)`);
  const usedRegion = [sellPrice, ...reagents.map((x) => x.price)].some((p) => p.scope === 'región');
  if (regionHours !== null && regionHours > settings.maxAgeHoursRegion && usedRegion) staleParts.push(`estadísticas regionales con ${regionHours.toFixed(1)} h (máx. ${settings.maxAgeHoursRegion} h)`);
  const stale = staleParts.length > 0;

  // Demanda (solo regional en los archivos públicos)
  const reg = outId !== null ? snap.region.get(outId) : undefined;
  let demand: Evaluation['demand'] = reg
    ? { saleRate: reg.saleRate, soldPerDay: reg.soldPerDay, avgSalePrice: q(reg.avgSalePrice), sourceTime: snap.runs.region_items?.sourceTime ?? null, scope: 'región' }
    : null;
  if (demand && regionHours !== null && regionHours > settings.maxAgeHoursRegion) {
    notes.push(`Las señales de demanda tienen ${regionHours.toFixed(1)} h, por encima del máximo configurado.`);
    demand = null;
  }

  // Personaje
  let character: 'conoce' | 'no_conoce' | 'requisito_no_cumplido' | 'sin_perfil' = 'sin_perfil';
  if (profile) {
    const hasProf = (profile.professions ?? []).some((p) => p.professionId === r.profession_id);
    if (!(profile.professions ?? []).length && !(profile.knownRecipes ?? []).length) character = 'sin_perfil';
    else if (!hasProf) character = 'requisito_no_cumplido';
    else if ((profile.knownRecipes ?? []).includes(r.id)) character = 'conoce';
    else character = 'no_conoce';
    if (character === 'conoce') notes.push('El nivel de habilidad requerido no se comprueba: la API no lo expone por receta de forma verificada.');
  }

  const cls = classify({
    sellable: sell.channel === 'subasta' ? 'si' : sell.channel === 'desconocido' ? 'desconocido' : 'no',
    sellableReason: sell.reason,
    character,
    costMissing: cost.missing.map((k) => reagents.find((x) => String(x.itemId) === k)?.name ?? k),
    outputPriceKnown: sellPrice.copper !== null,
    yieldKnown,
    dataBlockers: blockers,
    stale,
    staleDetail: stale ? `Datos fuera de vigencia: ${staleParts.join('; ')}.` : undefined,
    profit,
    demand: demand ? { saleRate: demand.saleRate, soldPerDay: demand.soldPerDay } : null,
    manual,
    thresholds: {
      minProfitUnit: Q.parse(settings.minProfitUnitGold).mul(COPPER_PER_GOLD),
      minRoiPct: Q.parse(settings.minRoiPct),
      minSaleRate: settings.minSaleRate,
      minSoldPerDay: settings.minSoldPerDay,
    },
  });
  if (demand) notes.push('La tasa y el volumen son regionales: no son probabilidad de venta diaria ni ventas de tu personaje.');

  const costLines = cost.lines;
  return {
    recipeKey: `${snap.ctx.version}:${r.id}`,
    recipeId: r.id,
    name: r.name ?? outItem?.name ?? `Receta ${r.id}`,
    profession: r.profession,
    professionId: r.profession_id,
    professionKind: r.profession_kind,
    expansion: r.expansion,
    tier: r.tier,
    category: r.category,
    output: outId !== null ? { itemId: outId, name: outItem?.name ?? outName, quality: outItem?.quality ?? null, binding: outItem?.binding ?? null } : null,
    unitsPerRun: yieldKnown ? unitsPerRun : null,
    yieldRange: [r.qty_min, r.qty_max],
    runs,
    reagents: reagents.map((x) => {
      const l = costLines.find((c) => c.itemKey === String(x.itemId));
      return { ...x, subtotal: l?.subtotal ?? null, toBuy: l?.toBuy ?? 0 };
    }),
    sellPrice,
    channel: sell.channel,
    channelReason: sell.reason,
    cost: { materials: cost.materials, batch: cost.batch, unit: yieldKnown ? cost.unit : null, outOfPocket: cost.outOfPocket, missing: cost.missing },
    profit,
    dropScenario,
    demand,
    freshness: { localHours, regionHours, stale },
    status: cls.status,
    reasons: cls.reasons,
    notes: [...cls.notes, ...notes],
    manual,
    edited: Object.values(ov).some((v) => v !== undefined && v !== '' && v !== false && !(typeof v === 'object' && v !== null && !Object.values(v).some((x) => x !== ''))),
    character,
  };
}

// ---------------------------------------------------------------------------
// Carga desde base de datos
// ---------------------------------------------------------------------------

export async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.query<{ value: any }>(`select value from app_setting where key='settings'`);
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.value ?? {}) };
}

export interface RecipeFilter {
  professionId?: number;
  expansion?: string;
  search?: string;
  recipeIds?: number[];
}

export async function loadRecipes(db: Db, version: string, f: RecipeFilter = {}): Promise<RecipeRow[]> {
  const where = ['r.game_version=$1'];
  const params: unknown[] = [version];
  if (f.professionId) { params.push(f.professionId); where.push(`r.profession_id=$${params.length}`); }
  if (f.expansion) { params.push(f.expansion); where.push(`coalesce(t.expansion,'Sin clasificar')=$${params.length}`); }
  if (f.recipeIds) { params.push(f.recipeIds); where.push(`r.id = any($${params.length}::int[])`); }
  if (f.search) {
    params.push(`%${f.search.toLowerCase()}%`);
    where.push(`(lower(coalesce(r.name,'')) like $${params.length} or exists (select 1 from item i where i.game_version=r.game_version and i.id=r.crafted_item_id and (lower(coalesce(i.name,'')) like $${params.length} or lower(coalesce(i.name_en,'')) like $${params.length})))`);
  }
  const rows = await db.query<any>(
    `select r.id, r.profession_id, p.name as profession, p.kind as profession_kind, r.skill_tier_id, t.name as tier,
            coalesce(t.expansion,'Sin clasificar') as expansion, r.category, r.name, r.crafted_item_id, r.alliance_item_id, r.horde_item_id,
            r.qty_min, r.qty_max, r.has_modified_slots, r.fetch_error
     from recipe r join profession p on p.game_version=r.game_version and p.id=r.profession_id
     left join skill_tier t on t.game_version=r.game_version and t.id=r.skill_tier_id
     where ${where.join(' and ')}`,
    params,
  );
  return rows.map((x) => ({ ...x, id: Number(x.id), profession_id: Number(x.profession_id), crafted_item_id: x.crafted_item_id === null ? null : Number(x.crafted_item_id),
    alliance_item_id: x.alliance_item_id === null ? null : Number(x.alliance_item_id), horde_item_id: x.horde_item_id === null ? null : Number(x.horde_item_id),
    qty_min: x.qty_min === null ? null : Number(x.qty_min), qty_max: x.qty_max === null ? null : Number(x.qty_max) }));
}

export async function buildEvalContext(db: Db, ctx: MarketContext, recipes: RecipeRow[], profile: Profile | null, settings?: Settings): Promise<EvalContext> {
  const ids = recipes.map((r) => r.id);
  const rr = ids.length
    ? await db.query<any>(`select recipe_id, item_id, quantity from recipe_reagent where game_version=$1 and recipe_id = any($2::int[]) order by recipe_id, slot`, [ctx.version, ids])
    : [];
  const reagents = new Map<number, Array<{ item_id: number; quantity: number | null }>>();
  for (const x of rr) {
    const k = Number(x.recipe_id);
    const arr = reagents.get(k) ?? [];
    arr.push({ item_id: Number(x.item_id), quantity: x.quantity === null ? null : Number(x.quantity) });
    reagents.set(k, arr);
  }
  const itemIds = new Set<number>();
  for (const r of recipes) for (const v of [r.crafted_item_id, r.alliance_item_id, r.horde_item_id]) if (v !== null) itemIds.add(v);
  for (const x of rr) itemIds.add(Number(x.item_id));
  const its = itemIds.size
    ? await db.query<any>(`select id, name, name_en, quality, binding, fetch_error from item where game_version=$1 and id = any($2::int[])`, [ctx.version, [...itemIds]])
    : [];
  const items = new Map<number, ItemRow>(its.map((i) => [Number(i.id), { ...i, id: Number(i.id) }]));
  // Snapshot completo: necesario para detectar variantes de calidad por nombre.
  const snap = await loadSnapshot(db, ctx);
  return { snap, settings: settings ?? (await loadSettings(db)), items, reagents, variants: variantIndex(snap), profile };
}
