/**
 * Flujo de Battle.net con respuestas SIMULADAS de Blizzard (no hay inicio de sesión real en las pruebas):
 * conectar, elegir personaje, profesiones, datos manuales, rutas, progreso, desconectar y aislamiento entre cuentas.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.DATABASE_URL = 'pglite:memory';
const prevEnv = { id: process.env.BLIZZARD_CLIENT_ID, secret: process.env.BLIZZARD_CLIENT_SECRET, pw: process.env.APP_PASSWORD };
process.env.BLIZZARD_CLIENT_ID = 'cliente-de-prueba';
process.env.BLIZZARD_CLIENT_SECRET = 'secreto-de-prueba';
delete process.env.APP_PASSWORD;

const { getDb, migrate } = await import('../src/server/db.js');
const { handle } = await import('../src/server/router.js');
const { setBattlenetFetch, parseProfessions, parseAccountProfile, profilePathOf, parseMedia, parseEquipment, encryptToken, decryptToken } = await import('../src/server/battlenet.js');

const ORIGIN = 'https://app.test';
const call = (path: string, init: RequestInit = {}) => handle(new Request(ORIGIN + path, { redirect: 'manual', ...init }));
const jsonCall = async (path: string, cookie: string, method = 'GET', body?: unknown, origin = ORIGIN) => {
  const res = await call(path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' ? { origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() as any };
};

// --- Blizzard simulado -------------------------------------------------------
const ACCOUNTS: Record<string, { token: string; sub: string; tag: string; chars: any[] }> = {
  'codigo-A': { token: 'token-secreto-A', sub: '111', tag: 'Alfa#1111', chars: [{ id: 1001, name: 'Alfaro', level: 40, realm: { id: 5, slug: 'nightslayer', name: 'Nightslayer' }, playable_class: { name: 'Mago', id: 8 }, playable_race: { name: 'Humano', id: 1 }, faction: { type: 'ALLIANCE' } }] },
  // Forma real de WoW Forever (13-11-2026): sin reino, con apellido y el enlace del personaje como nombre-apellido.
  'codigo-C': { token: 'token-secreto-C', sub: '333', tag: 'Zeta#3333', chars: [{ id: 3003, name: 'Zeta', surname: 'Rojas', level: 33, character: { href: 'https://us.api.blizzard.com/profile/wow/character/zeta-rojas?namespace=profile-forever-us' }, playable_class: { name: 'Cazador', id: 3 }, faction: { type: 'HORDE' } }] },
  'codigo-B': { token: 'token-secreto-B', sub: '222', tag: 'Beta#2222', chars: [{ id: 2002, name: 'Betania', level: 12, realm: { id: 5, slug: 'nightslayer', name: 'Nightslayer' }, playable_class: { name: 'Pícaro', id: 4 } }] },
};
const byToken = (auth: string | null) => Object.values(ACCOUNTS).find((a) => auth === `Bearer ${a.token}`);
const calls: string[] = [];
const fakeFetch = (async (input: any, init: any = {}) => {
  const url = String(input);
  calls.push(url);
  const headers = new Headers(init.headers);
  const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (url === 'https://oauth.battle.net/token') {
    const p = new URLSearchParams(String(init.body));
    if (headers.get('authorization') !== 'Basic ' + Buffer.from('cliente-de-prueba:secreto-de-prueba').toString('base64')) return reply(401);
    if (p.get('redirect_uri') !== `${ORIGIN}/api/auth/battlenet/callback`) return reply(400, { error: 'invalid_grant' });
    const acc = ACCOUNTS[p.get('code') ?? ''];
    return acc ? reply(200, { access_token: acc.token, token_type: 'bearer', expires_in: 86399, scope: 'openid wow.profile', sub: acc.sub }) : reply(400);
  }
  const acc = byToken(headers.get('authorization'));
  if (!acc) return reply(401);
  if (url === 'https://oauth.battle.net/userinfo') return reply(200, { sub: acc.sub, id: Number(acc.sub), battletag: acc.tag });
  const u = new URL(url);
  if (u.pathname === '/profile/user/wow') return reply(200, { wow_accounts: [{ id: 77, characters: acc.chars }] });
  // Forma real de Forever (14-11-2026): perfil, retrato y equipo.
  if (u.pathname === '/profile/wow/character/zeta-rojas') return reply(200, { id: 3003, name: 'Zeta', level: 34, guild: { name: 'Last Kings' } });
  if (u.pathname === '/profile/wow/character/zeta-rojas/character-media') {
    return reply(200, { assets: [{ key: 'main-raw', value: 'https://render.worldofwarcraft.com/forever-us/character/39/3003-main-raw.png' }, { key: 'avatar', value: 'https://render.worldofwarcraft.com/forever-us/character/39/3003-avatar.jpg' }] });
  }
  if (u.pathname === '/profile/wow/character/zeta-rojas/equipment') {
    return reply(200, { equipped_items: [
      { item: { id: 3030 }, slot: { type: 'AMMO', name: 'Munición' }, quantity: 200, quality: { type: 'COMMON' }, name: 'Flecha navaja', level: { value: 30 } },
      { item: { id: 9859 }, slot: { type: 'HEAD', name: 'Cabeza' }, quality: { type: 'UNCOMMON' }, name: 'Gorro de arquero del bandido', level: { value: 36 },
        armor: { display: { display_string: '96 de armadura' } }, stats: [{ display: { display_string: '+5 Agilidad' } }], requirements: { level: { display_string: 'Requiere nivel 31' } } },
    ] });
  }
  if (u.pathname === '/profile/wow/character/zeta-rojas/professions') {
    return reply(200, { primaries: [{ profession: { id: 171, name: 'Alchemy' }, tiers: [{ skill_points: 198, max_skill_points: 225, tier: { id: 2937, name: 'Alchemy' }, known_recipes: [{ id: 1814 }] }] }] });
  }
  if (u.pathname === '/profile/wow/character/nightslayer/alfaro/professions') {
    return reply(200, { primaries: [{ profession: { id: 197, name: 'Sastrería' }, tiers: [{ skill_points: 120, max_skill_points: 150, tier: { id: 1, name: 'Sastrería' }, known_recipes: [] }] }] });
  }
  return reply(404);
}) as typeof fetch;

/** Conecta con el código indicado y devuelve la cookie de sesión de Battle.net. */
async function connect(code: string): Promise<string> {
  const start = await call('/api/battlenet/start?region=us');
  expect(start.status).toBe(302);
  const loc = new URL(start.headers.get('location')!);
  expect(loc.origin).toBe('https://oauth.battle.net');
  expect(loc.searchParams.get('scope')).toBe('openid wow.profile');
  const state = loc.searchParams.get('state')!;
  const stateCookie = start.headers.getSetCookie()[0].split(';')[0];
  const cb = await call(`/api/auth/battlenet/callback?code=${code}&state=${state}`, { headers: { cookie: stateCookie } });
  expect(cb.status).toBe(302);
  expect(cb.headers.get('location')).toBe('/#/personaje?bnet=ok');
  const sess = cb.headers.getSetCookie().find((c) => c.startsWith('mw_bnet='))!;
  expect(sess).toMatch(/HttpOnly/);
  expect(sess).toMatch(/SameSite=Lax/);
  expect(sess).toMatch(/Secure/);
  return sess.split(';')[0];
}

let A = '';
let B = '';
let charA = '';
let charB = '';

beforeAll(async () => {
  await migrate(await getDb());
  setBattlenetFetch(fakeFetch);
});
afterAll(() => {
  setBattlenetFetch(null);
  for (const [k, v] of [['BLIZZARD_CLIENT_ID', prevEnv.id], ['BLIZZARD_CLIENT_SECRET', prevEnv.secret], ['APP_PASSWORD', prevEnv.pw]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('Battle.net: conexión (OAuth)', () => {
  it('sin conexión: estado «no conectado» y /api/me pide conectar (401)', async () => {
    const st = await jsonCall('/api/battlenet/status', '');
    expect(st.json).toMatchObject({ configured: true, connected: false, redirectUri: `${ORIGIN}/api/auth/battlenet/callback` });
    expect((await jsonCall('/api/me/characters', '')).status).toBe(401);
  });

  it('rechaza un state que no coincide con la cookie, uno inventado y uno ya usado', async () => {
    const start = await call('/api/battlenet/start?region=us');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const stateCookie = start.headers.getSetCookie()[0].split(';')[0];
    const otro = await call(`/api/auth/battlenet/callback?code=codigo-A&state=${state}`, { headers: { cookie: 'mw_bnet_state=otro' } });
    expect(otro.headers.get('location')).toBe('/#/personaje?bnet=estado_invalido');
    const inventado = await call(`/api/auth/battlenet/callback?code=codigo-A&state=inventado`, { headers: { cookie: 'mw_bnet_state=inventado' } });
    expect(inventado.headers.get('location')).toBe('/#/personaje?bnet=estado_invalido');
    const ok = await call(`/api/auth/battlenet/callback?code=codigo-A&state=${state}`, { headers: { cookie: stateCookie } });
    expect(ok.headers.get('location')).toBe('/#/personaje?bnet=ok');
    const repetido = await call(`/api/auth/battlenet/callback?code=codigo-A&state=${state}`, { headers: { cookie: stateCookie } });
    expect(repetido.headers.get('location')).toBe('/#/personaje?bnet=estado_invalido');
  });

  it('si el usuario cancela en Battle.net vuelve con «cancelado» y sin sesión', async () => {
    const start = await call('/api/battlenet/start?region=us');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const res = await call(`/api/auth/battlenet/callback?error=access_denied&state=${state}`, { headers: { cookie: `mw_bnet_state=${state}` } });
    expect(res.headers.get('location')).toBe('/#/personaje?bnet=cancelado');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('mw_bnet=') && !c.startsWith('mw_bnet=;'))).toBe(false);
  });

  it('conecta dos cuentas distintas; el token nunca sale del servidor y se guarda cifrado', async () => {
    A = await connect('codigo-A');
    B = await connect('codigo-B');
    const st = await jsonCall('/api/battlenet/status', A);
    expect(st.json.connected).toBe(true);
    expect(st.json.account.battletag).toBe('Alfa#1111');
    expect(JSON.stringify(st.json)).not.toMatch(/token-secreto/);
    const db = await getDb();
    const rows = await db.query<any>('select token_enc from bnet_session');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.token_enc).not.toMatch(/token-secreto/);
    expect(decryptToken(encryptToken('abc'))).toBe('abc');
    expect(decryptToken('v1.manipulado.x.y')).toBeNull();
  });
});

describe('Battle.net: personajes, profesiones y aislamiento entre cuentas', () => {
  it('cada cuenta ve solo sus personajes', async () => {
    const a = await jsonCall('/api/me/characters/sync', A, 'POST', {});
    expect(a.status).toBe(200);
    expect(a.json.tried).toEqual([{ namespace: 'profile-forever-us', status: 200, characters: 1 }]);
    expect(a.json.characters.map((c: any) => c.name)).toEqual(['Alfaro']);
    charA = a.json.characters[0].id;
    const b = await jsonCall('/api/me/characters/sync', B, 'POST', {});
    expect(b.json.characters.map((c: any) => c.name)).toEqual(['Betania']);
    charB = b.json.characters[0].id;
    expect((await jsonCall('/api/me/characters', A)).json.characters.map((c: any) => c.id)).toEqual([charA]);
  });

  it('B no puede leer, modificar ni calcular rutas con el personaje de A (404, sin revelar que existe)', async () => {
    expect((await jsonCall(`/api/me/characters/${charA}`, B)).status).toBe(404);
    expect((await jsonCall(`/api/me/characters/${charA}/professions/sync`, B, 'POST', {})).status).toBe(404);
    expect((await jsonCall(`/api/me/characters/${charA}/professions/197`, B, 'PUT', { skillPoints: 1 })).status).toBe(404);
    expect((await jsonCall(`/api/me/characters/${charA}/route`, B, 'POST', { professionId: 197, version: 'forever', region: 'us' })).status).toBe(404);
    expect((await jsonCall('/api/me/plans', B, 'POST', { characterId: charA, professionId: 197, version: 'forever', region: 'us' })).status).toBe(404);
  });

  it('profesiones: dato de Blizzard cuando existe; «no disponible» cuando la API no lo da', async () => {
    const a = await jsonCall(`/api/me/characters/${charA}/professions/sync`, A, 'POST', {});
    expect(a.json.result).toEqual({ status: 'ok', professions: 1 });
    const p = a.json.character.professions[0];
    expect(p).toMatchObject({ professionId: 197, effective: { skillPoints: 120, maxSkillPoints: 150, source: 'blizzard' } });
    const b = await jsonCall(`/api/me/characters/${charB}/professions/sync`, B, 'POST', {});
    expect(b.json.result.status).toBe('no_disponible');
    expect(b.json.character.professionSync.detail).toMatch(/Indícalas a mano/);
    expect(b.json.character.professions).toEqual([]);
  });

  it('datos manuales con procedencia: no borran el de Blizzard y se puede elegir cuál usar', async () => {
    const m = await jsonCall(`/api/me/characters/${charA}/professions/197`, A, 'PUT', { skillPoints: 125, maxSkillPoints: 150, note: 'visto en el juego' });
    const p = m.json.character.professions[0];
    expect(p.blizzard.skillPoints).toBe(120);
    expect(p.effective).toMatchObject({ skillPoints: 125, source: 'manual' });
    const pref = await jsonCall(`/api/me/characters/${charA}/professions/197`, A, 'PUT', { skillPoints: 125, maxSkillPoints: 150, preferred: 'blizzard' });
    expect(pref.json.character.professions[0].effective).toMatchObject({ skillPoints: 120, source: 'blizzard' });
    expect((await jsonCall(`/api/me/characters/${charA}/professions/197`, A, 'PUT', { skillPoints: 200, maxSkillPoints: 150 })).status).toBe(400);
    const sinNivel = await jsonCall(`/api/me/characters/${charB}/route`, B, 'POST', { professionId: 197, version: 'forever', region: 'us', to: 100 });
    expect(sinNivel.status).toBe(400);
    expect(sinNivel.json.error).toMatch(/indícalo a mano/);
  });

  it('protege contra CSRF: una petición que cambia datos desde otro origen se rechaza', async () => {
    expect((await jsonCall(`/api/me/characters/${charA}/professions/197`, A, 'PUT', { skillPoints: 1 }, 'https://malicioso.test')).status).toBe(403);
    expect((await jsonCall('/api/battlenet/disconnect', A, 'POST', {}, 'https://malicioso.test')).status).toBe(403);
  });
});

describe('Battle.net: rutas guardadas y progreso', () => {
  let planId = '';
  it('calcula la ruta desde el nivel observado, con requisitos y comparación rápida/barata', async () => {
    const r = await jsonCall(`/api/me/characters/${charA}/route`, A, 'POST', { professionId: 197, version: 'forever', region: 'us', realm: 'normal-alliance', to: 160, mode: 'rapida' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ from: 120, startSkill: 120, startSource: 'blizzard', to: 160, mode: 'rapida' });
    // Sin precios en esta base de prueba: no inventa costos.
    expect(r.json.incomplete).toBe(true);
    expect(r.json.blockers.join(' ')).toMatch(/sin receta con precio/);
    expect(r.json.requirements).toEqual([{ rank: 'Experto', before: 150, characterLevel: 20, satisfied: false, levelOk: true }]);
    expect(Object.keys(r.json.comparison)).toEqual(['rapida', 'barata']);
    expect(r.json.notIncluded).toContain('desplazamientos');
    expect(r.json.recovery.min).toBeNull(); // sin precio de venta: no se inventa una recuperación de 0
  });

  it('guarda la ruta, registra el progreso y la recalcula desde el nivel observado', async () => {
    const s = await jsonCall('/api/me/plans', A, 'POST', { characterId: charA, professionId: 197, version: 'forever', region: 'us', realm: 'normal-alliance', to: 160, mode: 'barata', budget: '50' });
    expect(s.status).toBe(200);
    planId = s.json.plan.id;
    expect(s.json.plan).toMatchObject({ startSkill: 120, target: 160, mode: 'barata', status: 'activo' });
    const p = await jsonCall(`/api/me/plans/${planId}/progress`, A, 'POST', { observedSkill: 140, note: 'tras una sesión' });
    expect(p.status).toBe(200);
    expect(p.json.plan.result.from).toBe(140);
    expect(p.json.plan.result.startSource).toBe('progreso');
    expect(p.json.plan.progress).toEqual([expect.objectContaining({ observedSkill: 140, source: 'manual', note: 'tras una sesión' })]);
    // Blizzard (simulado) sigue diciendo 120 < 140 ya registrado: foto atrasada, no retrocede sin confirmación.
    const sync = await jsonCall(`/api/me/plans/${planId}/progress`, A, 'POST', { sync: true });
    expect(sync.status).toBe(409);
    expect(sync.json.error).toMatch(/dato atrasado/);
    expect((await jsonCall(`/api/me/plans/${planId}`, A)).json.plan.progress).toHaveLength(1);
    const done = await jsonCall(`/api/me/plans/${planId}/progress`, A, 'POST', { observedSkill: 160 });
    expect(done.json.plan.status).toBe('completado');
  });

  it('objetivo ya alcanzado: ruta vacía con estado «completado», no un error', async () => {
    const r = await jsonCall(`/api/me/characters/${charA}/route`, A, 'POST', { professionId: 197, version: 'forever', region: 'us', to: 100 });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ completed: true, from: 120, to: 100, steps: [] });
    const s = await jsonCall('/api/me/plans', A, 'POST', { characterId: charA, professionId: 197, version: 'forever', region: 'us', to: 100 });
    expect(s.json.plan.status).toBe('completado');
    await jsonCall(`/api/me/plans/${s.json.plan.id}`, A, 'DELETE');
  });

  it('B no ve, no modifica ni borra la ruta de A', async () => {
    expect((await jsonCall(`/api/me/plans/${planId}`, B)).status).toBe(404);
    expect((await jsonCall(`/api/me/plans/${planId}/progress`, B, 'POST', { observedSkill: 150 })).status).toBe(404);
    expect((await jsonCall(`/api/me/plans/${planId}`, B, 'DELETE')).status).toBe(404);
    expect((await jsonCall('/api/me/plans', B)).json.plans).toEqual([]);
    expect((await jsonCall('/api/me/plans', A)).json.plans.map((p: any) => p.id)).toEqual([planId]);
  });
});

describe('Battle.net: desconectar', () => {
  it('desconectar cierra la sesión pero conserva los datos; al volver a conectar siguen ahí', async () => {
    const d = await call('/api/battlenet/disconnect', { method: 'POST', headers: { cookie: A, origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' });
    expect(d.status).toBe(200);
    expect(d.headers.getSetCookie()[0]).toMatch(/^mw_bnet=;.*Max-Age=0/);
    expect((await jsonCall('/api/me/characters', A)).status).toBe(401);
    A = await connect('codigo-A');
    expect((await jsonCall('/api/me/characters', A)).json.characters.map((c: any) => c.id)).toEqual([charA]);
  });

  it('desconectar y borrar elimina todo lo de esa cuenta y nada de la otra', async () => {
    const d = await jsonCall('/api/battlenet/disconnect', A, 'POST', { deleteData: true });
    expect(d.json).toEqual({ ok: true, deleted: true });
    const db = await getDb();
    expect(await db.query(`select 1 from bnet_account where bnet_sub='111'`)).toEqual([]);
    expect(await db.query(`select 1 from bnet_character where id=$1`, [charA])).toEqual([]);
    expect(await db.query(`select 1 from leveling_plan`)).toEqual([]);
    expect((await jsonCall('/api/me/characters', B)).json.characters.map((c: any) => c.id)).toEqual([charB]);
  });

  it('una sesión caducada ya no da acceso', async () => {
    const db = await getDb();
    await db.query(`update bnet_session set expires_at = now() - interval '1 minute'`);
    expect((await jsonCall('/api/me/characters', B)).status).toBe(401);
  });
});

describe('Parsers de Blizzard (tolerantes)', () => {
  it('profesiones: formato con tiers y formato plano; un nivel ausente queda null, no 0', () => {
    const r = parseProfessions({ primaries: [{ profession: { id: 164, name: { es_MX: 'Herrería', en_US: 'Blacksmithing' } }, skill_points: 200, max_skill_points: 225 }], secondaries: [{ profession: { id: 185, name: 'Cocina' }, tiers: [{ tier: { id: 9 } }] }] }, 'us');
    expect(r).toEqual([
      { professionId: 164, professionName: 'Herrería', tierId: null, tierName: null, skillPoints: 200, maxSkillPoints: 225, knownRecipes: [] },
      { professionId: 185, professionName: 'Cocina', tierId: 9, tierName: null, skillPoints: null, maxSkillPoints: null, knownRecipes: [] },
    ]);
  });
  it('lista de personajes: ignora entradas sin id o nombre', () => {
    const r = parseAccountProfile({ wow_accounts: [{ id: 1, characters: [{ id: 5, name: 'Uno', realm: { slug: 'x', name: 'X', id: 2 } }, { name: 'SinId' }] }] }, 'us');
    expect(r.map((c) => c.name)).toEqual(['Uno']);
    expect(parseAccountProfile({}, 'us')).toEqual([]);
  });
});

describe('Battle.net con APP_PASSWORD', () => {
  it('las rutas de Battle.net y /api/me exigen la contraseña de la aplicación; solo la vuelta de OAuth es pública', async () => {
    process.env.APP_PASSWORD = 'clave-de-prueba-123';
    try {
      expect((await call('/api/battlenet/start?region=us')).status).toBe(401);
      expect((await call('/api/battlenet/status')).status).toBe(401);
      expect((await call('/api/me/characters')).status).toBe(401);
      expect((await call('/api/route?version=forever&region=us&profession=197')).status).toBe(401);
      // La vuelta desde Battle.net no lleva la cookie Strict de la aplicación: es pública, pero sin state válido no hace nada.
      const cb = await call('/api/auth/battlenet/callback?code=codigo-A&state=x');
      expect(cb.status).toBe(302);
      expect(cb.headers.get('location')).toBe('/#/personaje?bnet=estado_invalido');
    } finally {
      delete process.env.APP_PASSWORD;
    }
  });
});

describe('Battle.net: personajes de WoW Forever (sin reino)', () => {
  it('lee el enlace nombre-apellido, no duplica al resincronizar y lee las profesiones', async () => {
    const C = await connect('codigo-C');
    await jsonCall('/api/me/characters/sync', C, 'POST', {});
    const r = await jsonCall('/api/me/characters/sync', C, 'POST', {});
    expect(r.json.characters).toHaveLength(1);
    expect(r.json.characters[0]).toMatchObject({ name: 'Zeta', surname: 'Rojas', realm: { id: null, slug: null } });
    const id = r.json.characters[0].id;
    expect((await jsonCall(`/api/me/characters/${id}/professions/sync`, C, 'POST', {})).status).toBe(200);
    expect(calls.some((u) => u.includes('/profile/wow/character/zeta-rojas/professions'))).toBe(true);
    const d = await jsonCall(`/api/me/characters/${id}`, C);
    expect(JSON.stringify(d.json)).toContain('198');
  });

  it('«Actualizar desde Blizzard» guarda nivel, hermandad, retrato y equipo en el orden del juego', async () => {
    const C = await connect('codigo-C');
    const list = await jsonCall('/api/me/characters', C);
    const id = list.json.characters[0].id;
    const r = await jsonCall(`/api/me/characters/${id}/sync`, C, 'POST', {});
    expect(r.status).toBe(200);
    const c = r.json.character;
    expect(c).toMatchObject({ level: 34, guild: 'Last Kings', profileDetail: null });
    expect(c.media.main).toMatch(/^https:\/\/render\.worldofwarcraft\.com\//);
    expect(c.equipment.map((i: any) => i.slot)).toEqual(['HEAD', 'AMMO']);
    expect(c.equipment[0]).toMatchObject({ itemId: 9859, quality: 'UNCOMMON', itemLevel: 36, armor: '96 de armadura', stats: ['+5 Agilidad'], requirement: 'Requiere nivel 31' });
    expect(c.profileSyncedAt).not.toBeNull();
    expect(c.professions.length).toBeGreaterThan(0);
    // Otra cuenta no puede actualizar este personaje.
    const otra = await connect('codigo-A');
    expect((await jsonCall(`/api/me/characters/${id}/sync`, otra, 'POST', {})).status).toBe(404);
  });

  it('el retrato solo acepta https de render.worldofwarcraft.com; un equipo sin id se ignora', () => {
    expect(parseMedia({ assets: [{ key: 'main-raw', value: 'https://evil.example.com/x.png' }, { key: 'avatar', value: 'javascript:alert(1)' }] })).toEqual({ avatar: null, main: null });
    expect(parseMedia({ assets: [{ key: 'main', value: 'https://render.worldofwarcraft.com/a/b-main.png' }] }).main).toBe('https://render.worldofwarcraft.com/a/b-main.png');
    expect(parseEquipment({ equipped_items: [{ slot: { type: 'HEAD' } }, { item: { id: 1 } }] }, 'us')).toEqual([]);
  });

  it('solo acepta enlaces de personaje de api.blizzard.com', () => {
    expect(profilePathOf('https://us.api.blizzard.com/profile/wow/character/mati-fernandez?namespace=profile-forever-us')).toBe('/profile/wow/character/mati-fernandez');
    expect(profilePathOf('https://eu.api.blizzard.com/profile/wow/character/nightslayer/alfaro')).toBe('/profile/wow/character/nightslayer/alfaro');
    expect(profilePathOf('https://malo.example.com/profile/wow/character/x')).toBeNull();
    expect(profilePathOf('http://us.api.blizzard.com/profile/wow/character/x')).toBeNull();
    expect(profilePathOf('https://us.api.blizzard.com/data/wow/token')).toBeNull();
    expect(profilePathOf('https://us.api.blizzard.com/profile/wow/character/a/b/c')).toBeNull();
    expect(profilePathOf(undefined)).toBeNull();
  });
});
