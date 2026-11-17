import { describe, it, expect, beforeAll } from 'vitest';

process.env.DATABASE_URL = 'pglite:memory';
const { getDb, migrate } = await import('../src/server/db.js');
const { handle } = await import('../src/server/router.js');
const { seedTestCatalog, TEST_CTX } = await import('./helpers/seed.js');
const { catalogCooldown } = await import('../src/server/cooldowns.js');
const { cooldownLabel, durationLabel, minTimeForRuns } = await import('../src/engine/cooldown.js');

// «Transmutar: arcanita» en Forever: Barra de torio (12359) + Cristal arcano (12363) → Barra de arcanita (12360); 47 h en Wowhead.
const ARCANITE = { recipeId: 9840, out: 12360, reagents: [[12359, 1], [12363, 1]] as Array<[number, number]> };

async function api(path: string, init?: RequestInit) {
  const res = await handle(new Request(`http://x${path}`, init));
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  const db = await getDb();
  await migrate(db);
  await seedTestCatalog(db);
  await db.query(`insert into profession (game_version,id,name,name_en,type,kind) values ('forever',171,'Alquimia','Alchemy','PRIMARY','fabricacion') on conflict do nothing`);
  for (const [id, name] of [[12359, 'Barra de torio'], [12363, 'Cristal arcano'], [12360, 'Barra de arcanita']] as const) {
    await db.query(`insert into item (game_version,id,name,name_en,quality,binding) values ('forever',$1,$2,$2,'COMMON',null) on conflict do nothing`, [id, name]);
  }
  await db.query(`insert into recipe (game_version,id,profession_id,name,crafted_item_id,qty_min,qty_max,raw) values ('forever',$1,171,'Transmutar: arcanita',$2,1,1,'{}'::jsonb)`, [ARCANITE.recipeId, ARCANITE.out]);
  for (const [i, [item, q]] of ARCANITE.reagents.entries()) {
    await db.query(`insert into recipe_reagent (game_version,recipe_id,slot,item_id,quantity) values ('forever',$1,$2,$3,$4)`, [ARCANITE.recipeId, i, item, q]);
  }
});

describe('Reutilización de recetas (PB-22)', () => {
  it('textos y tiempo mínimo', () => {
    expect(cooldownLabel(300)).toBe('5 min');
    expect(cooldownLabel(82800)).toBe('23 h');
    expect(cooldownLabel(169200)).toBe('47 h');
    expect(cooldownLabel(342000)).toBe('4 días');
    expect(minTimeForRuns(1, 3600)).toBe(0);
    expect(minTimeForRuns(3, 169200)).toBe(338400);
    expect(durationLabel(338400)).toBe('3 días y 22 h');
    expect(durationLabel(7200)).toBe('2 h');
  });

  it('enlaza una receta del catálogo con Wowhead por objeto y materiales; sin coincidencia es desconocida', () => {
    const rg = ARCANITE.reagents.map(([item_id, quantity]) => ({ item_id, quantity }));
    expect(catalogCooldown(ARCANITE.out, rg)).toBe(169200);
    expect(catalogCooldown(ARCANITE.out, [...rg].reverse())).toBe(169200);
    expect(catalogCooldown(ARCANITE.out, [{ item_id: 12359, quantity: 2 }, { item_id: 12363, quantity: 1 }])).toBeNull();
    expect(catalogCooldown(null, [])).toBeNull();
    // Paño de lino (Sastrería): existe en Wowhead y no tiene reutilización → 0, no null.
    expect(catalogCooldown(2996, [{ item_id: 2589, quantity: 2 }])).toBe(0);
  });

  it('el comparador y el detalle indican la reutilización sin cambiar la ganancia por fabricación', async () => {
    const qs = new URLSearchParams(TEST_CTX).toString();
    const list = await api(`/api/opportunities?${qs}&search=arcanita`);
    expect(list.status).toBe(200);
    expect(list.json.items[0].cooldown).toBe(169200);
    const other = await api(`/api/opportunities?${qs}&pageSize=200`);
    expect(other.json.items.filter((i: any) => i.recipeId !== ARCANITE.recipeId).every((i: any) => !i.cooldown)).toBe(true);
    const det = await api(`/api/recipes/${ARCANITE.recipeId}?${qs}`);
    expect(det.json.evaluation.cooldown).toBe(169200);
    expect(det.json.evaluation.notes.join(' ')).toMatch(/Reutilización de 47 h/);
  });

  it('el plan de fabricación avisa del tiempo mínimo para repetirla', async () => {
    const plan = (n: number) => api('/api/crafting-plan', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...TEST_CTX, entries: [{ recipeId: ARCANITE.recipeId, amount: n, mode: 'ejecuciones' }] }),
    });
    const tres = await plan(3);
    expect(tres.status).toBe(200);
    expect(tres.json.warnings.join(' ')).toMatch(/3 fabricaciones necesitan al menos 3 días y 22 h/);
    const una = await plan(1);
    expect(una.json.warnings.join(' ')).not.toMatch(/reutilización/);
  });
});

describe('oro al día según la espera (Transmutaciones)', () => {
  it('24 h ÷ espera, con un máximo de fabricaciones; espera desconocida → null', async () => {
    const { craftsPerDay, goldPerDay, MAX_CRAFTS_PER_DAY } = await import('../src/engine/cooldown.js');
    const { Q } = await import('../src/engine/rational.js');
    expect(craftsPerDay(169200)!.eq(Q.of(24, 47))).toBe(true); // 47 h
    expect(craftsPerDay(82800)!.eq(Q.of(24, 23))).toBe(true); // 23 h
    expect(craftsPerDay(600)!.eq(Q.of(MAX_CRAFTS_PER_DAY))).toBe(true); // 10 min → tope
    expect(craftsPerDay(0)!.eq(Q.of(MAX_CRAFTS_PER_DAY))).toBe(true);
    expect(craftsPerDay(null)).toBeNull();
    // 44,9167 o por fabricación cada 47 h ≈ 22,94 o al día
    expect(goldPerDay(Q.parse('449167'), 169200)!.toDecimal(0)).toBe('229361');
    expect(goldPerDay(null, 82800)).toBeNull();
    expect(goldPerDay(Q.of(-1000), 82800)!.sign()).toBe(-1);
  });
});

describe('espera compartida de las transmutaciones', () => {
  it('agrupa las transmutaciones y elige la mejor de cada grupo', async () => {
    const { groupOf, bestPerGroup, TRANSMUTE_GROUP } = await import('../src/server/transmutations.js');
    const { Q } = await import('../src/engine/rational.js');
    expect(groupOf('Transmute: Arcanite')).toBe(TRANSMUTE_GROUP);
    expect(groupOf('Transmute: Iron to Gold')).toBe(TRANSMUTE_GROUP);
    expect(groupOf('Mooncloth')).toBeNull();
    const it = (recipeId: number, group: string | null, status: string, g: number | null) => ({ recipeId, group, status, goldPerDay: g === null ? null : Q.of(g) });
    const best = bestPerGroup([
      it(1, TRANSMUTE_GROUP, 'candidato', 100),
      it(2, TRANSMUTE_GROUP, 'candidato', 300),
      it(3, TRANSMUTE_GROUP, 'riesgo', 900), // más oro pero sin demanda suficiente: pierde ante una «candidato»
      it(4, null, 'riesgo', 50), // sin grupo: va por su cuenta
      it(5, null, 'candidato', -10), // pierde oro: nunca se recomienda
      it(6, null, 'candidato', null), // sin datos
    ]);
    expect([...best.values()].map((b) => b.recipeId).sort()).toEqual([2, 4]);
    // Si ninguna del grupo es «candidato», la de más oro al día con ganancia.
    expect(bestPerGroup([it(1, TRANSMUTE_GROUP, 'riesgo', 10), it(2, TRANSMUTE_GROUP, 'riesgo', 20)]).get(TRANSMUTE_GROUP)!.recipeId).toBe(2);
  });
});
