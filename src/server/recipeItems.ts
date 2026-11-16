/**
 * Objeto de receta (patrón, diseño, fórmula…) que enseña cada receta que no enseña el instructor, y de dónde sale.
 * Fuente: data/leveling/forever-recipe-items.json, generado con `npm run sync:recipe-items` desde el buscador de
 * Wowhead Forever. Una receta que no aparece no tiene objeto inequívoco: se enlaza a la receta en Wowhead.
 */
import data from '../../data/leveling/forever-recipe-items.json' with { type: 'json' };

interface Raw { itemId: number; name: string; sources: number[]; buyPrice: number | null; reqSkillRank: number | null; quality: number | null }
const D = data as unknown as { source: string; checkedAt: string | null; items: Record<string, Raw> };

export const RECIPE_ITEMS_SOURCE = { url: D.source, checkedAt: D.checkedAt, get items() { return Object.keys(D.items).length; } };

/** Códigos de fuente de Wowhead → cómo se consigue el objeto y la pestaña de Wowhead que dice dónde. */
const HOW: Record<number, { how: 'vendedor' | 'botín' | 'misión' | 'fabricado' | 'otra'; tab: string }> = {
  5: { how: 'vendedor', tab: 'sold-by' }, 2: { how: 'botín', tab: 'dropped-by' }, 4: { how: 'misión', tab: 'reward-from-q' },
  1: { how: 'fabricado', tab: 'created-by' },
};

export interface RecipeItemOut {
  itemId: number; nameEn: string; quality: number | null;
  /** Formas de conseguirla, la de vendedor primero. */
  obtain: Array<{ how: string; url: string }>;
  /** Precio al vendedor en cobre (texto), sin descuentos por reputación; null si no se vende. */
  buyPrice: string | null;
  wowheadUrl: string;
}

export function recipeItemFor(spellId: number): RecipeItemOut | null {
  const r = D.items[String(spellId)];
  if (!r) return null;
  const page = `https://www.wowhead.com/forever/item=${r.itemId}`;
  const seen = new Set<string>();
  const obtain = [...r.sources].sort((a, b) => (a === 5 ? -1 : b === 5 ? 1 : 0)).flatMap((c) => {
    const h = HOW[c] ?? { how: 'otra' as const, tab: '' };
    if (seen.has(h.how)) return [];
    seen.add(h.how);
    return [{ how: h.how, url: h.tab ? `${page}#${h.tab}` : page }];
  });
  return {
    itemId: r.itemId, nameEn: r.name, quality: r.quality, obtain,
    buyPrice: r.sources.includes(5) && r.buyPrice ? String(r.buyPrice) : null, wowheadUrl: page,
  };
}
