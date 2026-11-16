// Objeto de receta (patrón, diseño, fórmula…) que enseña cada receta que NO enseña el instructor, para
// data/leveling/forever-wowhead.json. Fuente: buscador público de Wowhead Forever (search?q=…&json), que devuelve el
// objeto con su fuente (5 = vendedor, 2 = botín, 4 = misión…) y su precio de compra en cobre.
// Escribe data/leveling/forever-recipe-items.json.  Uso: npm run sync:recipe-items
// (unas 1 750 peticiones, una cada 1,2 s; si Wowhead bloquea, se guarda lo leído y la siguiente ejecución sigue).
//
// Regla: solo se enlaza un objeto de clase «Receta» (classs 9) de la misma profesión (reqskill) cuyo nombre, sin el
// prefijo («Pattern: », «Recipe: »…) y sin contar espacios ni signos, es el de la receta. Si hay varios, el del mismo nivel; si no se puede
// decidir, no se enlaza (no se inventa).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface WhRecipe { id: number; name: string; learnedAt: number; colors: number[]; source: number[] }
const DATA = JSON.parse(readFileSync('data/leveling/forever-wowhead.json', 'utf8')) as {
  professions: Array<{ professionId: number; recipes: WhRecipe[] }>;
};
const TRAINER = 6;
const STARTER_MAX_LEARNED = 50;
const URL_TPL = 'https://www.wowhead.com/forever/search?q={q}&json';
const DELAY_MS = 1200;
const CACHE = join(tmpdir(), 'mercado-wow-recipe-items.json');

export interface RecipeItem { itemId: number; name: string; sources: number[]; buyPrice: number | null; reqSkillRank: number | null; quality: number | null }

/** Extrae el array «items: [...]» de la respuesta del buscador (JS con claves sin comillas; el array es JSON). */
export function parseSearchItems(text: string): any[] {
  const at = text.indexOf('items:');
  if (at < 0) return [];
  const start = text.indexOf('[', at);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') { depth--; if (depth === 0) return JSON.parse(text.slice(start, i + 1)); }
  }
  return [];
}

/** El objeto de receta que enseña `recipe`, o null si no hay uno inequívoco. */
export function pickRecipeItem(items: any[], recipe: { name: string; learnedAt: number }, professionId: number): RecipeItem | null {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = norm(recipe.name);
  const hits = items.filter((it) => it.classs === 9 && Number(it.reqskill) === professionId
    && norm(String(it.name ?? '').replace(/^[^:]*:\s*/, '')) === want);
  const same = hits.filter((it) => Number(it.reqskillrank) === recipe.learnedAt);
  const it = hits.length === 1 ? hits[0] : same.length === 1 ? same[0] : null;
  if (!it) return null;
  return {
    itemId: Number(it.id), name: String(it.name), sources: Array.isArray(it.source) ? it.source.map(Number) : [],
    buyPrice: typeof it.buyprice === 'number' && it.buyprice > 0 ? it.buyprice : null,
    reqSkillRank: it.reqskillrank == null ? null : Number(it.reqskillrank), quality: it.quality == null ? null : Number(it.quality),
  };
}

if (process.argv[1]?.includes('sync-recipe-items')) {
  const todo = DATA.professions.flatMap((p) => p.recipes
    .filter((r) => !r.source.includes(TRAINER) && !(r.source.length === 0 && r.colors[0] === 0 && r.learnedAt <= STARTER_MAX_LEARNED))
    .map((r) => ({ r, professionId: p.professionId })));
  const cache: Record<string, any[] | null> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  const items: Record<string, RecipeItem> = {};
  const missing: number[] = [];
  for (const [i, { r, professionId }] of todo.entries()) {
    const q = r.name.trim();
    let found = cache[q];
    if (found === undefined) {
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3 && !res; attempt++) {
        try { res = await fetch(URL_TPL.replace('{q}', encodeURIComponent(q)), { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) }); }
        catch { await new Promise((ok) => setTimeout(ok, 5000)); }
      }
      if (!res) {
        writeFileSync(CACHE, JSON.stringify(cache));
        console.error(`Sin respuesta de Wowhead en la receta ${i + 1}/${todo.length}. Guardado lo leído; vuelve a ejecutarlo para continuar.`);
        process.exit(1);
      }
      if (res.status === 403 || res.status === 429) {
        writeFileSync(CACHE, JSON.stringify(cache));
        console.error(`Wowhead ha bloqueado las peticiones (HTTP ${res.status}) en la receta ${i + 1}/${todo.length}. Guardado lo leído; vuelve a ejecutarlo más tarde para continuar.`);
        process.exit(1);
      }
      found = res.ok ? parseSearchItems(await res.text()) : null;
      if (res.ok) cache[q] = found;
      if (i % 50 === 0) { writeFileSync(CACHE, JSON.stringify(cache)); console.log(`${i}/${todo.length}`); }
      await new Promise((ok) => setTimeout(ok, DELAY_MS));
    }
    const it = found ? pickRecipeItem(found, r, professionId) : null;
    if (it) items[r.id] = it; else missing.push(r.id);
  }
  writeFileSync(CACHE, JSON.stringify(cache));
  writeFileSync('data/leveling/forever-recipe-items.json', JSON.stringify({
    description: 'Objeto de receta que enseña cada receta que no enseña el instructor (clave: id de hechizo de Wowhead). sources: códigos de fuente de Wowhead del objeto (5 = vendedor, 2 = botín, 4 = misión). buyPrice: precio de compra al vendedor en cobre (sin descuentos por reputación). «missing»: recetas sin objeto inequívoco.',
    source: URL_TPL, checkedAt: new Date().toISOString().slice(0, 10), checkedRecipes: todo.length, missing: missing.sort((a, b) => a - b), items,
  }, null, 0) + '\n');
  console.log(`Recetas: ${todo.length}; con objeto: ${Object.keys(items).length}; sin objeto: ${missing.length}`);
}
