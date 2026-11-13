/**
 * Tiempos de reutilización de recetas (PB-22, D31).
 *
 * Fuente: data/leveling/forever-cooldowns.json, comprobado en el tooltip de Wowhead para las 2 215 recetas de
 * data/leveling/forever-wowhead.json (ids de hechizo). El catálogo de Blizzard usa otros ids (de receta), así que se
 * enlazan por objeto creado + materiales exactos, igual que los nombres de la subida de nivel. Si una receta del
 * catálogo no coincide con ninguna de Wowhead, su reutilización es desconocida (null), no 0.
 */
import dataset from '../../data/leveling/forever-wowhead.json' with { type: 'json' };
import cooldownData from '../../data/leveling/forever-cooldowns.json' with { type: 'json' };

type Reagents = Array<{ itemId: number; quantity: number }>;
interface WhRecipe { id: number; name: string; creates?: { itemId: number }; reagents: Reagents }

/** Reutilización comprobada en Wowhead, por id de hechizo (segundos). */
export const SPELL_COOLDOWNS = new Map<number, number>(
  Object.entries((cooldownData as { cooldowns: Record<string, number> }).cooldowns).map(([k, v]) => [Number(k), Number(v)]),
);

export const reagentKey = (crafted: number | null | undefined, reagents: Reagents) =>
  `${crafted ?? 0}|${reagents.map((g) => `${g.itemId}x${g.quantity}`).sort().join('+')}`;

/** Clave (objeto + materiales) → reutilización en segundos, para todas las recetas de Wowhead (0 = sin reutilización). */
const BY_KEY = (() => {
  const m = new Map<string, number>();
  for (const p of (dataset as unknown as { professions: Array<{ recipes: WhRecipe[] }> }).professions) {
    for (const r of p.recipes) {
      if (!r.reagents.length) continue;
      const k = reagentKey(r.creates?.itemId, r.reagents);
      // Si dos hechizos comparten clave, se queda la reutilización mayor (la más restrictiva).
      m.set(k, Math.max(m.get(k) ?? 0, SPELL_COOLDOWNS.get(r.id) ?? 0));
    }
  }
  return m;
})();

/**
 * Reutilización de una receta del catálogo en segundos: 0 si coincide con una receta de Wowhead sin reutilización,
 * null si no coincide con ninguna (desconocida).
 */
export function catalogCooldown(craftedItemId: number | null, reagents: Array<{ item_id: number; quantity: number | null }>): number | null {
  if (!reagents.length || reagents.some((g) => g.quantity === null)) return null;
  const v = BY_KEY.get(reagentKey(craftedItemId, reagents.map((g) => ({ itemId: g.item_id, quantity: g.quantity! }))));
  return v === undefined ? null : v;
}
