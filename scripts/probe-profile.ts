// PC-01: comprueba qué rutas de perfil de Blizzard responden para WoW Forever con el token de cliente.
// No imprime tokens. Uso: npm run probe:profile [-- us] [-- reino nombre]
import { createBlizzardClient, BlizzardError } from '../src/server/providers/blizzard.js';

const args = process.argv.slice(2).filter((a) => a !== '--');
const region = args[0] ?? 'us';
const [realm, name] = [args[1], args[2]];
const c = createBlizzardClient(region);

async function probe(path: string, ns: string) {
  try {
    const j = await c.get(path, ns);
    console.log(`200  ${ns.padEnd(26)} ${path}  claves: ${Object.keys(j).slice(0, 12).join(', ')}`);
    return j;
  } catch (e) {
    const s = e instanceof BlizzardError ? e.status : '???';
    console.log(`${s}  ${ns.padEnd(26)} ${path}`);
    return null;
  }
}

const families = ['forever', 'classic1x', 'classicann', 'classic'];
for (const f of families) {
  await probe('/data/wow/realm/index', `dynamic-${f}-${region}`);
  await probe('/data/wow/connected-realm/index', `dynamic-${f}-${region}`);
}
for (const f of [...families, '']) {
  const ns = f ? `profile-${f}-${region}` : `profile-${region}`;
  await probe('/profile/user/wow', ns); // exige token de usuario: con token de cliente se espera 401/403
}
if (realm && name) {
  for (const f of [...families, '']) {
    const ns = f ? `profile-${f}-${region}` : `profile-${region}`;
    const base = `/profile/wow/character/${encodeURIComponent(realm)}/${encodeURIComponent(name.toLowerCase())}`;
    if (await probe(base, ns)) await probe(`${base}/professions`, ns);
  }
}
