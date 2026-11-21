// Dónde se consigue cada objeto de receta (patrón, diseño, fórmula…) de data/leveling/forever-recipe-items.json:
// qué vendedor la vende, qué enemigo la suelta o qué misión la da, y en qué zona. Fuente: la ficha XML pública de
// Wowhead Forever (item={id}&xml), cuyo campo «sourcemore» trae [{n: nombre, t: tipo, ti: id, z: zona}].
// Escribe data/leveling/forever-recipe-sources.json.  Uso: npm run sync:recipe-sources
// (unas 1 700 peticiones, una cada 1,2 s: unos 35 minutos; si Wowhead bloquea, se guarda lo leído y la siguiente
// ejecución sigue donde se quedó).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_TPL = 'https://www.wowhead.com/forever/item={id}&xml';
const DELAY_MS = 1200;
const CACHE = join(tmpdir(), 'mercado-wow-recipe-sources.json');
const OUT = 'data/leveling/forever-recipe-sources.json';

/** Una fuente: n = nombre (inglés), t = tipo de Wowhead (1 PNJ, 2 objeto del mundo, 5 misión), ti = su id, z = zona. */
export interface RawSource { n: string; t: number; ti: number; z: number | null }

/** Extrae el array JSON que sigue a `"key":` en el texto, o null si no está. */
export function parseArrayAfter(text: string, key: string): any[] | null {
  const at = text.indexOf(`"${key}":`);
  if (at < 0) return null;
  const start = text.indexOf('[', at);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

/** Fuentes de la ficha XML de un objeto, limpias. Vacío si la ficha no las trae. */
export function parseSources(xml: string): RawSource[] {
  const list = parseArrayAfter(xml, 'sourcemore') ?? [];
  return list.flatMap((s: any) => {
    const n = typeof s?.n === 'string' ? s.n.trim() : '';
    const t = Number(s?.t);
    const ti = Number(s?.ti);
    if (!n || !Number.isInteger(t) || !Number.isInteger(ti) || ti <= 0) return [];
    return [{ n, t, ti, z: Number.isInteger(Number(s?.z)) && Number(s.z) > 0 ? Number(s.z) : null }];
  });
}

if (process.argv[1]?.includes('sync-recipe-sources')) {
  const items = JSON.parse(readFileSync('data/leveling/forever-recipe-items.json', 'utf8')).items as Record<string, { itemId: number }>;
  const ids = [...new Set(Object.values(items).map((i) => i.itemId))].sort((a, b) => a - b);
  const cache: Record<string, RawSource[]> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  const save = () => writeFileSync(CACHE, JSON.stringify(cache));
  for (const [i, id] of ids.entries()) {
    if (cache[id] !== undefined) continue;
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try { res = await fetch(URL_TPL.replace('{id}', String(id)), { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) }); }
      catch { await new Promise((ok) => setTimeout(ok, 5000)); }
    }
    if (!res) { save(); console.error(`Sin respuesta de Wowhead en el objeto ${i + 1}/${ids.length}. Guardado lo leído; vuelve a ejecutarlo para continuar.`); process.exit(1); }
    if (res.status === 403 || res.status === 429) {
      save();
      console.error(`Wowhead ha bloqueado las peticiones (HTTP ${res.status}) en el objeto ${i + 1}/${ids.length}. Guardado lo leído; vuelve a ejecutarlo más tarde para continuar.`);
      process.exit(1);
    }
    if (res.ok) cache[id] = parseSources(await res.text());
    if (i % 50 === 0) { save(); console.log(`${i}/${ids.length}`); }
    await new Promise((ok) => setTimeout(ok, DELAY_MS));
  }
  save();
  const out: Record<string, RawSource[]> = {};
  for (const id of ids) if (cache[id]?.length) out[id] = cache[id];
  writeFileSync(OUT, JSON.stringify({
    description: 'Dónde se consigue cada objeto de receta (clave: id del objeto). n: nombre en inglés; t: tipo de Wowhead (1 PNJ, 2 objeto del mundo, 5 misión); ti: id en Wowhead; z: id de zona (null si no se sabe).',
    source: URL_TPL, checkedAt: new Date().toISOString().slice(0, 10), checkedItems: ids.length, items: out,
  }) + '\n');
  console.log(`Objetos: ${ids.length}; con fuente: ${Object.keys(out).length}`);
}
