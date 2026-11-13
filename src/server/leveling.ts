/**
 * Subida de nivel por profesión: recetas y umbrales de dificultad de Wowhead (data/leveling/forever-wowhead.json),
 * precios de la casa de subastas elegida (campo de compra de «Ajustes») y nombres del catálogo de Blizzard.
 */
import type { Db } from './db.js';
import { HttpError, loadSnapshot, type MarketContext } from './market.js';
import { resolvePrice } from './evaluate.js';
import { commissionFor, type Settings } from './config.js';
import { planLeveling, type LevelPlan, type LevelRecipe } from '../engine/leveling.js';
import { planRoute, rankRequirements, type RouteMode, type RouteResult } from '../engine/route.js';
import { castSecondsOf, SPELL_TOOLS, SPELL_DETAILS_SOURCE } from './spellDetails.js';
import { Q, COPPER_PER_GOLD } from '../engine/rational.js';

/** «id:oro,id:oro» → precios manuales en cobre. Oro con hasta 4 decimales (cobre entero), ≥ 0. */
export function parseManualPrices(raw: string | null | undefined): Map<number, Q> {
  const out = new Map<number, Q>();
  if (!raw) return out;
  const parts = raw.split(',').filter(Boolean);
  if (parts.length > 200) throw new HttpError(400, 'Demasiados precios manuales.');
  for (const p of parts) {
    const m = /^(\d{1,9}):(\d{1,7}(?:\.\d{1,4})?)$/.exec(p.trim());
    if (!m) throw new HttpError(400, `Precio manual inválido: «${p.slice(0, 40)}» (formato id:oro, p. ej. 14341:0.5).`);
    out.set(Number(m[1]), Q.parse(m[2]).mul(COPPER_PER_GOLD));
  }
  return out;
}
import dataset from '../../data/leveling/forever-wowhead.json' with { type: 'json' };
import { SPELL_COOLDOWNS as COOLDOWNS, reagentKey } from './cooldowns.js';
/**
 * Reutilización de una receta: la comprobada en Wowhead (se revisaron todas las recetas del conjunto de datos).
 * Si se añade una receta nueva sin revisar, las transmutaciones se tratan como con 1 h (todas las de Forever la tienen).
 */
export function cooldownOf(r: { id: number; name: string }): number {
  const known = COOLDOWNS.get(r.id);
  if (known !== undefined) return known;
  return /^Transmute\b/i.test(r.name) ? 3600 : 0;
}

interface WhRecipe {
  id: number;
  name: string;
  learnedAt: number;
  colors: [number, number, number, number];
  skillUps: number;
  source: number[];
  trainingCost: number;
  creates?: { itemId: number; min: number; max: number };
  reagents: Array<{ itemId: number; quantity: number }>;
}
interface WhProfession { professionId: number; slug: string; sourceUrl: string; fetchedAt: string; recipes: WhRecipe[] }
const DATA = dataset as unknown as { gameVersion: string; source: string; professions: WhProfession[] };

/** En los listados de Wowhead, la fuente 6 es «instructor». El resto (patrones, botín, misiones…) no se enseña. */
const TRAINER_SOURCE = 6;
/**
 * Objetivo por defecto: 300, el máximo de Artesano en Classic. No es un límite impuesto: el catálogo de Blizzard
 * de Forever solo publica el rango Aprendiz (1–75) y Wowhead tiene recetas que se aprenden por encima de 300.
 */
const DEFAULT_TARGET = 300;

/**
 * Recetas iniciales (inferido de los datos, no indicado por Wowhead): sin fuente, naranja desde 0 y aprendizaje ≤ 50.
 * En esas filas `learnedat` coincide con el umbral amarillo, no con el requisito: se usan desde el nivel 1.
 * Por encima de 50, «sin fuente y naranja desde 0» también aparece en recetas de misión o botín, así que no se infiere.
 */
const STARTER_MAX_LEARNED = 50;
export function availabilityOf(r: Pick<WhRecipe, 'source' | 'colors' | 'learnedAt'>): LevelRecipe['availability'] {
  if (r.source.includes(TRAINER_SOURCE)) return 'instructor';
  if (r.source.length === 0 && r.colors[0] === 0 && r.learnedAt <= STARTER_MAX_LEARNED) return 'inicial';
  return 'otra';
}

const toLevel = (r: WhRecipe): LevelRecipe => {
  const availability = availabilityOf(r);
  return {
    id: r.id, name: r.name, learnedAt: availability === 'inicial' ? 1 : r.learnedAt, colors: r.colors, skillUps: Math.max(1, r.skillUps || 1),
    availability, trainingCost: availability === 'instructor' ? BigInt(Math.max(0, Math.floor(r.trainingCost || 0))) : 0n, reagents: r.reagents,
    cooldown: cooldownOf(r), castSeconds: castSecondsOf(r.id),
  };
};

export async function levelingProfessions(db: Db, version: string) {
  if (version !== DATA.gameVersion) return { professions: [], source: DATA.source };
  const names = await db.query<any>(`select id, name from profession where game_version=$1`, [version]);
  const byId = new Map(names.map((n) => [Number(n.id), n.name as string]));
  return {
    source: DATA.source,
    professions: DATA.professions.map((p) => ({
      id: p.professionId, name: byId.get(p.professionId) ?? p.slug, recipes: p.recipes.length,
      trainerRecipes: p.recipes.filter((r) => availabilityOf(r) === 'instructor').length,
      starterRecipes: p.recipes.filter((r) => availabilityOf(r) === 'inicial').length,
      maxSkill: Math.max(...p.recipes.map((r) => r.colors[3])),
      defaultTo: Math.min(DEFAULT_TARGET, Math.max(...p.recipes.map((r) => r.colors[3]))),
      sourceUrl: p.sourceUrl, fetchedAt: p.fetchedAt,
    })),
  };
}

function professionOf(ctx: MarketContext, professionId: number): WhProfession {
  if (ctx.version !== DATA.gameVersion) throw new HttpError(404, 'No hay datos de subida de nivel para esta versión del juego.');
  const prof = DATA.professions.find((p) => p.professionId === professionId);
  if (!prof) throw new HttpError(404, 'No hay datos de subida de nivel para esta profesión (las de recolección se suben recolectando).');
  return prof;
}
const maxSkillOf = (prof: WhProfession) => Math.max(...prof.recipes.map((r) => r.colors[3]));

function checkRange(prof: WhProfession, from: number, to: number) {
  const maxSkill = maxSkillOf(prof);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > maxSkill || to <= from) {
    throw new HttpError(400, `Rango inválido: el nivel inicial debe ser ≥ 1 y menor que el final, y el final ≤ ${maxSkill}.`);
  }
  return maxSkill;
}

/** Precios para una profesión: manual del usuario (si lo indica) y, si no, la casa de subastas (campo de compra). */
async function pricingFor(db: Db, ctx: MarketContext, settings: Settings, prof: WhProfession, manual: Map<number, Q>) {
  // Materiales y objetos creados (estos, para la recuperación hipotética por venta).
  const itemIds = [...new Set(prof.recipes.flatMap((r) => [...r.reagents.map((g) => g.itemId), ...(r.creates ? [r.creates.itemId] : [])]))];
  const snap = await loadSnapshot(db, ctx, itemIds);
  const price = (id: number) => manual.get(id) ?? resolvePrice(snap, id, settings.buySource).copper;
  const priceSource = (id: number) => (manual.has(id) ? 'manual' : resolvePrice(snap, id, settings.buySource).copper ? 'casa de subastas' : 'sin datos');
  return { snap, price, priceSource, manual };
}
type Pricing = Awaited<ReturnType<typeof pricingFor>>;

/** Catálogo de Blizzard de la profesión, agrupado por clave (objeto creado + materiales) para enlazar con Wowhead. */
async function catalogByKey(db: Db, version: string, professionId: number) {
  const catalog = await db.query<any>(
    `select r.id, r.name, r.crafted_item_id, coalesce(json_agg(json_build_object('itemId', g.item_id, 'quantity', g.quantity)) filter (where g.item_id is not null), '[]') as reagents
     from recipe r left join recipe_reagent g on g.game_version=r.game_version and g.recipe_id=r.id and not g.optional
     where r.game_version=$1 and r.profession_id=$2 and r.fetch_error is null group by r.id, r.name, r.crafted_item_id`,
    [version, professionId],
  );
  const byKey = new Map<string, Array<{ id: number; name: string }>>();
  for (const c of catalog) {
    const reagents = typeof c.reagents === 'string' ? JSON.parse(c.reagents) : c.reagents;
    const k = reagentKey(c.crafted_item_id, (reagents as any[]).map((g) => ({ itemId: Number(g.itemId), quantity: Number(g.quantity) })));
    byKey.set(k, [...(byKey.get(k) ?? []), { id: Number(c.id), name: c.name }]);
  }
  return byKey;
}

/**
 * Recetas conocidas según Blizzard (ids de receta del catálogo) → ids de hechizo de Wowhead. Solo se enlazan las que
 * coinciden de forma única (objeto creado + materiales exactos); el resto se cuenta como «sin enlazar».
 */
export async function knownSpellIds(db: Db, version: string, professionId: number, blizzardRecipeIds: number[]) {
  const prof = DATA.professions.find((p) => p.professionId === professionId);
  const known = new Set<number>();
  if (!prof || !blizzardRecipeIds.length) return { known, unmatched: blizzardRecipeIds.length };
  const wanted = new Set(blizzardRecipeIds);
  const byKey = await catalogByKey(db, version, professionId);
  const spellByKey = new Map<string, number[]>();
  for (const r of prof.recipes) {
    const k = reagentKey(r.creates?.itemId ?? null, r.reagents);
    spellByKey.set(k, [...(spellByKey.get(k) ?? []), r.id]);
  }
  let matched = 0;
  for (const [k, cats] of byKey) {
    const hits = cats.filter((c) => wanted.has(c.id));
    if (!hits.length) continue;
    const spells = spellByKey.get(k);
    if (cats.length === 1 && spells && spells.length === 1) { known.add(spells[0]); matched++; }
  }
  return { known, unmatched: blizzardRecipeIds.length - matched };
}

/** Pasos con nombres en español (objetos del catálogo; recetas solo si la coincidencia es única), materiales y procedencia. */
async function describePlan(db: Db, ctx: MarketContext, prof: WhProfession, plan: LevelPlan, pricing: Pricing) {
  const whById = new Map(prof.recipes.map((r) => [r.id, r]));
  const usedItems = new Set<number>();
  for (const s of plan.steps) {
    for (const m of s.materials) usedItems.add(m.itemId);
    for (const id of s.missingItems) usedItems.add(id);
    const c = s.recipe ? whById.get(s.recipe.id)?.creates?.itemId : null;
    if (c) usedItems.add(c);
  }
  const items = await db.query<any>(`select id, name, quality from item where game_version=$1 and id = any($2::int[])`, [ctx.version, [...usedItems]]);
  const itemById = new Map(items.map((i) => [Number(i.id), { name: i.name as string | null, quality: i.quality as string | null }]));
  const byKey = await catalogByKey(db, ctx.version, prof.professionId);
  const itemName = (id: number) => itemById.get(id)?.name ?? pricing.snap.local.get(id)?.name ?? null;
  const { priceSource } = pricing;
  return {
    steps: plan.steps.map((s) => {
      const wh = s.recipe ? whById.get(s.recipe.id)! : null;
      const match = wh ? byKey.get(reagentKey(wh.creates?.itemId ?? null, wh.reagents)) : undefined;
      const cat = match && match.length === 1 ? match[0] : null;
      return {
        from: s.from, to: s.to, colorFrom: s.colorFrom, colorTo: s.colorTo, expectedCrafts: s.expectedCrafts, crafts: s.crafts, cost: s.cost, reason: s.reason,
        guaranteedCrafts: s.guaranteedCrafts, certain: s.certain, minChance: s.minChance, activeSeconds: s.activeSeconds, known: s.known,
        recipe: wh && s.recipe ? {
          spellId: wh.id, nameEn: wh.name, name: cat?.name ?? null, catalogRecipeId: cat?.id ?? null,
          wowheadUrl: `https://www.wowhead.com/forever/spell=${wh.id}`, learnedAt: wh.learnedAt, colors: wh.colors,
          availability: s.recipe.availability, trainingCost: s.recipe.trainingCost, skillUps: s.recipe.skillUps,
          castSeconds: s.recipe.castSeconds ?? null, tools: SPELL_TOOLS.get(wh.id) ?? [],
          createsItemId: wh.creates?.itemId ?? null, createsName: wh.creates ? itemName(wh.creates.itemId) : null,
          createsQuality: wh.creates ? itemById.get(wh.creates.itemId)?.quality ?? null : null,
        } : null,
        materials: s.materials.map((m) => ({ ...m, name: itemName(m.itemId), quality: itemById.get(m.itemId)?.quality ?? null, priceSource: priceSource(m.itemId) })),
        missingItems: s.missingItems.map((id) => ({ itemId: id, name: itemName(id), quality: itemById.get(id)?.quality ?? null })),
      };
    }),
    shopping: plan.shopping.map((m) => ({ ...m, name: itemName(m.itemId), quality: itemById.get(m.itemId)?.quality ?? null, priceSource: priceSource(m.itemId) })),
  };
}

async function professionName(db: Db, version: string, prof: WhProfession) {
  return (await levelingProfessions(db, version)).professions.find((p) => p.id === prof.professionId)?.name ?? prof.slug;
}

export async function levelingPlan(
  db: Db, ctx: MarketContext, settings: Settings,
  opts: { professionId: number; from: number; to: number; trainerOnly: boolean; manual?: Map<number, Q> },
) {
  const prof = professionOf(ctx, opts.professionId);
  const maxSkill = checkRange(prof, opts.from, opts.to);
  const pricing = await pricingFor(db, ctx, settings, prof, opts.manual ?? new Map<number, Q>());
  const plan = planLeveling(prof.recipes.map(toLevel), { from: opts.from, to: opts.to, price: pricing.price, trainerOnly: opts.trainerOnly });
  const described = await describePlan(db, ctx, prof, plan, pricing);
  return {
    profession: { id: prof.professionId, name: await professionName(db, ctx.version, prof) },
    source: { url: prof.sourceUrl, fetchedAt: prof.fetchedAt, name: DATA.source },
    priceField: settings.buySource,
    priceSourceTime: pricing.snap.runs.realm_items?.sourceTime ?? null,
    from: plan.from, to: plan.to, maxSkill, trainerOnly: opts.trainerOnly,
    incomplete: plan.incomplete,
    materialsCost: plan.materialsCost, trainingCost: plan.trainingCost, total: plan.total, activeSeconds: plan.activeSeconds,
    ...described,
    manualItems: [...pricing.manual.keys()],
  };
}

export interface RouteRequest {
  professionId: number;
  from: number;
  to: number;
  mode: RouteMode;
  budget: Q | null;
  trainerOnly: boolean;
  chanceModel: 'comunidad' | 'garantizado';
  manual?: Map<number, Q>;
  /** Recetas que el personaje ya conoce (ids de hechizo de Wowhead). */
  known?: Set<number>;
  /** Máximo actual de la profesión del personaje (null = desconocido) y nivel del personaje. */
  currentMax?: number | null;
  characterLevel?: number | null;
}

/**
 * Recuperación HIPOTÉTICA si se vendiera lo fabricado (PC-12): unidades × precio de venta («Ajustes») × (1 − comisión).
 * No reduce el costo ni decide la ruta: vender no está garantizado (demanda, competencia). Un objeto ligado al recogerlo
 * no se puede vender en la casa de subastas; un precio ausente deja la cifra incompleta (nunca 0).
 */
async function saleRecovery(db: Db, ctx: MarketContext, settings: Settings, prof: WhProfession, plan: LevelPlan, pricing: Pricing) {
  const whById = new Map(prof.recipes.map((r) => [r.id, r]));
  const created = [...new Set(plan.steps.map((s) => (s.recipe ? whById.get(s.recipe.id)?.creates?.itemId : undefined)).filter((x): x is number => !!x))];
  const items = created.length ? await db.query<any>(`select id, binding from item where game_version=$1 and id = any($2::int[])`, [ctx.version, created]) : [];
  const binding = new Map(items.map((i) => [Number(i.id), i.binding as string | null]));
  const keep = Q.one.sub(Q.parse(commissionFor(settings, ctx.realm)));
  let min = Q.zero, max = Q.zero, withPrice = 0, noPrice = 0, bound = 0;
  for (const s of plan.steps) {
    const c = s.recipe ? whById.get(s.recipe.id)?.creates : undefined;
    if (!s.recipe || !c || s.crafts === null) continue;
    if (binding.get(c.itemId) === 'ON_ACQUIRE') { bound++; continue; }
    const price = resolvePrice(pricing.snap, c.itemId, settings.sellSource).copper;
    if (!price) { noPrice++; continue; }
    withPrice++;
    const net = price.mul(keep);
    min = min.add(net.mul(s.crafts * BigInt(Math.max(1, c.min))));
    max = max.add(net.mul(s.crafts * BigInt(Math.max(1, c.max, c.min))));
  }
  return {
    min: withPrice ? min : null, max: withPrice ? max : null, stepsWithPrice: withPrice, stepsWithoutPrice: noPrice, stepsBound: bound,
    priceField: settings.sellSource, commission: commissionFor(settings, ctx.realm),
  };
}

const summary = (r: RouteResult) => ({
  mode: r.mode, total: r.plan.total, materialsCost: r.plan.materialsCost, trainingCost: r.plan.trainingCost,
  activeSeconds: r.plan.activeSeconds, incomplete: r.plan.incomplete, certain: r.plan.certain, withinBudget: r.withinBudget,
  steps: r.plan.steps.length,
});

/**
 * Ruta recomendada (PC-08 a PC-12, PC-16): la del modo pedido con todos sus pasos, la comparación rápida/barata,
 * requisitos de aprendizaje y lo que no se ha podido estimar.
 */
export async function routePlan(db: Db, ctx: MarketContext, settings: Settings, req: RouteRequest) {
  const prof = professionOf(ctx, req.professionId);
  // Objetivo ya alcanzado: ruta vacía con estado «completado» (no es un error).
  if (Number.isInteger(req.from) && Number.isInteger(req.to) && req.to >= 2 && req.from >= req.to) {
    return { completed: true as const, profession: { id: prof.professionId, name: await professionName(db, ctx.version, prof) }, from: req.from, to: req.to, mode: req.mode, steps: [], shopping: [] };
  }
  const maxSkill = checkRange(prof, req.from, req.to);
  if (req.budget && req.budget.sign() < 0) throw new HttpError(400, 'El presupuesto no puede ser negativo.');
  const pricing = await pricingFor(db, ctx, settings, prof, req.manual ?? new Map<number, Q>());
  const recipes = prof.recipes.map(toLevel);
  const base = { from: req.from, to: req.to, price: pricing.price, trainerOnly: req.trainerOnly, chanceModel: req.chanceModel, known: req.known, budget: req.budget };
  const fast = planRoute(recipes, { ...base, mode: 'rapida' });
  const cheap = planRoute(recipes, { ...base, mode: 'barata' });
  const chosen = req.mode === 'rapida' ? fast : cheap;
  const described = await describePlan(db, ctx, prof, chosen.plan, pricing);
  const recovery = await saleRecovery(db, ctx, settings, prof, chosen.plan, pricing);
  const requirements = rankRequirements(req.from, req.to, req.currentMax ?? null, req.characterLevel ?? null);
  const blockers = [...chosen.blockers];
  for (const r of requirements) if (r.levelOk === false) blockers.push(`${r.rank}: hace falta nivel de personaje ${r.characterLevel} antes de pasar de ${r.before} (según las reglas de Classic).`);
  if (chosen.plan.incomplete) blockers.push('Hay tramos sin receta con precio: el total no cubre toda la subida (indica precios manuales o incluye recetas de patrón).');
  return {
    profession: { id: prof.professionId, name: await professionName(db, ctx.version, prof) },
    source: { url: prof.sourceUrl, fetchedAt: prof.fetchedAt, name: DATA.source, castTimes: SPELL_DETAILS_SOURCE },
    priceField: settings.buySource,
    priceSourceTime: pricing.snap.runs.realm_items?.sourceTime ?? null,
    from: req.from, to: req.to, maxSkill, mode: chosen.mode, algorithm: chosen.algorithm, evaluated: chosen.evaluated,
    trainerOnly: req.trainerOnly, chanceModel: req.chanceModel, knownRecipes: req.known?.size ?? 0,
    budget: chosen.budget, withinBudget: chosen.withinBudget,
    incomplete: chosen.plan.incomplete, certain: chosen.plan.certain,
    materialsCost: chosen.plan.materialsCost, trainingCost: chosen.plan.trainingCost, total: chosen.plan.total,
    activeSeconds: chosen.plan.activeSeconds,
    /** Desembolso = total. La recuperación por venta es hipotética y no se resta. */
    recovery,
    /** Lo que el tiempo activo no incluye: no hay datos verificados para estimarlo. */
    notIncluded: ['desplazamientos', 'compra de materiales', 'aprendizaje en el instructor', 'recolección propia'],
    requirements, blockers, notes: chosen.notes,
    comparison: { rapida: summary(fast), barata: summary(cheap) },
    ...described,
    manualItems: [...pricing.manual.keys()],
  };
}
