// Catálogo de WoW Forever desde la Blizzard Game Data API (namespace static-forever-{región}).
// Uso: npm run sync:catalog -- us [--refresh] [--prof=171,164] [--limit=200]
// WoW Forever no tiene reinos: las casas de subastas son fijas (src/server/config.ts).
import { getDb } from '../src/server/db.js';
import { createBlizzardClient } from '../src/server/providers/blizzard.js';
import { syncCatalog } from '../src/server/catalog/sync.js';
import { VERSIONS } from '../src/server/config.js';
const args = process.argv.slice(2).filter((a) => a !== '--');
const region = args.find((a) => !a.startsWith('--')) ?? 'us';
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const forever = VERSIONS.find((v) => v.id === 'forever')!;
if (!forever.regions.includes(region)) throw new Error(`Región no soportada para WoW Forever: ${region}`);
const db = await getDb();
const client = createBlizzardClient(region);
const r = await syncCatalog(db, client, {
  version: 'forever',
  namespace: forever.blizzardNamespace!(region),
  refresh: args.includes('--refresh'),
  onlyProfessions: opt('prof')?.split(',').map(Number),
  limitRecipes: opt('limit') ? Number(opt('limit')) : undefined,
  log: (m) => console.log(m),
});
console.log(r);
await db.close();
