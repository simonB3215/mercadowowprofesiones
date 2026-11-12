// Iconos de WoW Forever (Wowhead dataEnv=16, con el icono oficial de Blizzard como respaldo).
// Uso: npm run sync:icons -- [--refresh] [--limit=100]
import { getDb } from '../src/server/db.js';
import { createBlizzardClient, hasBlizzardCredentials } from '../src/server/providers/blizzard.js';
import { resolveItem, resolveProfession, saveAsset } from '../src/server/assets.js';

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0) || undefined;
const V = 'forever';
const NS = 'static-forever-us';
const db = await getDb();
const client = hasBlizzardCredentials() ? createBlizzardClient('us') : null;
const done = refresh
  ? new Set<string>()
  : new Set((await db.query<any>(`select kind||':'||id as k from visual_asset where game_version=$1`, [V])).map((r) => r.k));

const profs = await db.query<any>(`select id, name_en from profession where game_version=$1 order by id`, [V]);
for (const p of profs) {
  if (done.has(`profession:${p.id}`)) continue;
  const a = await resolveProfession(Number(p.id), p.name_en, client, NS);
  await saveAsset(db, V, a);
  console.log('profesión', p.id, p.name_en, a.source, a.icon_name ?? a.url, a.error ?? '');
}

// Objetos usados por las recetas (resultados y reactivos).
let items = (await db.query<any>(
  `select distinct id from (select crafted_item_id as id from recipe where game_version=$1 and crafted_item_id is not null
     union select item_id from recipe_reagent where game_version=$1) x order by id`,
  [V],
)).map((r) => Number(r.id)).filter((id) => !done.has(`item:${id}`));
if (limit) items = items.slice(0, limit);
console.log(`Objetos pendientes: ${items.length}`);
const stats: Record<string, number> = {};
let failed = 0;
const CONC = 4;
for (let i = 0; i < items.length; i += CONC) {
  await Promise.all(items.slice(i, i + CONC).map(async (id) => {
    try {
      const a = await resolveItem(id, client, NS);
      await saveAsset(db, V, a);
      stats[a.source] = (stats[a.source] ?? 0) + 1;
    } catch (e) {
      failed++;
      console.log('fallo', id, (e as Error).message);
    }
  }));
  if (i % 200 === 0) console.log(`${Math.min(i + CONC, items.length)}/${items.length}`, JSON.stringify(stats));
  await new Promise((r) => setTimeout(r, 250));
}
console.log('Listo', JSON.stringify(stats), 'fallos', failed);
await db.close();
