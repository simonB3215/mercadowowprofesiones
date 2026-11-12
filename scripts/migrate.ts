import { getDb, migrate } from '../src/server/db.js';
const db = await getDb();
const applied = await migrate(db);
console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'Sin migraciones pendientes.');
await db.close();
