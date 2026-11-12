// Uso: npm run sync:prices -- us normal-alliance [--force]  (WoW Forever)
import { getDb } from '../src/server/db.js';
import { validateContext } from '../src/server/market.js';
import { syncPrices } from '../src/server/router.js';
const [region = 'us', realm, ...rest] = process.argv.slice(2).filter((a) => a !== '--');
const db = await getDb();
const ctx = validateContext({ version: 'forever', region, realm: realm && !realm.startsWith('--') ? realm : null });
console.log(JSON.stringify(await syncPrices(db, ctx, rest.includes('--force') || realm === '--force'), (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
await db.close();
