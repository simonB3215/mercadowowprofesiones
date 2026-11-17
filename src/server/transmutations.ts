/**
 * «Transmutaciones» (PT-01 a PT-04): recetas con reutilización de todas las profesiones, evaluadas con los precios de la
 * casa elegida, con la ganancia por fabricación y el oro al día que permite su espera.
 * Las recetas de Wowhead (con la espera comprobada) se enlazan con el catálogo de Blizzard por objeto + materiales.
 */
import type { Db } from './db.js';
import type { MarketContext } from './market.js';
import { buildEvalContext, evaluateRecipe, loadRecipes, type Profile } from './evaluate.js';
import { cooldownRecipes } from './leveling.js';
import { reagentKey } from './cooldowns.js';
import { goldPerDay, craftsPerDay, MAX_CRAFTS_PER_DAY } from '../engine/cooldown.js';

const TOOL_ES: Record<string, string> = { "Philosopher's Stone": 'Piedra filosofal' };

/** PT-02: Wowhead no indica la categoría de reutilización; no se sabe si las transmutaciones comparten espera en Forever. */
export const SHARED_COOLDOWN_NOTE =
  'No está confirmado si en WoW Forever las transmutaciones comparten la espera (Wowhead no lo indica). Si la comparten, solo puedes hacer una dentro de cada grupo de espera: no sumes el oro al día de varias.';

export async function transmutations(db: Db, ctx: MarketContext, profile: Profile | null) {
  const wh = cooldownRecipes(ctx.version);
  if (!wh.length) return { items: [], unmatched: [], note: SHARED_COOLDOWN_NOTE, maxCraftsPerDay: MAX_CRAFTS_PER_DAY, market: null };
  // Recetas del catálogo que crean esos objetos, con sus materiales obligatorios, para enlazarlas por objeto + materiales.
  const created = [...new Set(wh.map((w) => w.createsItemId))];
  const cand = await db.query<any>(
    `select r.id, r.crafted_item_id, coalesce(json_agg(json_build_object('itemId', g.item_id, 'quantity', g.quantity)) filter (where g.item_id is not null), '[]') as reagents
     from recipe r left join recipe_reagent g on g.game_version=r.game_version and g.recipe_id=r.id and not g.optional
     where r.game_version=$1 and r.crafted_item_id = any($2::int[]) group by r.id, r.crafted_item_id`, [ctx.version, created]);
  const byKey = new Map<string, number>();
  for (const c of cand) {
    const rg = (typeof c.reagents === 'string' ? JSON.parse(c.reagents) : c.reagents) as any[];
    if (rg.some((g) => g.quantity === null)) continue;
    byKey.set(reagentKey(Number(c.crafted_item_id), rg.map((g) => ({ itemId: Number(g.itemId), quantity: Number(g.quantity) }))), Number(c.id));
  }
  const matched = wh.map((w) => ({ w, recipeId: byKey.get(w.key) ?? null }));
  const ids = matched.filter((m) => m.recipeId !== null).map((m) => m.recipeId!);
  const recipes = await loadRecipes(db, ctx.version, { recipeIds: ids });
  const ectx = await buildEvalContext(db, ctx, recipes, profile);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const items = matched.filter((m) => m.recipeId !== null && byId.has(m.recipeId)).map(({ w, recipeId }) => {
    const ev = evaluateRecipe(byId.get(recipeId!)!, ectx);
    const profit = ev.profit.profitBatch; // una fabricación (runs = 1)
    return {
      recipeId: ev.recipeId, spellId: w.spellId, name: ev.name, profession: ev.profession, professionId: ev.professionId,
      output: ev.output, unitsPerRun: ev.unitsPerRun, cooldown: w.cooldown, craftsPerDay: craftsPerDay(w.cooldown),
      cost: ev.cost.batch, sellPrice: ev.sellPrice.copper, sellScope: ev.sellPrice.scope, sellSupply: ev.sellPrice.supply ?? null,
      profitPerCraft: profit, goldPerDay: goldPerDay(profit, w.cooldown), roiPct: ev.profit.roiPct,
      demand: ev.demand, status: ev.status, reasons: ev.reasons, sellCheck: ev.sellCheck ? { kind: ev.sellCheck.kind } : null,
      character: ev.character, tools: w.tools.map((t) => TOOL_ES[t] ?? t),
      learn: { availability: w.learn.availability, learnedAt: w.learn.learnedAt, trainingCost: w.learn.trainingCost, recipeItem: w.learn.recipeItem },
    };
  });
  // Más oro al día primero; las que no se pueden calcular, al final.
  items.sort((a, b) => (!a.goldPerDay && !b.goldPerDay ? a.name.localeCompare(b.name) : !a.goldPerDay ? 1 : !b.goldPerDay ? -1 : b.goldPerDay.cmp(a.goldPerDay)));
  return {
    items,
    /** Recetas con espera de Wowhead que no coinciden con ninguna del catálogo (no se pueden evaluar). */
    unmatched: matched.filter((m) => m.recipeId === null).map((m) => ({ spellId: m.w.spellId, name: m.w.nameEn, professionId: m.w.professionId, cooldown: m.w.cooldown })),
    note: SHARED_COOLDOWN_NOTE, maxCraftsPerDay: MAX_CRAFTS_PER_DAY, market: ectx.snap.runs,
  };
}
