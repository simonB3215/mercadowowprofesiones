/**
 * Conexión con Battle.net (PC-02 a PC-06): inicio de sesión oficial (OAuth 2.0, código de autorización), sesión propia
 * de la cuenta, personajes de la cuenta y profesiones.
 *
 * Contrato verificado (PC-01, ver docs/VALIDACION_FUENTES.md):
 *  - https://oauth.battle.net/authorize · /token (authorization_code, Basic client_id:secret) · /userinfo (sub, battletag).
 *  - Ámbito «wow.profile» para /profile/user/wow (lista de personajes de la cuenta). Probado: con token de cliente
 *    responde 403 en todos los namespaces, así que la lista solo se puede comprobar con un inicio de sesión real.
 *  - Las API de perfil de Classic documentadas NO incluyen profesiones; se intenta /professions y, si no responde,
 *    se registra «no disponible» y se piden los datos a mano.
 *
 * Seguridad:
 *  - La aplicación nunca ve la contraseña de Battle.net: el usuario inicia sesión en oauth.battle.net.
 *  - «state» aleatorio de un solo uso (10 min), guardado como SHA-256 y ligado a una cookie del navegador que empezó.
 *  - El token de acceso se guarda cifrado (AES-256-GCM) y nunca se envía al navegador. Sin token de renovación: al
 *    caducar (≈ 24 h) hay que volver a conectar.
 *  - La cookie de sesión de Battle.net solo lleva un identificador aleatorio (en la base, su SHA-256). Cada consulta de
 *    /api/me/* filtra por la cuenta de esa sesión.
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import type { Db } from './db.js';
import { HttpError } from './market.js';
import { pickName, LOCALE_PREF } from './providers/blizzard.js';

export const BNET_COOKIE = 'mw_bnet';
export const STATE_COOKIE = 'mw_bnet_state';
const STATE_TTL_S = 600;
const REGIONS = ['us', 'eu', 'kr', 'tw'];

// Inyectable en las pruebas (respuestas simuladas de Battle.net).
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function setBattlenetFetch(f: typeof fetch | null) { fetchImpl = f ?? ((...a) => fetch(...a)); }

export function battlenetConfig() {
  const clientId = process.env.BLIZZARD_CLIENT_ID ?? '';
  const secret = process.env.BLIZZARD_CLIENT_SECRET ?? '';
  const missing = [!clientId && 'BLIZZARD_CLIENT_ID', !secret && 'BLIZZARD_CLIENT_SECRET'].filter(Boolean) as string[];
  return { clientId, secret, configured: missing.length === 0, missing };
}

/** Namespaces de perfil que se prueban, en orden. Forever no está documentado: se puede cambiar sin tocar código. */
export function profileNamespaces(region: string): string[] {
  const raw = process.env.BNET_PROFILE_NAMESPACES || 'profile-forever-{region}';
  return raw.split(',').map((s) => s.trim().replace('{region}', region)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const randomId = () => randomBytes(32).toString('base64url');

function tokenKey(): Buffer {
  const base = process.env.BNET_TOKEN_KEY || process.env.BLIZZARD_CLIENT_SECRET;
  if (!base) throw new HttpError(503, 'Falta BLIZZARD_CLIENT_SECRET (o BNET_TOKEN_KEY) para cifrar el token.');
  return Buffer.from(hkdfSync('sha256', base, 'mercado-wow', 'bnet-token-v1', 32));
}
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', tokenKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function decryptToken(enc: string): string | null {
  try {
    const [v, iv, tag, ct] = enc.split('.');
    if (v !== 'v1') return null;
    const d = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null; // clave cambiada o dato manipulado: hay que volver a conectar
  }
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** Origen público de la aplicación (detrás de Vercel o del proxy de Vite). */
export function publicOrigin(req: Request): string {
  const u = new URL(req.url);
  const proto = (req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '')).split(',')[0].trim();
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? u.host).split(',')[0].trim();
  return `${proto}://${host}`;
}
export const redirectUri = (req: Request) => process.env.BNET_REDIRECT_URI || `${publicOrigin(req)}/api/auth/battlenet/callback`;

const isHttps = (req: Request) => publicOrigin(req).startsWith('https:');
/** SameSite=Lax: la vuelta desde oauth.battle.net es una navegación de otro sitio y una cookie Strict no llegaría. */
function cookie(req: Request, name: string, value: string, maxAge: number, path = '/') {
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}

/** Protección CSRF de las rutas que cambian datos: si el navegador envía Origin, tiene que ser el de la aplicación. */
export function checkSameOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  if (origin && origin !== publicOrigin(req)) throw new HttpError(403, 'Origen no permitido.');
}

function redirect(location: string, cookies: string[] = []): Response {
  const res = new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } });
  for (const c of cookies) res.headers.append('set-cookie', c);
  return res;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export async function startLogin(db: Db, req: Request, region: string): Promise<Response> {
  const cfg = battlenetConfig();
  if (!cfg.configured) throw new HttpError(503, `Falta configurar ${cfg.missing.join(' y ')} en el servidor.`);
  if (!REGIONS.includes(region)) throw new HttpError(400, 'Región no soportada.');
  const state = randomId();
  await db.query(`delete from oauth_state where created_at < now() - interval '1 day'`);
  await db.query(`insert into oauth_state (state_hash, region) values ($1, $2)`, [sha256(state), region]);
  const q = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: redirectUri(req), scope: 'openid wow.profile', state });
  return redirect(`https://oauth.battle.net/authorize?${q}`, [cookie(req, STATE_COOKIE, state, STATE_TTL_S, '/api/auth/battlenet')]);
}

const back = (status: string) => `/#/personaje?bnet=${encodeURIComponent(status)}`;

export async function finishLogin(db: Db, req: Request, url: URL): Promise<Response> {
  const clearState = cookie(req, STATE_COOKIE, '', 0, '/api/auth/battlenet');
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  const browserState = readCookie(req, STATE_COOKIE);
  // El state tiene que coincidir con la cookie de este navegador y no haberse usado ni caducado.
  if (!state || !browserState || browserState !== state) return redirect(back('estado_invalido'), [clearState]);
  const used = await db.query<any>(
    `update oauth_state set used_at = now() where state_hash = $1 and used_at is null and created_at > now() - make_interval(secs => $2) returning region`,
    [sha256(state), STATE_TTL_S],
  );
  if (!used.length) return redirect(back('estado_invalido'), [clearState]);
  if (url.searchParams.get('error')) return redirect(back(url.searchParams.get('error') === 'access_denied' ? 'cancelado' : 'error'), [clearState]);
  if (!code) return redirect(back('error'), [clearState]);
  const region = String(used[0].region);
  const cfg = battlenetConfig();
  if (!cfg.configured) return redirect(back('sin_configurar'), [clearState]);

  const tokenRes = await fetchImpl('https://oauth.battle.net/token', {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(req) }).toString(),
  });
  if (!tokenRes.ok) return redirect(back('token'), [clearState]);
  const tok: any = await tokenRes.json();
  if (!tok.access_token) return redirect(back('token'), [clearState]);
  const scope = String(tok.scope ?? '');
  const info = await fetchImpl('https://oauth.battle.net/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } });
  if (!info.ok) return redirect(back('usuario'), [clearState]);
  const u: any = await info.json();
  const sub = String(u.sub ?? u.id ?? '');
  if (!sub) return redirect(back('usuario'), [clearState]);

  const acc = await db.query<any>(
    `insert into bnet_account (bnet_sub, battletag, region) values ($1, $2, $3)
     on conflict (bnet_sub) do update set battletag = excluded.battletag, region = excluded.region, updated_at = now() returning id`,
    [sub, u.battletag ?? null, region],
  );
  const sid = randomId();
  const expiresIn = Math.max(60, Math.min(Number(tok.expires_in) || 3600, 30 * 24 * 3600));
  await db.query(`delete from bnet_session where expires_at < now()`);
  await db.query(
    `insert into bnet_session (id_hash, account_id, token_enc, scope, expires_at) values ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
    [sha256(sid), acc[0].id, encryptToken(tok.access_token), scope, expiresIn],
  );
  return redirect(back(scope.split(' ').includes('wow.profile') || !scope ? 'ok' : 'sin_permiso'), [clearState, cookie(req, BNET_COOKIE, sid, expiresIn)]);
}

export interface BnetSession { accountId: string; token: string | null; region: string; battletag: string | null; expiresAt: string; scope: string | null; sessionHash: string }

export async function currentSession(db: Db, req: Request): Promise<BnetSession | null> {
  const sid = readCookie(req, BNET_COOKIE);
  if (!sid) return null;
  const rows = await db.query<any>(
    `select s.id_hash, s.account_id, s.token_enc, s.scope, s.expires_at, a.region, a.battletag
     from bnet_session s join bnet_account a on a.id = s.account_id where s.id_hash = $1 and s.expires_at > now()`,
    [sha256(sid)],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { accountId: String(r.account_id), token: decryptToken(r.token_enc), region: r.region, battletag: r.battletag, expiresAt: new Date(r.expires_at).toISOString(), scope: r.scope, sessionHash: r.id_hash };
}

export async function requireSession(db: Db, req: Request): Promise<BnetSession> {
  const s = await currentSession(db, req);
  if (!s) throw new HttpError(401, 'Conecta tu cuenta de Battle.net (o vuelve a conectarla: la sesión caduca a las 24 h).', { bnet: true });
  return s;
}

/** Desconecta: borra la sesión (y, si se pide, todos los datos de la cuenta en esta aplicación). */
export async function disconnect(db: Db, req: Request, deleteData: boolean): Promise<Response> {
  const s = await currentSession(db, req);
  if (s) {
    if (deleteData) await db.query(`delete from bnet_account where id = $1`, [s.accountId]); // borra en cascada
    else await db.query(`delete from bnet_session where account_id = $1`, [s.accountId]);
  }
  const res = new Response(JSON.stringify({ ok: true, deleted: Boolean(s && deleteData) }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  res.headers.append('set-cookie', cookie(req, BNET_COOKIE, '', 0));
  return res;
}

// ---------------------------------------------------------------------------
// API de perfil
// ---------------------------------------------------------------------------

async function profileGet(s: BnetSession, path: string, namespace: string): Promise<{ status: number; json: any }> {
  if (!s.token) return { status: 401, json: null };
  const locale = (LOCALE_PREF[s.region] ?? ['en_US'])[0];
  const url = `https://${s.region}.api.blizzard.com${path}?namespace=${encodeURIComponent(namespace)}&locale=${locale}`;
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${s.token}` } });
  return { status: res.status, json: res.ok ? await res.json() : null };
}

const nameOf = (v: unknown, region: string) => pickName(v, LOCALE_PREF[region] ?? ['en_US']).name;

/** Lista de personajes de /profile/user/wow (formato documentado de la Account Profile API). */
/**
 * Ruta del perfil del personaje a partir del enlace que da Blizzard («character.href»). En Forever no hay reino:
 * /profile/wow/character/mati-fernandez. Solo se acepta un enlace de *.api.blizzard.com con esa forma.
 */
export function profilePathOf(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  try {
    const u = new URL(href);
    if (u.protocol !== 'https:' || !/^[a-z]{2}\.api\.blizzard\.com$/.test(u.hostname)) return null;
    return /^\/profile\/wow\/character\/[^/?#\s]+(\/[^/?#\s]+)?$/.test(u.pathname) ? u.pathname : null;
  } catch {
    return null;
  }
}

export function parseAccountProfile(j: any, region: string) {
  const out: Array<{ wowAccountId: number | null; characterId: number; name: string; surname: string | null; profilePath: string | null; realmId: number | null; realmSlug: string | null; realmName: string | null; level: number | null; className: string | null; raceName: string | null; faction: string | null; raw: unknown }> = [];
  for (const acc of Array.isArray(j?.wow_accounts) ? j.wow_accounts : []) {
    for (const c of Array.isArray(acc?.characters) ? acc.characters : []) {
      if (!Number.isFinite(Number(c?.id)) || !c?.name) continue;
      out.push({
        wowAccountId: Number.isFinite(Number(acc.id)) ? Number(acc.id) : null,
        characterId: Number(c.id), name: String(c.name),
        surname: typeof c.surname === 'string' && c.surname ? c.surname : null, profilePath: profilePathOf(c.character?.href),
        realmId: Number.isFinite(Number(c.realm?.id)) ? Number(c.realm.id) : null,
        realmSlug: c.realm?.slug ?? null, realmName: nameOf(c.realm?.name, region),
        level: Number.isInteger(c.level) ? c.level : null,
        className: nameOf(c.playable_class?.name, region), raceName: nameOf(c.playable_race?.name, region),
        faction: c.faction?.type ?? null, raw: c,
      });
    }
  }
  return out;
}

export async function syncCharacters(db: Db, s: BnetSession) {
  const tried: Array<{ namespace: string; status: number; characters: number }> = [];
  for (const ns of profileNamespaces(s.region)) {
    const r = await profileGet(s, '/profile/user/wow', ns);
    const chars = r.json ? parseAccountProfile(r.json, s.region) : [];
    tried.push({ namespace: ns, status: r.status, characters: chars.length });
    for (const c of chars) {
      await db.query(
        `insert into bnet_character (account_id, namespace, wow_account_id, character_id, realm_id, realm_slug, realm_name, name, level, class_name, race_name, faction, raw, surname, profile_path, synced_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text::jsonb,$14,$15,now())
         on conflict (account_id, namespace, character_id, realm_id) do update set wow_account_id=excluded.wow_account_id, realm_slug=excluded.realm_slug,
           surname=excluded.surname, profile_path=excluded.profile_path,
           realm_name=excluded.realm_name, name=excluded.name, level=excluded.level, class_name=excluded.class_name, race_name=excluded.race_name,
           faction=excluded.faction, raw=excluded.raw, synced_at=now()`,
        [s.accountId, ns, c.wowAccountId, c.characterId, c.realmId, c.realmSlug, c.realmName, c.name, c.level, c.className, c.raceName, c.faction, JSON.stringify(c.raw), c.surname, c.profilePath],
      );
    }
  }
  return { tried };
}

/**
 * Profesiones de /profile/wow/character/{reino}/{nombre}/professions. Formato de retail (primaries/secondaries con
 * tiers) y, por si Classic devolviera algo más simple, también profesiones con skill_points directos.
 */
export function parseProfessions(j: any, region: string) {
  const out: Array<{ professionId: number; professionName: string | null; tierId: number | null; tierName: string | null; skillPoints: number | null; maxSkillPoints: number | null; knownRecipes: number[] }> = [];
  const num = (v: unknown) => (Number.isInteger(v) ? (v as number) : null);
  for (const group of ['primaries', 'secondaries']) {
    for (const p of Array.isArray(j?.[group]) ? j[group] : []) {
      const pid = Number(p?.profession?.id);
      if (!Number.isInteger(pid)) continue;
      const pname = nameOf(p.profession?.name, region);
      const tiers = Array.isArray(p.tiers) ? p.tiers : [p];
      for (const t of tiers) {
        out.push({
          professionId: pid, professionName: pname,
          tierId: Number.isInteger(t?.tier?.id) ? t.tier.id : null, tierName: nameOf(t?.tier?.name, region),
          skillPoints: num(t?.skill_points), maxSkillPoints: num(t?.max_skill_points),
          knownRecipes: (Array.isArray(t?.known_recipes) ? t.known_recipes : []).map((r: any) => Number(r?.id)).filter(Number.isInteger),
        });
      }
    }
  }
  return out;
}

export async function ownedCharacter(db: Db, s: BnetSession, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Identificador de personaje inválido.');
  const rows = await db.query<any>(`select * from bnet_character where id = $1 and account_id = $2`, [id, s.accountId]);
  // Mismo 404 exista o no en otra cuenta: no se revela.
  if (!rows.length) throw new HttpError(404, 'Personaje no encontrado.');
  return rows[0];
}

export async function syncProfessions(db: Db, s: BnetSession, character: any) {
  // Forever: el enlace que dio Blizzard (nombre-apellido, sin reino). Classic/retail: reino + nombre.
  const base = character.profile_path
    ?? (character.realm_slug ? `/profile/wow/character/${encodeURIComponent(character.realm_slug)}/${encodeURIComponent(String(character.name).toLowerCase())}` : null);
  if (!base) {
    await recordSync(db, character.id, 'error', null, 'Blizzard no dio el enlace del personaje. Vuelve a pulsar «Actualizar personajes».');
    return { status: 'error' as const };
  }
  const path = `${base}/professions`;
  const r = await profileGet(s, path, character.namespace);
  if (!r.json) {
    const status = r.status === 404 ? 'no_disponible' : 'error';
    await recordSync(db, character.id, status, r.status, status === 'no_disponible'
      ? 'Blizzard no publica las profesiones de este personaje en esta versión (respuesta 404). Indícalas a mano.'
      : `Blizzard respondió ${r.status}.`);
    return { status, httpStatus: r.status };
  }
  const profs = parseProfessions(r.json, s.region);
  await db.tx(async (t) => {
    await t.query(`delete from profession_snapshot where character_id = $1`, [character.id]);
    for (const p of profs) {
      await t.query(
        `insert into profession_snapshot (character_id, profession_id, profession_name, tier_id, tier_name, skill_points, max_skill_points, known_recipes)
         values ($1,$2,$3,$4,$5,$6,$7,$8::text::int[]) on conflict do nothing`,
        [character.id, p.professionId, p.professionName, p.tierId, p.tierName, p.skillPoints, p.maxSkillPoints, `{${p.knownRecipes.join(",")}}`],
      );
    }
  });
  await recordSync(db, character.id, 'ok', r.status, profs.length ? null : 'La respuesta no trae profesiones.');
  return { status: 'ok' as const, professions: profs.length };
}

async function recordSync(db: Db, characterId: string, status: string, http: number | null, detail: string | null) {
  await db.query(
    `insert into character_sync (character_id, status, http_status, detail, checked_at) values ($1,$2,$3,$4,now())
     on conflict (character_id) do update set status=excluded.status, http_status=excluded.http_status, detail=excluded.detail, checked_at=now()`,
    [characterId, status, http, detail],
  );
}

/**
 * Profesiones del personaje combinando el dato de Blizzard y el manual. Prioridad: el manual si el usuario lo prefiere
 * o si Blizzard no da el nivel; nunca se inventa un nivel (null = desconocido).
 */
export async function characterProfessions(db: Db, characterId: string) {
  const snaps = await db.query<any>(`select * from profession_snapshot where character_id = $1 order by profession_id, tier_id nulls first`, [characterId]);
  const manual = await db.query<any>(`select * from profession_manual where character_id = $1`, [characterId]);
  const ids = [...new Set([...snaps.map((s) => Number(s.profession_id)), ...manual.map((m) => Number(m.profession_id))])];
  return ids.map((pid) => {
    const tiers = snaps.filter((s) => Number(s.profession_id) === pid);
    // Forever es Classic: un solo rango; si hubiera varios, el de mayor máximo.
    const b = tiers.sort((x, y) => (Number(y.max_skill_points) || 0) - (Number(x.max_skill_points) || 0))[0] ?? null;
    const m = manual.find((x) => Number(x.profession_id) === pid) ?? null;
    const blizzard = b ? { skillPoints: b.skill_points, maxSkillPoints: b.max_skill_points, tierName: b.tier_name, knownRecipes: (b.known_recipes ?? []).map(Number), fetchedAt: new Date(b.fetched_at).toISOString() } : null;
    const man = m ? { skillPoints: m.skill_points, maxSkillPoints: m.max_skill_points, note: m.note, preferred: m.preferred, updatedAt: new Date(m.updated_at).toISOString() } : null;
    const useManual = man && (man.preferred === 'manual' || blizzard?.skillPoints === null || blizzard?.skillPoints === undefined);
    const skill = useManual ? man!.skillPoints : blizzard?.skillPoints ?? null;
    const max = useManual ? (man!.maxSkillPoints ?? blizzard?.maxSkillPoints ?? null) : (blizzard?.maxSkillPoints ?? man?.maxSkillPoints ?? null);
    return {
      professionId: pid, name: b?.profession_name ?? null, blizzard, manual: man,
      effective: { skillPoints: skill, maxSkillPoints: max, source: skill === null ? null : useManual ? 'manual' : 'blizzard' },
    };
  });
}
