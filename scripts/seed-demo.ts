import { getDb } from '../src/server/db.js';
import { seedDemo } from '../src/server/demo.js';
const db = await getDb();
console.log(await seedDemo(db));
await db.close();
