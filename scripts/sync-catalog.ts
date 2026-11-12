// Uso: npm run sync:catalog -- us [--refresh] [--prof=171,164] [--limit=200] [--realms]
import { getDb } from '../src/server/db.js';
import { createBlizzardClient } from '../src/server/providers/blizzard.js';
import { syncCatalog, syncRealms } from '../src/server/catalog/sync.js';
const args = process.argv.slice(2).filter((a) => a !== '--');
const region = args.find((a) => !a.startsWith('--')) ?? 'us';
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const db = await getDb();
const client = createBlizzardClient(region);
if (args.includes('--realms')) console.log(`Reinos: ${await syncRealms(db, client, 'retail')}`);
const r = await syncCatalog(db, client, {
  version: 'retail',
  refresh: args.includes('--refresh'),
  onlyProfessions: opt('prof')?.split(',').map(Number),
  limitRecipes: opt('limit') ? Number(opt('limit')) : undefined,
  log: (m) => console.log(m),
});
console.log(r);
await db.close();
