// Guarda respuestas reales de muestra en docs/muestras para validar el contrato (PB-01).
import fs from 'node:fs';
import { createBlizzardClient } from '../src/server/providers/blizzard.js';
const region = process.argv.slice(2).find((a) => a !== '--') ?? 'us';
const c = createBlizzardClient(region);
const ns = `static-${region}`;
fs.mkdirSync('docs/muestras', { recursive: true });
const save = (name: string, data: unknown) => fs.writeFileSync(`docs/muestras/${name}.json`, JSON.stringify(data, null, 2));
const index = await c.get('/data/wow/profession/index', ns);
save('profession_index', index);
const profs: any[] = index.professions ?? [];
console.log(`Profesiones: ${profs.map((p) => `${p.id}:${typeof p.name === 'string' ? p.name : p.name?.en_US}`).join(', ')}`);
for (const p of profs.slice(0, 20)) {
  const d = await c.get(`/data/wow/profession/${p.id}`, ns);
  save(`profession_${p.id}`, d);
  const tier = (d.skill_tiers ?? []).at(-1);
  if (!tier) continue;
  const t = await c.get(`/data/wow/profession/${p.id}/skill-tier/${tier.id}`, ns);
  save(`skill_tier_${p.id}_${tier.id}`, t);
  const rec = t.categories?.[0]?.recipes?.[0];
  if (!rec) continue;
  const r = await c.get(`/data/wow/recipe/${rec.id}`, ns);
  save(`recipe_${rec.id}`, r);
  const itemId = r.crafted_item?.id ?? r.alliance_crafted_item?.id ?? r.reagents?.[0]?.reagent?.id;
  if (itemId) save(`item_${itemId}`, await c.get(`/data/wow/item/${itemId}`, ns));
  console.log(`  ${p.id}: tier ${tier.id}, receta ${rec.id}, objeto ${itemId ?? '-'}`);
}
save('realm_index', await c.get('/data/wow/realm/index', `dynamic-${region}`));
console.log('Muestras guardadas en docs/muestras/');
