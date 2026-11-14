// Materiales que se compran a un vendedor y su precio, para los materiales de data/leveling/forever-wowhead.json.
// Fuente: XML público de cada objeto en Wowhead Forever («source»: 5 = vendedor; «buyprice» en cobre) y el tamaño del
// lote de compra de Blizzard (item.raw.purchase_quantity, catálogo en Supabase).
// Escribe data/leveling/forever-vendor-items.json.  Uso: npm run sync:vendor   (unas 550 peticiones, una cada 1,5 s; si Wowhead bloquea, se reanuda)
//
// Regla (D35): solo cuenta como «de vendedor» un material cuya ÚNICA fuente en Wowhead es un vendedor. Los que además
// se recogen, caen de botín o se fabrican (Loto negro, esencias, hierbas…) suelen venderse con existencias limitadas o
// en vendedores especiales: se guardan como excluidos y no se usa su precio.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDb } from '../src/server/db.js';

const DATA = JSON.parse(readFileSync('data/leveling/forever-wowhead.json', 'utf8')) as {
  professions: Array<{ recipes: Array<{ reagents: Array<{ itemId: number }> }> }>;
};
const ids = [...new Set(DATA.professions.flatMap((p) => p.recipes.flatMap((r) => r.reagents.map((g) => g.itemId))))].sort((a, b) => a - b);
const URL_TPL = 'https://www.wowhead.com/forever/item={id}&xml';
const VENDOR_SOURCE = 5;
const DELAY_MS = 1500;
/** Respuestas ya leídas (fuera del repositorio): si Wowhead bloquea, la siguiente ejecución sigue desde aquí. */
const CACHE = join(tmpdir(), 'mercado-wow-vendor-xml.json');

/** Fuentes y precio de compra del XML de Wowhead, o null si no trae el bloque esperado (no se inventa). */
export function parseItemXml(xml: string): { sources: number[]; buyPrice: number | null } | null {
  const json = /<json><!\[CDATA\[(.*?)\]\]><\/json>/s.exec(xml);
  if (!json) return null;
  const equip = /<jsonEquip><!\[CDATA\[(.*?)\]\]><\/jsonEquip>/s.exec(xml);
  const src = /"source":\[([\d,]*)\]/.exec(json[1]);
  const buy = equip ? /"buyprice":(\d+)/.exec(equip[1]) : null;
  return { sources: src && src[1] ? src[1].split(',').map(Number) : [], buyPrice: buy ? Number(buy[1]) : null };
}

if (process.argv[1]?.includes('sync-vendor-items')) {
  process.loadEnvFile?.('.env');
  const db = await getDb();
  const lots = new Map<number, number | null>();
  for (const r of await db.query<any>(`select id, (raw->>'purchase_quantity')::int as pq from item where game_version='forever' and id = any($1::int[])`, [ids])) {
    lots.set(Number(r.id), r.pq === null ? null : Number(r.pq));
  }
  await db.close();

  const vendor: Record<string, { price: number; lot: number }> = {};
  const excluded: Record<string, { price: number; sources: number[]; reason: string }> = {};
  const missing: number[] = [];
  const cache: Record<string, ReturnType<typeof parseItemXml>> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  for (const [i, id] of ids.entries()) {
    let parsed = cache[id];
    if (parsed === undefined) {
      const r = await fetch(URL_TPL.replace('{id}', String(id)), { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.status === 403 || r.status === 429) {
        writeFileSync(CACHE, JSON.stringify(cache));
        console.error(`Wowhead ha bloqueado las peticiones (HTTP ${r.status}) en el objeto ${i + 1}/${ids.length}. Guardado lo leído; vuelve a ejecutarlo más tarde para continuar.`);
        process.exit(1);
      }
      parsed = r.ok ? parseItemXml(await r.text()) : null;
      if (r.ok || r.status === 404) cache[id] = parsed;
      await new Promise((res) => setTimeout(res, DELAY_MS));
    }
    if (!parsed) missing.push(id);
    else if (parsed.sources.includes(VENDOR_SOURCE) && parsed.buyPrice && parsed.buyPrice > 0) {
      const lot = lots.get(id) ?? null;
      if (parsed.sources.length !== 1) excluded[id] = { price: parsed.buyPrice, sources: parsed.sources, reason: 'también se obtiene de otra forma (posible existencia limitada)' };
      else if (!lot || lot < 1) excluded[id] = { price: parsed.buyPrice, sources: parsed.sources, reason: 'sin tamaño de lote en Blizzard' };
      else vendor[id] = { price: parsed.buyPrice, lot };
    }
  }
  writeFileSync(CACHE, JSON.stringify(cache));
  writeFileSync('data/leveling/forever-vendor-items.json', JSON.stringify({
    description: 'Materiales que solo se obtienen de vendedores (Wowhead Forever: source = [5]) con su precio de compra en cobre por lote de «lot» unidades (tamaño de lote de Blizzard). «excluded»: marcados como de vendedor pero que también se obtienen de otra forma; su precio no se usa. Sin descuentos por reputación.',
    source: URL_TPL, checkedAt: new Date().toISOString().slice(0, 10), checkedItems: ids.length, missing: missing.sort((a, b) => a - b),
    vendor, excluded,
  }, null, 0) + '\n');
  console.log(`Materiales: ${ids.length}; de vendedor: ${Object.keys(vendor).length}; excluidos: ${Object.keys(excluded).length}; sin dato: ${missing.length}`);
}
