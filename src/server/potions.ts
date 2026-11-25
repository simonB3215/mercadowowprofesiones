/**
 * «Pociones»: pociones, elíxires y frascos de Alquimia ordenados por cuántos se venden al día en la región (TSM), con la
 * ganancia de fabricarlos para vender en la casa elegida y un veredicto sencillo: ¿sigue saliendo a cuenta?
 * Qué es poción, elíxir o frasco lo dice la clase del objeto de Blizzard (consumible, subclases 1, 2 y 3).
 */
import type { Db } from './db.js';
import type { MarketContext } from './market.js';
import { buildEvalContext, evaluateRecipe, loadRecipes, type Evaluation, type Profile } from './evaluate.js';

export const ALCHEMY_ID = 171;
/** Subclase de consumible de Blizzard para cada tipo. */
export const POTION_KINDS = { pociones: 1, elixires: 2, frascos: 3 } as const;
export type PotionKind = keyof typeof POTION_KINDS;
const KIND_BY_SUB: Record<number, PotionKind> = { 1: 'pociones', 2: 'elixires', 3: 'frascos' };

/**
 * ¿Conviene fabricarla para vender?
 * - si: gana oro y se vende bien («Buena opción»).
 * - poco: gana algo, pero se vende poco o el margen no llega a tus objetivos.
 * - dudoso: el precio de venta parece una sola publicación cara: no te fíes de la ganancia.
 * - no: con los precios de hoy pierdes oro o no ganas nada.
 * - sin_datos: falta algún precio para calcularlo.
 */
export type PotionVerdict = 'si' | 'poco' | 'dudoso' | 'no' | 'sin_datos';
export function potionVerdict(e: Pick<Evaluation, 'status' | 'sellCheck'> & { profit: { profitUnit: { sign(): number } | null } }): PotionVerdict {
  const p = e.profit.profitUnit;
  if (!p) return 'sin_datos';
  if (p.sign() <= 0) return 'no';
  if (e.sellCheck) return 'dudoso';
  if (e.status === 'candidato') return 'si';
  return 'poco';
}

export async function potions(db: Db, ctx: MarketContext, profile: Profile | null, kind: PotionKind | 'todas' = 'todas') {
  const subs = kind === 'todas' ? Object.values(POTION_KINDS) : [POTION_KINDS[kind]];
  const rows = await db.query<{ id: number; sub: number }>(
    `select r.id, (i.raw->'item_subclass'->>'id')::int as sub
     from recipe r join item i on i.game_version=r.game_version and i.id=r.crafted_item_id
     where r.game_version=$1 and r.profession_id=$2 and r.fetch_error is null
       and i.raw->'item_class'->>'id' = '0' and (i.raw->'item_subclass'->>'id')::int = any($3::int[])`,
    [ctx.version, ALCHEMY_ID, subs],
  );
  const subOf = new Map(rows.map((r) => [Number(r.id), Number(r.sub)]));
  const recipes = subOf.size ? await loadRecipes(db, ctx.version, { recipeIds: [...subOf.keys()] }) : [];
  const ectx = await buildEvalContext(db, ctx, recipes, profile);
  const items = recipes.map((r) => {
    const e = evaluateRecipe(r, ectx);
    return {
      recipeId: e.recipeId, name: e.name, kind: KIND_BY_SUB[subOf.get(e.recipeId) ?? 1], output: e.output, unitsPerRun: e.unitsPerRun,
      costUnit: e.cost.unit, sellPrice: e.sellPrice.copper, sellScope: e.sellPrice.scope, sellSupply: e.sellPrice.supply ?? null,
      profitUnit: e.profit.profitUnit, roiPct: e.profit.roiPct, demand: e.demand, noSales: e.noSales, status: e.status, reasons: e.reasons,
      sellCheck: e.sellCheck ? { kind: e.sellCheck.kind } : null, character: e.character, cooldown: e.cooldown,
      verdict: potionVerdict(e),
    };
  });
  // Las más vendidas primero; sin datos de ventas, al final (nunca como cero).
  items.sort((a, b) => {
    const x = a.demand?.soldPerDay ?? null, y = b.demand?.soldPerDay ?? null;
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || a.name.localeCompare(b.name);
  });
  const counts: Record<PotionVerdict, number> = { si: 0, poco: 0, dudoso: 0, no: 0, sin_datos: 0 };
  for (const i of items) counts[i.verdict]++;
  return { kind, items, counts, market: { runs: ectx.snap.runs } };
}
