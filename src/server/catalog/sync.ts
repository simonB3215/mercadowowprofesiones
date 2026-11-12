/**
 * Sincronización del catálogo de profesiones, recetas y objetos desde Blizzard.
 * Pensada para ejecutarse como script (npm run sync:catalog): son miles de peticiones
 * y no cabe en el límite de tiempo de una función de Vercel. Es reanudable.
 */
import type { Db } from '../db.js';
import { pickName, LOCALE_PREF, type BlizzardClient } from '../providers/blizzard.js';
import { PROFESSION_ES, expansionOf, professionKind, isInternalProfession } from './rules.js';

export interface SyncOptions {
  version: string;
  /** Namespace estático de Blizzard (p. ej. static-forever-us). */
  namespace: string;
  refresh?: boolean;
  concurrency?: number;
  onlyProfessions?: number[];
  log?: (msg: string) => void;
  limitRecipes?: number;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

const num = (v: any): number | null => (Number.isInteger(Number(v)) && v !== null && v !== undefined && v !== '' ? Number(v) : null);

/** Interpreta una receta. Devuelve campos normalizados y la lista de campos no reconocidos. */
export function parseRecipe(raw: any) {
  const problems: string[] = [];
  const crafted = num(raw?.crafted_item?.id);
  const alliance = num(raw?.alliance_crafted_item?.id);
  const horde = num(raw?.horde_crafted_item?.id);
  let qtyMin: number | null = null;
  let qtyMax: number | null = null;
  const cq = raw?.crafted_quantity;
  if (cq && typeof cq === 'object') {
    if (num(cq.value) !== null) qtyMin = qtyMax = num(cq.value);
    else if (num(cq.minimum) !== null) {
      qtyMin = num(cq.minimum);
      qtyMax = num(cq.maximum) ?? qtyMin;
    }
  }
  if ((crafted || alliance || horde) && qtyMin === null) problems.push('Sin cantidad producida reconocible (crafted_quantity).');
  const reagents: Array<{ slot: number; itemId: number; quantity: number | null }> = [];
  if (Array.isArray(raw?.reagents)) {
    raw.reagents.forEach((r: any, i: number) => {
      const itemId = num(r?.reagent?.id);
      if (itemId === null) problems.push(`Ingrediente ${i + 1} sin identificador.`);
      else reagents.push({ slot: i, itemId, quantity: num(r?.quantity) });
    });
  } else if (raw && !('reagents' in raw)) {
    problems.push('La receta no incluye lista de ingredientes (reagents).');
  }
  const modified = Array.isArray(raw?.modified_crafting_slots) ? raw.modified_crafting_slots.length > 0 : raw?.modified_crafting_slots ? true : false;
  return { crafted, alliance, horde, qtyMin, qtyMax, reagents, modified, rank: num(raw?.rank), problems };
}

export async function syncCatalog(db: Db, client: BlizzardClient, o: SyncOptions) {
  const log = o.log ?? (() => {});
  const ns = o.namespace;
  const pref = LOCALE_PREF[client.region] ?? ['es_ES', 'en_US'];
  const conc = o.concurrency ?? 8;
  const [run] = await db.query<{ id: number }>(
    `insert into catalog_run (game_version, region, status) values ($1,$2,'running') returning id`, [o.version, client.region]);
  const stats = { professions: 0, tiers: 0, recipes: 0, recipeErrors: 0, items: 0, itemErrors: 0 };
  try {
    const index = await client.get('/data/wow/profession/index', ns);
    const profs: any[] = Array.isArray(index?.professions) ? index.professions : [];
    if (!profs.length) throw new Error('El índice de profesiones no contiene "professions". Ejecuta npm run probe:blizzard y revisa docs/muestras.');
    const recipeRefs: Array<{ id: number; professionId: number; tierId: number; category: string | null }> = [];

    for (const p of profs) {
      const pid = num(p?.id);
      if (pid === null || (o.onlyProfessions && !o.onlyProfessions.includes(pid))) continue;
      const detail = await client.get(`/data/wow/profession/${pid}`, ns);
      const n = pickName(detail?.name ?? p?.name, pref);
      const en = n.en ?? (typeof p?.name === 'string' ? p.name : null);
      if (isInternalProfession(en)) { log(`Omitida profesión interna: ${en}`); continue; }
      const kind = (en && professionKind(en, o.version)) || 'desconocido';
      const display = n.name ?? (en ? PROFESSION_ES[en] ?? en : `Profesión ${pid}`);
      await db.query(
        `insert into profession (game_version,id,name,name_en,type,kind,raw,fetched_at) values ($1,$2,$3,$4,$5,$6,$7,now())
         on conflict (game_version,id) do update set name=excluded.name,name_en=excluded.name_en,type=excluded.type,kind=excluded.kind,raw=excluded.raw,fetched_at=now()`,
        [o.version, pid, display, en, detail?.type?.type ?? null, kind, detail],
      );
      stats.professions++;
      const tiers: any[] = Array.isArray(detail?.skill_tiers) ? detail.skill_tiers : [];
      for (const t of tiers) {
        const tid = num(t?.id);
        if (tid === null) continue;
        const td = await client.get(`/data/wow/profession/${pid}/skill-tier/${tid}`, ns);
        const tn = pickName(td?.name ?? t?.name, pref);
        const tEn = tn.en ?? (typeof t?.name === 'string' ? t.name : null);
        const exp = expansionOf(tEn, o.version);
        await db.query(
          `insert into skill_tier (game_version,id,profession_id,name,name_en,expansion,min_skill,max_skill,raw,fetched_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
           on conflict (game_version,id) do update set profession_id=excluded.profession_id,name=excluded.name,name_en=excluded.name_en,
             expansion=excluded.expansion,min_skill=excluded.min_skill,max_skill=excluded.max_skill,raw=excluded.raw,fetched_at=now()`,
          [o.version, tid, pid, tn.name ?? `Rango ${tid}`, tEn, exp.name, num(td?.minimum_skill_level), num(td?.maximum_skill_level), td],
        );
        stats.tiers++;
        const cats: any[] = Array.isArray(td?.categories) ? td.categories : [];
        for (const c of cats) {
          const cname = pickName(c?.name, pref).name;
          for (const r of Array.isArray(c?.recipes) ? c.recipes : []) {
            const rid = num(r?.id);
            if (rid !== null) recipeRefs.push({ id: rid, professionId: pid, tierId: tid, category: cname });
          }
        }
      }
      log(`Profesión ${display}: ${tiers.length} rangos`);
    }

    const existing = new Set(
      o.refresh ? [] : (await db.query<{ id: number }>(`select id from recipe where game_version=$1 and fetch_error is null and raw is not null`, [o.version])).map((r) => Number(r.id)),
    );
    let todo = recipeRefs.filter((r) => !existing.has(r.id));
    if (o.limitRecipes) todo = todo.slice(0, o.limitRecipes);
    // Asegura la clasificación aunque la receta ya estuviera descargada.
    for (const r of recipeRefs.filter((x) => existing.has(x.id))) {
      await db.query(`update recipe set profession_id=$3, skill_tier_id=$4, category=$5 where game_version=$1 and id=$2`,
        [o.version, r.id, r.professionId, r.tierId, r.category]);
    }
    log(`Recetas: ${recipeRefs.length} en total, ${todo.length} por descargar`);
    let done = 0;
    await pool(todo, conc, async (ref) => {
      try {
        const raw = await client.get(`/data/wow/recipe/${ref.id}`, ns);
        const p = parseRecipe(raw);
        const name = pickName(raw?.name, pref).name;
        await db.tx(async (t) => {
          await t.query(
            `insert into recipe (game_version,id,profession_id,skill_tier_id,category,name,crafted_item_id,alliance_item_id,horde_item_id,
               qty_min,qty_max,rank,has_modified_slots,raw,fetch_error,fetched_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
             on conflict (game_version,id) do update set profession_id=excluded.profession_id,skill_tier_id=excluded.skill_tier_id,
               category=excluded.category,name=excluded.name,crafted_item_id=excluded.crafted_item_id,alliance_item_id=excluded.alliance_item_id,
               horde_item_id=excluded.horde_item_id,qty_min=excluded.qty_min,qty_max=excluded.qty_max,rank=excluded.rank,
               has_modified_slots=excluded.has_modified_slots,raw=excluded.raw,fetch_error=excluded.fetch_error,fetched_at=now()`,
            [o.version, ref.id, ref.professionId, ref.tierId, ref.category, name, p.crafted, p.alliance, p.horde, p.qtyMin, p.qtyMax, p.rank,
              p.modified, raw, p.problems.length ? p.problems.join(' ') : null],
          );
          await t.query(`delete from recipe_reagent where game_version=$1 and recipe_id=$2`, [o.version, ref.id]);
          for (const g of p.reagents) {
            await t.query(`insert into recipe_reagent (game_version,recipe_id,slot,item_id,quantity) values ($1,$2,$3,$4,$5)`,
              [o.version, ref.id, g.slot, g.itemId, g.quantity]);
          }
        });
        stats.recipes++;
      } catch (e) {
        stats.recipeErrors++;
        await db.query(
          `insert into recipe (game_version,id,profession_id,skill_tier_id,category,fetch_error) values ($1,$2,$3,$4,$5,$6)
           on conflict (game_version,id) do update set fetch_error=excluded.fetch_error`,
          [o.version, ref.id, ref.professionId, ref.tierId, ref.category, `Descarga fallida: ${(e as Error).message}`],
        );
      }
      if (++done % 200 === 0) log(`  recetas ${done}/${todo.length}`);
    });

    const itemIds = (await db.query<{ id: number }>(
      `select distinct id from (
         select crafted_item_id as id from recipe where game_version=$1 union
         select alliance_item_id from recipe where game_version=$1 union
         select horde_item_id from recipe where game_version=$1 union
         select item_id from recipe_reagent where game_version=$1) x
       where id is not null ${o.refresh ? '' : 'and id not in (select id from item where game_version=$1 and fetch_error is null)'}`,
      [o.version],
    )).map((r) => Number(r.id));
    log(`Objetos por descargar: ${itemIds.length}`);
    done = 0;
    await pool(itemIds, conc, async (id) => {
      try {
        const raw = await client.get(`/data/wow/item/${id}`, ns);
        const n = pickName(raw?.name, pref);
        const binding = raw?.preview_item?.binding?.type ?? raw?.binding?.type ?? null;
        await db.query(
          `insert into item (game_version,id,name,name_en,quality,binding,item_class,item_subclass,is_stackable,raw,fetch_error,fetched_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,now())
           on conflict (game_version,id) do update set name=excluded.name,name_en=excluded.name_en,quality=excluded.quality,binding=excluded.binding,
             item_class=excluded.item_class,item_subclass=excluded.item_subclass,is_stackable=excluded.is_stackable,raw=excluded.raw,fetch_error=null,fetched_at=now()`,
          [o.version, id, n.name, n.en, raw?.quality?.type ?? null, binding, pickName(raw?.item_class?.name, pref).name,
            pickName(raw?.item_subclass?.name, pref).name, typeof raw?.is_stackable === 'boolean' ? raw.is_stackable : null, raw],
        );
        stats.items++;
      } catch (e) {
        stats.itemErrors++;
        await db.query(
          `insert into item (game_version,id,fetch_error) values ($1,$2,$3) on conflict (game_version,id) do update set fetch_error=excluded.fetch_error`,
          [o.version, id, (e as Error).message],
        );
      }
      if (++done % 500 === 0) log(`  objetos ${done}/${itemIds.length}`);
    });

    const status = stats.recipeErrors || stats.itemErrors ? 'partial' : 'ok';
    await db.query(`update catalog_run set status=$2, finished_at=now(), stats=$3 where id=$1`, [run.id, status, stats]);
    return { status, stats };
  } catch (e) {
    await db.query(`update catalog_run set status='failed', finished_at=now(), stats=$2, error=$3 where id=$1`, [run.id, stats, (e as Error).message]);
    throw e;
  }
}

export async function syncRealms(db: Db, client: BlizzardClient, version: string) {
  const idx = await client.get('/data/wow/realm/index', `dynamic-${client.region}`);
  const realms: any[] = Array.isArray(idx?.realms) ? idx.realms : [];
  if (!realms.length) throw new Error('El índice de reinos no contiene "realms".');
  const pref = LOCALE_PREF[client.region] ?? ['en_US'];
  for (const r of realms) {
    if (!r?.slug) continue;
    await db.query(
      `insert into realm (game_version,region,slug,name,source) values ($1,$2,$3,$4,'blizzard')
       on conflict (game_version,region,slug) do update set name=excluded.name, source='blizzard'`,
      [version, client.region, String(r.slug), pickName(r.name, pref).name ?? r.slug],
    );
  }
  return realms.length;
}
