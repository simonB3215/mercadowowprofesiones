/**
 * Subida de nivel por profesión: recetas y umbrales de dificultad de Wowhead (data/leveling/forever-wowhead.json),
 * precios de la casa de subastas elegida (campo de compra de «Ajustes») y nombres del catálogo de Blizzard.
 */
import type { Db } from './db.js';
import { HttpError, loadSnapshot, type MarketContext } from './market.js';
import { resolvePrice } from './evaluate.js';
import type { Settings } from './config.js';
import { planLeveling, type LevelRecipe } from '../engine/leveling.js';
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
    cooldown: cooldownOf(r),
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

export async function levelingPlan(
  db: Db, ctx: MarketContext, settings: Settings,
  opts: { professionId: number; from: number; to: number; trainerOnly: boolean; manual?: Map<number, Q> },
) {
  if (ctx.version !== DATA.gameVersion) throw new HttpError(404, 'No hay datos de subida de nivel para esta versión del juego.');
  const prof = DATA.professions.find((p) => p.professionId === opts.professionId);
  if (!prof) throw new HttpError(404, 'No hay datos de subida de nivel para esta profesión (las de recolección se suben recolectando).');
  const maxSkill = Math.max(...prof.recipes.map((r) => r.colors[3]));
  if (!Number.isInteger(opts.from) || !Number.isInteger(opts.to) || opts.from < 1 || opts.to > maxSkill || opts.to <= opts.from) {
    throw new HttpError(400, `Rango inválido: el nivel inicial debe ser ≥ 1 y menor que el final, y el final ≤ ${maxSkill}.`);
  }

  const itemIds = [...new Set(prof.recipes.flatMap((r) => r.reagents.map((g) => g.itemId)))];
  const snap = await loadSnapshot(db, ctx, itemIds);
  // Precio manual del usuario (p. ej. lo que cobra un vendedor) solo si lo indica; si no, la casa de subastas.
  const manual = opts.manual ?? new Map<number, Q>();
  const price = (id: number) => manual.get(id) ?? resolvePrice(snap, id, settings.buySource).copper;
  const priceSource = (id: number) => (manual.has(id) ? 'manual' : resolvePrice(snap, id, settings.buySource).copper ? 'casa de subastas' : 'sin datos');
  const plan = planLeveling(prof.recipes.map(toLevel), { from: opts.from, to: opts.to, price, trainerOnly: opts.trainerOnly });

  // Nombres en español: objetos del catálogo; recetas solo si la coincidencia (objeto creado + materiales exactos) es única.
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
  const catalog = await db.query<any>(
    `select r.id, r.name, r.crafted_item_id, coalesce(json_agg(json_build_object('itemId', g.item_id, 'quantity', g.quantity)) filter (where g.item_id is not null), '[]') as reagents
     from recipe r left join recipe_reagent g on g.game_version=r.game_version and g.recipe_id=r.id and not g.optional
     where r.game_version=$1 and r.profession_id=$2 and r.fetch_error is null group by r.id, r.name, r.crafted_item_id`,
    [ctx.version, prof.professionId],
  );
  const byKey = new Map<string, Array<{ id: number; name: string }>>();
  for (const c of catalog) {
    const k = reagentKey(c.crafted_item_id, (c.reagents as any[]).map((g) => ({ itemId: Number(g.itemId), quantity: Number(g.quantity) })));
    byKey.set(k, [...(byKey.get(k) ?? []), { id: Number(c.id), name: c.name }]);
  }
  const itemName = (id: number) => itemById.get(id)?.name ?? snap.local.get(id)?.name ?? null;
  const priceTime = snap.runs.realm_items?.sourceTime ?? null;

  return {
    profession: { id: prof.professionId, name: (await levelingProfessions(db, ctx.version)).professions.find((p) => p.id === prof.professionId)?.name ?? prof.slug },
    source: { url: prof.sourceUrl, fetchedAt: prof.fetchedAt, name: DATA.source },
    priceField: settings.buySource,
    priceSourceTime: priceTime,
    from: plan.from, to: plan.to, maxSkill, trainerOnly: opts.trainerOnly,
    incomplete: plan.incomplete,
    materialsCost: plan.materialsCost, trainingCost: plan.trainingCost, total: plan.total,
    steps: plan.steps.map((s) => {
      const wh = s.recipe ? whById.get(s.recipe.id)! : null;
      const match = wh ? byKey.get(reagentKey(wh.creates?.itemId ?? null, wh.reagents)) : undefined;
      const cat = match && match.length === 1 ? match[0] : null;
      return {
        from: s.from, to: s.to, colorFrom: s.colorFrom, colorTo: s.colorTo, expectedCrafts: s.expectedCrafts, crafts: s.crafts, cost: s.cost, reason: s.reason,
        recipe: wh && s.recipe ? {
          spellId: wh.id, nameEn: wh.name, name: cat?.name ?? null, catalogRecipeId: cat?.id ?? null,
          wowheadUrl: `https://www.wowhead.com/forever/spell=${wh.id}`, learnedAt: wh.learnedAt, colors: wh.colors,
          availability: s.recipe.availability, trainingCost: s.recipe.trainingCost,
          createsItemId: wh.creates?.itemId ?? null, createsName: wh.creates ? itemName(wh.creates.itemId) : null,
          createsQuality: wh.creates ? itemById.get(wh.creates.itemId)?.quality ?? null : null,
        } : null,
        materials: s.materials.map((m) => ({ ...m, name: itemName(m.itemId), quality: itemById.get(m.itemId)?.quality ?? null, priceSource: priceSource(m.itemId) })),
        missingItems: s.missingItems.map((id) => ({ itemId: id, name: itemName(id), quality: itemById.get(id)?.quality ?? null })),
      };
    }),
    shopping: plan.shopping.map((m) => ({ ...m, name: itemName(m.itemId), quality: itemById.get(m.itemId)?.quality ?? null, priceSource: priceSource(m.itemId) })),
    manualItems: [...manual.keys()],
  };
}
