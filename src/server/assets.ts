/**
 * Capa central de recursos visuales: iconos de WoW Forever por identificador real.
 *
 * Fuentes verificadas el 12-11-2026:
 *  - Wowhead, entorno WoW Forever (dataEnv=16, wowhead.com/forever):
 *      https://nether.wowhead.com/tooltip/{item|spell}/{id}?dataEnv=16 → { name, icon, ... }
 *      El icono se sirve en https://wow.zamimg.com/images/wow/icons/{small|medium|large}/{icon}.jpg
 *      (18, 36 y 56 px). Es el mismo CDN que usa el widget oficial de tooltips de Wowhead.
 *  - Blizzard Game Data API, namespace static-forever-{región}:
 *      /data/wow/media/item/{id} y /data/wow/media/profession/{id} → assets[key=icon].value (56 px).
 * Nunca se asigna un icono por similitud de nombre: siempre por id. Para las profesiones, el id de
 * Blizzard se traduce al hechizo de la profesión en Wowhead y se comprueba que el nombre coincida.
 * Solo se usan iconos del juego; no se reutilizan capturas subidas por usuarios.
 */
import type { Db } from './db.js';
import type { BlizzardClient } from './providers/blizzard.js';

export const WOWHEAD_ENV_FOREVER = 16;
export type IconSize = 'small' | 'medium' | 'large';
export const ICON_PX: Record<IconSize, number> = { small: 18, medium: 36, large: 56 };

export function wowheadIconUrl(icon: string, size: IconSize = 'large'): string {
  if (!/^[a-z0-9_-]+$/i.test(icon)) throw new Error(`Nombre de icono inválido: ${icon}`);
  return `https://wow.zamimg.com/images/wow/icons/${size}/${icon.toLowerCase()}.jpg`;
}

/** Hechizo de cada profesión en Wowhead (se verifica el nombre al sincronizar). */
export const PROFESSION_SPELL: Record<string, number> = {
  Alchemy: 2259, Blacksmithing: 2018, Enchanting: 7411, Engineering: 4036, Leatherworking: 2108,
  Tailoring: 3908, Cooking: 2550, 'First Aid': 3273, Mining: 2575, Herbalism: 2366, Skinning: 8613, Fishing: 7620,
};

export interface AssetRow {
  kind: 'item' | 'profession';
  id: number;
  source: 'wowhead' | 'blizzard' | 'ninguno';
  icon_name: string | null;
  ref_id: number | null;
  url: string | null;
  fallback_url: string | null;
  page_url: string | null;
  error: string | null;
}

async function wowheadTooltip(type: 'item' | 'spell', id: number, fetchImpl: typeof fetch): Promise<{ name: string; icon: string } | null> {
  const res = await fetchImpl(`https://nether.wowhead.com/tooltip/${type}/${id}?dataEnv=${WOWHEAD_ENV_FOREVER}`, {
    headers: { 'user-agent': 'mercado-wow-profesiones/0.1' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wowhead ${res.status}`);
  const j: any = await res.json();
  return j?.icon && j?.name ? { name: String(j.name), icon: String(j.icon) } : null;
}

async function blizzardIcon(client: BlizzardClient | null, kind: 'item' | 'profession', id: number, ns: string): Promise<string | null> {
  if (!client) return null;
  try {
    const j = await client.get(`/data/wow/media/${kind}/${id}`, ns);
    const a = (j?.assets ?? []).find((x: any) => x.key === 'icon');
    return typeof a?.value === 'string' && a.value.startsWith('https://render.worldofwarcraft.com/') ? a.value : null;
  } catch {
    return null;
  }
}

export async function resolveItem(id: number, client: BlizzardClient | null, ns: string, fetchImpl: typeof fetch = fetch): Promise<AssetRow> {
  const base = { kind: 'item' as const, id, ref_id: id };
  const fallback = await blizzardIcon(client, 'item', id, ns);
  let t: { name: string; icon: string } | null;
  try {
    t = await wowheadTooltip('item', id, fetchImpl);
  } catch (e) {
    if (fallback) return { ...base, source: 'blizzard', icon_name: null, url: fallback, fallback_url: null, page_url: null, error: (e as Error).message };
    throw e; // error transitorio sin respaldo: no se guarda; se reintenta en la próxima sincronización
  }
  if (t) {
    return { ...base, source: 'wowhead', icon_name: t.icon, url: wowheadIconUrl(t.icon), fallback_url: fallback,
      page_url: `https://www.wowhead.com/forever/item=${id}`, error: null };
  }
  return fallback
    ? { ...base, source: 'blizzard', icon_name: null, url: fallback, fallback_url: null, page_url: null, error: 'Wowhead no tiene este objeto en WoW Forever' }
    : { ...base, source: 'ninguno', icon_name: null, url: null, fallback_url: null, page_url: null, error: 'Sin icono en Wowhead ni en Blizzard' };
}

export async function resolveProfession(id: number, nameEn: string | null, client: BlizzardClient | null, ns: string, fetchImpl: typeof fetch = fetch): Promise<AssetRow> {
  const fallback = await blizzardIcon(client, 'profession', id, ns);
  const spell = nameEn ? PROFESSION_SPELL[nameEn] : undefined;
  let error: string | null = spell ? null : 'Profesión sin hechizo conocido en Wowhead';
  if (spell) {
    const t = await wowheadTooltip('spell', spell, fetchImpl).catch(() => null);
    if (t && t.name.toLowerCase() === nameEn!.toLowerCase()) {
      return { kind: 'profession', id, source: 'wowhead', icon_name: t.icon, ref_id: spell, url: wowheadIconUrl(t.icon), fallback_url: fallback,
        page_url: `https://www.wowhead.com/forever/spell=${spell}`, error: null };
    }
    error = t ? `El hechizo ${spell} de Wowhead es «${t.name}», no «${nameEn}»` : `Wowhead no devolvió el hechizo ${spell}`;
  }
  return fallback
    ? { kind: 'profession', id, source: 'blizzard', icon_name: null, ref_id: id, url: fallback, fallback_url: null, page_url: null, error }
    : { kind: 'profession', id, source: 'ninguno', icon_name: null, ref_id: null, url: null, fallback_url: null, page_url: null, error };
}

export async function saveAsset(db: Db, version: string, a: AssetRow) {
  await db.query(
    `insert into visual_asset (game_version, kind, id, source, icon_name, ref_id, url, fallback_url, page_url, error, checked_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     on conflict (game_version, kind, id) do update set source=excluded.source, icon_name=excluded.icon_name, ref_id=excluded.ref_id,
       url=excluded.url, fallback_url=excluded.fallback_url, page_url=excluded.page_url, error=excluded.error, checked_at=now()`,
    [version, a.kind, a.id, a.source, a.icon_name, a.ref_id, a.url, a.fallback_url, a.page_url, a.error],
  );
}

export interface AssetOut {
  source: string;
  /** Icono en el tamaño pedido (Wowhead: 18/36/56 px; Blizzard solo publica 56 px). */
  src: string | null;
  fallback: string | null;
  page: string | null;
}

export async function loadAssets(db: Db, version: string, items: number[], professions: number[], size: IconSize) {
  const rows = await db.query<any>(
    `select kind, id, source, icon_name, url, fallback_url, page_url from visual_asset
     where game_version=$1 and ((kind='item' and id = any($2::int[])) or (kind='profession' and id = any($3::int[])))`,
    [version, items, professions],
  );
  const out: { items: Record<number, AssetOut>; professions: Record<number, AssetOut> } = { items: {}, professions: {} };
  for (const r of rows) {
    const src = r.source === 'wowhead' && r.icon_name ? wowheadIconUrl(r.icon_name, size) : r.url;
    const a: AssetOut = { source: r.source, src, fallback: r.fallback_url, page: r.page_url };
    (r.kind === 'item' ? out.items : out.professions)[Number(r.id)] = a;
  }
  return out;
}
