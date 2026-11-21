// Nombre en español e inglés de cada objeto de receta (patrón, diseño, fórmula…) y de las misiones que la dan.
// Fuente: Game Data API de Blizzard (namespace static-forever-us), que devuelve el nombre en todos los idiomas.
// Los PNJ (vendedores, enemigos) no están en esa API para Forever: se quedan con el nombre de Wowhead (inglés).
// Escribe data/leveling/forever-recipe-names.json.  Uso: npm run sync:recipe-names  (necesita BLIZZARD_CLIENT_ID/SECRET)
import { readFileSync, writeFileSync } from 'node:fs';
import { createBlizzardClient } from '../src/server/providers/blizzard.js';

const OUT = 'data/leveling/forever-recipe-names.json';
const NS = 'static-forever-us';

/** {es, en} de un nombre localizado de Blizzard, o null si no trae ninguno. */
export function namePair(v: any): { es: string; en: string } | null {
  if (!v || typeof v !== 'object') return null;
  const en = v.en_US ?? v.en_GB;
  const es = v.es_MX ?? v.es_ES ?? en;
  return typeof es === 'string' && typeof en === 'string' ? { es, en } : null;
}

if (process.argv[1]?.includes('sync-recipe-names')) {
  process.loadEnvFile?.('.env');
  const c = createBlizzardClient('us');
  const items = JSON.parse(readFileSync('data/leveling/forever-recipe-items.json', 'utf8')).items as Record<string, { itemId: number }>;
  const sources = JSON.parse(readFileSync('data/leveling/forever-recipe-sources.json', 'utf8')).items as Record<string, Array<{ t: number; ti: number }>>;
  const itemIds = [...new Set(Object.values(items).map((i) => i.itemId))].sort((a, b) => a - b);
  const questIds = [...new Set(Object.values(sources).flat().filter((s) => s.t === 5).map((s) => s.ti))].sort((a, b) => a - b);
  const read = async (kind: 'item' | 'quest', ids: number[]) => {
    const out: Record<string, { es: string; en: string }> = {};
    let fails = 0;
    for (const [i, id] of ids.entries()) {
      try {
        const j = await c.get(`/data/wow/${kind}/${id}`, NS);
        const p = namePair(kind === 'quest' ? (j.title ?? j.name) : j.name);
        if (p) out[id] = p;
      } catch { fails++; }
      if (i % 200 === 0) console.log(`${kind} ${i}/${ids.length}`);
      await new Promise((ok) => setTimeout(ok, 60));
    }
    console.log(`${kind}: ${Object.keys(out).length}/${ids.length} con nombre (${fails} sin respuesta)`);
    return out;
  };
  const itemNames = await read('item', itemIds);
  const questNames = await read('quest', questIds);
  writeFileSync(OUT, JSON.stringify({
    description: 'Nombre en español (es_MX) e inglés de cada objeto de receta y de las misiones que dan recetas. Fuente: Blizzard Game Data API (static-forever-us).',
    checkedAt: new Date().toISOString().slice(0, 10), items: itemNames, quests: questNames,
  }) + '\n');
}
