/**
 * «Transmutaciones» (PT-01 a PT-07): recetas con reutilización de todas las profesiones, evaluadas con los precios de la
 * casa elegida, con la ganancia por fabricación, el oro al día que permite su espera, la mejor de cada grupo de espera
 * compartida, si conviene comprar el resultado o transmutarlo y un aviso cuando se vende poco.
 * Las recetas de Wowhead (con la espera comprobada) se enlazan con el catálogo de Blizzard por objeto + materiales.
 */
import type { Db } from './db.js';
import type { MarketContext } from './market.js';
import { buildEvalContext, evaluateRecipe, loadRecipes, resolvePrice, type Profile } from './evaluate.js';
import { buyOrCraft } from '../engine/buyOrCraft.js';
import { Q } from '../engine/rational.js';
import { commissionFor } from './config.js';
import { cooldownRecipes } from './leveling.js';
import { reagentKey } from './cooldowns.js';
import { goldPerDay, craftsPerDay, MAX_CRAFTS_PER_DAY } from '../engine/cooldown.js';

const TOOL_ES: Record<string, string> = { "Philosopher's Stone": 'Piedra filosofal' };

/**
 * PT-02: grupos de espera compartida. Wowhead no publica la categoría de reutilización; que todas las transmutaciones de
 * Alquimia comparten la espera en WoW Forever lo indicó un jugador (17-11-2026). El resto de recetas van por su cuenta.
 */
export const TRANSMUTE_GROUP = 'transmutaciones';
export const groupOf = (nameEn: string): string | null => (/^Transmute:/i.test(nameEn) ? TRANSMUTE_GROUP : null);
export const SHARED_COOLDOWN_NOTE =
  'En WoW Forever todas las transmutaciones comparten la espera: al hacer una, no puedes hacer ninguna otra hasta que pase la espera de la que hiciste. Conviene hacer la que más oro da al día. (Lo indicó un jugador; Wowhead no publica este dato.)';

/**
 * La mejor de cada grupo (PT-05): la de más oro al día con ganancia y demanda suficiente («candidato»); si ninguna lo es,
 * la de más oro al día con ganancia. Las recetas sin grupo son cada una su propio grupo.
 */
export function bestPerGroup<T extends { recipeId: number; group: string | null; status: string; goldPerDay: Q | null }>(items: T[]): Map<string, T> {
  const best = new Map<string, T>();
  const score = (i: T) => (i.status === 'candidato' ? 1 : 0);
  for (const i of items) {
    if (!i.goldPerDay || i.goldPerDay.sign() <= 0) continue;
    const k = i.group ?? `receta:${i.recipeId}`;
    const b = best.get(k);
    if (!b || score(i) > score(b) || (score(i) === score(b) && i.goldPerDay.cmp(b.goldPerDay!) > 0)) best.set(k, i);
  }
  return best;
}

/**
 * Objetos que se usan con espera y no son recetas de profesión. El Salero lo fabrica Ingeniería (receta 19567) y lo usa
 * un peletero (Peletería 250): Sal de roca profunda → Sal de roca profunda refinada, una vez cada 2 días y 23 h.
 * Comprobado en el tooltip de Wowhead (17-11-2026). Wowhead no dice cuántas sales refinadas da cada uso: se da el
 * margen por unidad y no se calcula el oro al día (no se suma al plan).
 */
export const ITEM_USES = [{
  key: 'salero', nameEn: 'Salt Shaker', itemId: 15846, spellId: 19566, cooldown: 255600, requires: { profession: 'Peletería', skill: 250 },
  madeBy: { profession: 'Ingeniería', spellId: 19567 }, inputItemId: 8150, outputItemId: 15409,
  source: 'https://nether.wowhead.com/tooltip/spell/19566?dataEnv=16&locale=0', checkedAt: '2026-11-17',
}] as const;

async function itemUses(db: Db, ctx: MarketContext, ectx: Awaited<ReturnType<typeof buildEvalContext>>) {
  if (ctx.version !== 'forever') return [];
  const ids = ITEM_USES.flatMap((u) => [u.itemId, u.inputItemId, u.outputItemId]);
  const rows = await db.query<any>(`select id, name, quality from item where game_version=$1 and id = any($2::int[])`, [ctx.version, ids]);
  const item = (id: number) => { const r = rows.find((x) => Number(x.id) === id); return { itemId: id, name: (r?.name as string | null) ?? null, quality: (r?.quality as string | null) ?? null }; };
  const keep = Q.one.sub(Q.parse(commissionFor(ectx.settings, ctx.realm)));
  return ITEM_USES.map((u) => {
    const buy = resolvePrice(ectx.snap, u.inputItemId, ectx.settings.buySource).copper;
    const sell = resolvePrice(ectx.snap, u.outputItemId, ectx.settings.sellSource);
    const net = sell.copper ? sell.copper.mul(keep) : null;
    const sold = ectx.snap.region.get(u.outputItemId)?.soldPerDay ?? null;
    return {
      key: u.key, nameEn: u.nameEn, spellId: u.spellId, cooldown: u.cooldown, requires: u.requires, madeBy: u.madeBy,
      device: { ...item(u.itemId), buyPrice: resolvePrice(ectx.snap, u.itemId, ectx.settings.buySource).copper },
      input: { ...item(u.inputItemId), buyPrice: buy },
      output: { ...item(u.outputItemId), sellPrice: sell.copper, sellNet: net },
      /** Precio neto de venta (sin comisión) de una refinada menos el de una sin refinar; null si falta un precio. */
      marginPerUnit: net && buy ? net.sub(buy) : null,
      /** Mínimo si cada uso da una sola refinada (cada uso da al menos una); el real puede ser mayor. */
      minGoldPerDay: net && buy ? goldPerDay(net.sub(buy), u.cooldown) : null,
      soldPerDay: sold,
      yieldKnown: false,
      wowheadUrl: `https://www.wowhead.com/forever/spell=${u.spellId}`, checkedAt: u.checkedAt,
    };
  });
}

export async function transmutations(db: Db, ctx: MarketContext, profile: Profile | null) {
  const wh = cooldownRecipes(ctx.version);
  if (!wh.length) return { items: [], groups: {}, plan: [], planTotal: null, buyOrMake: [], itemUses: [], unmatched: [], note: SHARED_COOLDOWN_NOTE, maxCraftsPerDay: MAX_CRAFTS_PER_DAY, market: null };
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
    const sold = ev.demand?.soldPerDay ?? null;
    return {
      group: groupOf(w.nameEn),
      /** PT-07: se vende menos de una al día en la región: cada cuántos días se vende una (orientativo). */
      daysPerSale: sold !== null && sold > 0 && sold < 1 ? Math.round((1 / sold) * 10) / 10 : null,
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
  const best = bestPerGroup(items);
  const bestIds = new Set([...best.values()].map((b) => b.recipeId));
  // Las mejores de cada grupo se pueden hacer a la vez: su oro al día sí se suma.
  const plan = [...best.values()].sort((a, b) => b.goldPerDay!.cmp(a.goldPerDay!));
  const planTotal = plan.reduce((t, i) => t.add(i.goldPerDay!), Q.zero);

  // PT-06: si necesitas el resultado para ti, ¿comprarlo o transmutarlo? (la receta más barata que lo crea, por unidad).
  const outputs = new Map<number, typeof items>();
  for (const i of items) if (i.output?.itemId) outputs.set(i.output.itemId, [...(outputs.get(i.output.itemId) ?? []), i]);
  const buyOrMake = [...outputs.entries()].map(([itemId, rs]) => {
    const unit = (i: (typeof items)[number]) => (i.cost && i.unitsPerRun ? i.cost.div(i.unitsPerRun) : null);
    const cheapest = rs.filter((r) => unit(r)).sort((a, b) => unit(a)!.cmp(unit(b)!))[0] ?? null;
    const buy = resolvePrice(ectx.snap, itemId, ectx.settings.buySource);
    const r = buyOrCraft({ quantity: 1, buyUnit: buy.copper, buyAvailable: buy.supply?.quantity ?? null, canBuy: true, craftUnit: cheapest ? unit(cheapest) : null, learnCost: null, needsLearning: false });
    return { itemId, name: rs[0].output?.name ?? null, quality: rs[0].output?.quality ?? null, buyUnit: buy.copper, makeUnit: cheapest ? unit(cheapest) : null,
      via: cheapest ? { recipeId: cheapest.recipeId, name: cheapest.name, cooldown: cheapest.cooldown, group: cheapest.group } : null, verdict: r.verdict, savings: r.savings };
  }).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  return {
    items: items.map((i) => ({ ...i, bestInGroup: bestIds.has(i.recipeId) })),
    groups: { [TRANSMUTE_GROUP]: { label: 'Transmutaciones de Alquimia', confirmedBy: 'jugador', checkedAt: '2026-11-17' } },
    /** Qué hacer: la mejor de cada grupo y el oro al día que suman. */
    plan: plan.map((i) => ({ recipeId: i.recipeId, name: i.name, group: i.group, cooldown: i.cooldown, goldPerDay: i.goldPerDay, profitPerCraft: i.profitPerCraft, output: i.output })),
    planTotal: plan.length ? planTotal : null,
    buyOrMake,
    /** Objetos que se usan con espera (Salero): margen por unidad, sin oro al día (no se sabe cuánto da cada uso). */
    itemUses: await itemUses(db, ctx, ectx),
    /** Recetas con espera de Wowhead que no coinciden con ninguna del catálogo (no se pueden evaluar). */
    unmatched: matched.filter((m) => m.recipeId === null).map((m) => ({ spellId: m.w.spellId, name: m.w.nameEn, professionId: m.w.professionId, cooldown: m.w.cooldown })),
    note: SHARED_COOLDOWN_NOTE, maxCraftsPerDay: MAX_CRAFTS_PER_DAY, market: ectx.snap.runs,
  };
}
