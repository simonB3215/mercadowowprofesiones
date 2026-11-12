/**
 * Modo de demostración: catálogo y precios FICTICIOS en la versión "demo".
 * Están separados por game_version='demo' y provider='demo'; nunca se mezclan
 * con datos reales. Cubre los casos de prueba exigidos (varias unidades, material
 * sin precio, calidad sin correspondencia, resultado no vendible, ciclos...).
 */
import type { Db } from './db.js';
import { ingest } from './market.js';

const V = 'demo';
export const DEMO_CTX = { version: 'demo', region: 'demo', realm: 'reino-demo' };

const items: Array<[number, string, string | null]> = [
  [900001, 'Mineral de prueba', null],
  [900002, 'Barra de prueba', null],
  [900003, 'Espada de prueba', 'ON_EQUIP'],
  [900004, 'Hierba de prueba', null],
  [900005, 'Poción de prueba', null],
  [900006, 'Vial de prueba', null],
  [900007, 'Esencia sin precio', null],
  [900008, 'Elixir sin precio', null],
  [900009, 'Anillo ligado de prueba', 'ON_ACQUIRE'],
  [900010, 'Reactivo de calidad', null],
  [900011, 'Reactivo de calidad', null], // mismo nombre, otra calidad
  [900012, 'Polvo de ciclo', null],
  [900013, 'Guiso de prueba', null],
  [900014, 'Pescado de prueba', null],
  [900015, 'Piel de prueba', null],
  [900016, 'Tela de prueba', null],
  [900017, 'Bolsa de prueba', 'ON_EQUIP'],
];

// [id, profesión, rango, nombre, resultado, qtyMin, qtyMax, reagents[[item, qty]]]
const recipes: Array<[number, number, number, string, number | null, number | null, number | null, Array<[number, number]>]> = [
  [800001, 2, 21, 'Fundir barra de prueba', 900002, 1, 1, [[900001, 2]]],
  [800002, 2, 21, 'Forjar espada de prueba', 900003, 1, 1, [[900002, 8], [900016, 2]]],
  [800003, 1, 11, 'Preparar pociones de prueba (x5)', 900005, 5, 5, [[900004, 6], [900006, 5]]],
  [800004, 1, 11, 'Elixir con esencia sin precio', 900008, 1, 1, [[900004, 2], [900007, 1]]],
  [800005, 3, 31, 'Anillo ligado de prueba', 900009, 1, 1, [[900002, 2]]],
  [800006, 1, 12, 'Reactivo con calidades (sistema de calidades)', 900010, 1, 1, [[900004, 3]]],
  [800007, 2, 21, 'Deshacer barra en polvo (ciclo)', 900012, 2, 2, [[900002, 1]]],
  [800008, 2, 21, 'Barra desde polvo (ciclo)', 900002, 1, 1, [[900012, 3]]],
  [800009, 4, 41, 'Guiso de prueba (rendimiento variable)', 900013, 1, 3, [[900014, 2]]],
  [800010, 3, 31, 'Encantamiento aplicado (servicio)', null, null, null, [[900007, 1]]],
  [800011, 5, 51, 'Bolsa de prueba', 900017, 1, 1, [[900016, 6], [900015, 1]]],
];

const professions: Array<[number, string, string, string]> = [
  [1, 'Alquimia (demo)', 'Alchemy', 'fabricacion'],
  [2, 'Herrería (demo)', 'Blacksmithing', 'fabricacion'],
  [3, 'Encantamiento (demo)', 'Enchanting', 'fabricacion'],
  [4, 'Cocina (demo)', 'Cooking', 'secundaria'],
  [5, 'Sastrería (demo)', 'Tailoring', 'fabricacion'],
  [6, 'Minería (demo)', 'Mining', 'recoleccion'],
];

const tiers: Array<[number, number, string, string]> = [
  [11, 1, 'Alquimia demo clásica', 'Clásico'],
  [12, 1, 'Alquimia demo con calidades', 'The War Within'],
  [21, 2, 'Herrería demo clásica', 'Clásico'],
  [31, 3, 'Encantamiento demo', 'Clásico'],
  [41, 4, 'Cocina demo', 'Clásico'],
  [51, 5, 'Sastrería demo', 'Clásico'],
];

// itemId, marketValue, minBuyout (cobre). Commodities: materiales; reino: equipo.
const commodity: Array<[number, number, number]> = [
  [900001, 15000, 14000], [900002, 50000, 48000], [900004, 8000, 7500], [900005, 60000, 58000],
  [900006, 2000, 2000], [900008, 400000, 390000], [900010, 30000, 29000], [900011, 90000, 88000],
  [900012, 9000, 8000], [900013, 25000, 24000], [900014, 4000, 3900], [900015, 30000, 30000], [900016, 12000, 11000],
];
const realm: Array<[number, number, number]> = [[900003, 1500000, 1450000], [900017, 140000, 135000]];
const regionStats: Array<[number, number, string, string]> = [
  [900003, 1400000, '0.12', '3.5'], [900005, 55000, '0.45', '850'], [900013, 22000, '0.3', '120'],
  [900017, 130000, '0.02', '0.4'], [900010, 29000, '0.5', '900'], [900011, 85000, '0.4', '300'], [900002, 47000, '0.6', '2000'],
];

export async function seedDemo(db: Db) {
  await db.tx(async (t) => {
    for (const tbl of ['recipe_reagent', 'recipe', 'skill_tier', 'profession', 'item', 'realm']) {
      await t.query(`delete from ${tbl} where game_version=$1`, [V]);
    }
    for (const [id, name, en, kind] of professions) {
      await t.query(`insert into profession (game_version,id,name,name_en,type,kind) values ($1,$2,$3,$4,'DEMO',$5)`, [V, id, name, en, kind]);
    }
    for (const [id, pid, name, exp] of tiers) {
      await t.query(`insert into skill_tier (game_version,id,profession_id,name,name_en,expansion) values ($1,$2,$3,$4,$4,$5)`, [V, id, pid, name, exp]);
    }
    for (const [id, name, binding] of items) {
      await t.query(`insert into item (game_version,id,name,name_en,quality,binding) values ($1,$2,$3,$3,'COMMON',$4)`, [V, id, name, binding]);
    }
    for (const [id, pid, tid, name, out, qmin, qmax, rg] of recipes) {
      await t.query(
        `insert into recipe (game_version,id,profession_id,skill_tier_id,category,name,crafted_item_id,qty_min,qty_max,raw)
         values ($1,$2,$3,$4,'Demo',$5,$6,$7,$8,$9)`,
        [V, id, pid, tid, name, out, qmin, qmax, JSON.stringify({ demo: true })],
      );
      for (let i = 0; i < rg.length; i++) {
        await t.query(`insert into recipe_reagent (game_version,recipe_id,slot,item_id,quantity) values ($1,$2,$3,$4,$5)`, [V, id, i, rg[i][0], rg[i][1]]);
      }
    }
    await t.query(`insert into realm (game_version,region,slug,name,source) values ($1,'demo','reino-demo','Reino de demostración','demo')`, [V]);
  });
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const nameOf = (id: number) => items.find((x) => x[0] === id)![1];
  const local = (rows: Array<[number, number, number]>) =>
    'itemId,name,marketValue,minBuyout,recent,historical,updatedAt\n' +
    rows.map(([id, mv, mb]) => `${id},${nameOf(id)},${mv},${mb},${mb},${mv},${now}`).join('\n') + '\n';
  const region =
    'itemId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt\n' +
    regionStats.map(([id, mv, sr, spd]) => `${id},${nameOf(id)},${mv},${mv},${mv},${sr},${spd},${now}`).join('\n') + '\n';
  const r1 = await ingest(db, DEMO_CTX, 'commodities', { text: local(commodity), provider: 'demo' });
  const r2 = await ingest(db, DEMO_CTX, 'realm_items', { text: local(realm), provider: 'demo' });
  const r3 = await ingest(db, DEMO_CTX, 'region_items', { text: region, provider: 'demo' });
  return { ok: true, recipes: recipes.length, items: items.length, ingest: [r1.status, r2.status, r3.status], warning: 'Datos ficticios: solo para demostración.' };
}
