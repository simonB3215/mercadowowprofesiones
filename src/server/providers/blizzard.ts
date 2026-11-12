/**
 * Cliente de la Game Data API de Blizzard.
 * Verificado en la documentación oficial (2026-11-11):
 *  - Token: POST https://oauth.battle.net/token, grant_type=client_credentials, Basic auth client_id:client_secret.
 *  - Uso: cabecera "Authorization: Bearer <token>"; expires_in ≈ 86399 s.
 *  - Host: {region}.api.blizzard.com (us|eu|kr|tw); namespace obligatorio (static-{region} para profesiones/recetas/objetos).
 *  - Rutas: /data/wow/profession/index, /data/wow/profession/{id}, /data/wow/profession/{id}/skill-tier/{tierId},
 *           /data/wow/recipe/{id}, /data/wow/item/{id}, /data/wow/realm/index (dynamic-{region}).
 * Los campos de las respuestas NO se pudieron inspeccionar sin credenciales: los parsers de catalog/sync.ts
 * son tolerantes y registran como incompleto todo campo no reconocido. Ejecuta `npm run probe:blizzard`
 * para guardar muestras reales en docs/muestras/.
 */

export interface BlizzardClient {
  get(path: string, namespace: string): Promise<any>;
  region: string;
}

export class BlizzardError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function hasBlizzardCredentials(): boolean {
  return Boolean(process.env.BLIZZARD_CLIENT_ID && process.env.BLIZZARD_CLIENT_SECRET);
}

export function createBlizzardClient(region: string, fetchImpl: typeof fetch = fetch): BlizzardClient {
  const id = process.env.BLIZZARD_CLIENT_ID;
  const secret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!id || !secret) throw new BlizzardError(401, 'Faltan BLIZZARD_CLIENT_ID y BLIZZARD_CLIENT_SECRET en el entorno del servidor.');
  if (!['us', 'eu', 'kr', 'tw'].includes(region)) throw new BlizzardError(400, `Región no soportada: ${region}`);
  let token: { value: string; exp: number } | null = null;

  async function getToken(): Promise<string> {
    if (token && token.exp > Date.now() + 60_000) return token.value;
    const res = await fetchImpl('https://oauth.battle.net/token', {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new BlizzardError(res.status, `No se pudo obtener el token de Blizzard (HTTP ${res.status}). Revisa las credenciales.`);
    const j: any = await res.json();
    if (!j.access_token) throw new BlizzardError(500, 'Respuesta de token sin access_token.');
    token = { value: j.access_token, exp: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  return {
    region,
    async get(path: string, namespace: string) {
      const url = `https://${region}.api.blizzard.com${path}${path.includes('?') ? '&' : '?'}namespace=${encodeURIComponent(namespace)}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetchImpl(url, { headers: { authorization: `Bearer ${await getToken()}` } });
        if (res.ok) return res.json();
        if (res.status === 401 && attempt === 0) {
          token = null;
          continue;
        }
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        throw new BlizzardError(res.status, `Blizzard ${res.status} en ${path}`);
      }
      throw new BlizzardError(429, `Demasiados reintentos en ${path}`);
    },
  };
}

/** Los nombres pueden llegar como texto (con locale) o como objeto {en_US, es_ES, ...} (sin locale). */
export function pickName(v: unknown, prefer: string[]): { name: string | null; en: string | null } {
  if (v === null || v === undefined) return { name: null, en: null };
  if (typeof v === 'string') return { name: v, en: null };
  if (typeof v === 'object') {
    const o = v as Record<string, string>;
    const en = o.en_US ?? o.en_GB ?? null;
    for (const p of prefer) if (o[p]) return { name: o[p], en };
    return { name: en ?? Object.values(o)[0] ?? null, en };
  }
  return { name: String(v), en: null };
}

export const LOCALE_PREF: Record<string, string[]> = {
  us: ['es_MX', 'es_ES', 'en_US'],
  eu: ['es_ES', 'es_MX', 'en_GB', 'en_US'],
  kr: ['es_ES', 'es_MX', 'en_US'],
  tw: ['es_ES', 'es_MX', 'en_US'],
};
