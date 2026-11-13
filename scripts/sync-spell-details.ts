// Tiempo de lanzamiento y herramientas de cada receta de data/leveling/forever-wowhead.json, desde los tooltips
// públicos de Wowhead (dataEnv=16 = Forever). Escribe data/leveling/forever-spell-details.json.
// Uso: npm run sync:spells   (unas 2 200 peticiones, 4 en paralelo)
import { readFileSync, writeFileSync } from 'node:fs';

const DATA = JSON.parse(readFileSync('data/leveling/forever-wowhead.json', 'utf8')) as { professions: Array<{ recipes: Array<{ id: number }> }> };
const ids = [...new Set(DATA.professions.flatMap((p) => p.recipes.map((r) => r.id)))].sort((a, b) => a - b);
const URL_TPL = 'https://nether.wowhead.com/tooltip/spell/{id}?dataEnv=16&locale=0';

/** «3 sec cast» → 3; «1 min cast» → 60; «Instant» → 0; otro texto → null (no se inventa). */
function parseCast(html: string): number | null {
  const head = html.split('Reagents:')[0];
  if (/>\s*Instant\b|<br \/>Instant\b/.test(head)) return 0;
  const m = /([\d.]+)\s*(sec|min)\s+cast/.exec(head);
  if (!m) return null;
  return Number(m[1]) * (m[2] === 'min' ? 60 : 1);
}
function parseTools(html: string): string[] {
  const m = /Tools:<br \/>(.*?)<\/div>/.exec(html);
  if (!m) return [];
  return [...m[1].matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((x) => x[1]);
}

const cast: Record<string, number[]> = {};
const tools: Record<string, number[]> = {};
const failed: number[] = [];
let next = 0;
async function worker() {
  while (next < ids.length) {
    const id = ids[next++];
    let html: string | null = null;
    for (let attempt = 0; attempt < 3 && html === null; attempt++) {
      try {
        const r = await fetch(URL_TPL.replace('{id}', String(id)));
        if (r.ok) html = ((await r.json()) as { tooltip?: string }).tooltip ?? '';
      } catch { /* reintento */ }
    }
    if (html === null) { failed.push(id); continue; }
    const c = parseCast(html);
    if (c === null) failed.push(id);
    else (cast[String(c)] ??= []).push(id);
    for (const t of parseTools(html)) (tools[t] ??= []).push(id);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
for (const k of Object.keys(cast)) cast[k].sort((a, b) => a - b);
for (const k of Object.keys(tools)) tools[k].sort((a, b) => a - b);
writeFileSync('data/leveling/forever-spell-details.json', JSON.stringify({
  description: 'Tiempo de lanzamiento (segundos) y herramientas de cada receta, agrupados por valor. Texto de los tooltips de Wowhead Forever. Las recetas sin dato no aparecen (no se inventa).',
  source: URL_TPL, checkedAt: new Date().toISOString().slice(0, 10), checkedRecipes: ids.length, missing: failed.sort((a, b) => a - b),
  castSeconds: cast, tools,
}, null, 0) + '\n');
console.log(`Recetas: ${ids.length}; sin dato: ${failed.length}; valores: ${Object.keys(cast).join(', ')}`);
