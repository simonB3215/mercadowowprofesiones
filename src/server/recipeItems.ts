/**
 * Objeto de receta (patrón, diseño, fórmula…) que enseña cada receta que no enseña el instructor, y de dónde sale.
 * Fuente: data/leveling/forever-recipe-items.json, generado con `npm run sync:recipe-items` desde el buscador de
 * Wowhead Forever. Una receta que no aparece no tiene objeto inequívoco: se enlaza a la receta en Wowhead.
 */
import data from '../../data/leveling/forever-recipe-items.json' with { type: 'json' };
import sourcesData from '../../data/leveling/forever-recipe-sources.json' with { type: 'json' };
import { ZONES_ES } from './zones.js';

interface Raw { itemId: number; name: string; sources: number[]; buyPrice: number | null; reqSkillRank: number | null; quality: number | null }
const D = data as unknown as { source: string; checkedAt: string | null; items: Record<string, Raw> };

/** Dónde se consigue cada objeto de receta (npm run sync:recipe-sources): n nombre, t tipo, ti id, z zona. */
const S = sourcesData as unknown as { items: Record<string, Array<{ n: string; t: number; ti: number; z: number | null }>> };
const KIND: Record<number, { kind: 'pnj' | 'objeto' | 'misión'; path: string }> = { 1: { kind: 'pnj', path: 'npc' }, 2: { kind: 'objeto', path: 'object' }, 5: { kind: 'misión', path: 'quest' } };
/** Máximo de sitios que se devuelven por receta (el resto se cuenta en whereMore). */
export const MAX_WHERE = 5;

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
  /** Quién la vende, la suelta o la da y en qué zona (vacío si no se ha leído de Wowhead). */
  where: Array<{ name: string; kind: string; url: string; zone: string | null }>;
  /** Sitios que no caben en `where`. */
  whereMore: number;
}

export function recipeWhere(itemId: number): { where: RecipeItemOut['where']; whereMore: number } {
  const list = (S.items[String(itemId)] ?? []).filter((s) => KIND[s.t]);
  const where = list.slice(0, MAX_WHERE).map((s) => ({
    name: s.n, kind: KIND[s.t].kind, url: `https://www.wowhead.com/forever/${KIND[s.t].path}=${s.ti}`,
    zone: s.z == null ? null : ZONES_ES[s.z] ?? null,
  }));
  return { where, whereMore: list.length - where.length };
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
    ...recipeWhere(r.itemId),
  };
}
