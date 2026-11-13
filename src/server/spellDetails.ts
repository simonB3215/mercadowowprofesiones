/**
 * Tiempo de lanzamiento y herramientas de cada receta (PC-10), por id de hechizo de Wowhead.
 * Fuente: data/leveling/forever-spell-details.json, generado con `npm run sync:spells` desde los tooltips públicos de
 * Wowhead Forever. Una receta que no aparece tiene tiempo desconocido (null), nunca 0.
 */
import details from '../../data/leveling/forever-spell-details.json' with { type: 'json' };

const D = details as unknown as { checkedAt: string; source: string; castSeconds: Record<string, number[]>; tools: Record<string, number[]> };

export const SPELL_CAST = new Map<number, number>();
for (const [secs, ids] of Object.entries(D.castSeconds)) for (const id of ids) SPELL_CAST.set(id, Number(secs));

export const SPELL_TOOLS = new Map<number, string[]>();
for (const [tool, ids] of Object.entries(D.tools)) for (const id of ids) SPELL_TOOLS.set(id, [...(SPELL_TOOLS.get(id) ?? []), tool]);

export const SPELL_DETAILS_SOURCE = { url: D.source, checkedAt: D.checkedAt };

export const castSecondsOf = (spellId: number): number | null => SPELL_CAST.get(spellId) ?? null;
