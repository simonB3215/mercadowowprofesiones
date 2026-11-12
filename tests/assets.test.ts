import { describe, it, expect } from 'vitest';
import { openDb, migrate } from '../src/server/db.js';
import { resolveItem, resolveProfession, saveAsset, loadAssets, wowheadIconUrl } from '../src/server/assets.js';
import type { BlizzardClient } from '../src/server/providers/blizzard.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const blizzard = (icons: Record<string, string>): BlizzardClient => ({
  region: 'us',
  getRaw: async () => ({ json: {}, lastModified: null }),
  get: async (path: string) => {
    const v = icons[path];
    if (!v) throw new Error('404');
    return { assets: [{ key: 'icon', value: v }] };
  },
});

describe('Capa de recursos visuales', () => {
  it('URL de icono de Wowhead por tamaño; rechaza nombres no válidos', () => {
    expect(wowheadIconUrl('inv_fabric_linen_01', 'medium')).toBe('https://wow.zamimg.com/images/wow/icons/medium/inv_fabric_linen_01.jpg');
    expect(() => wowheadIconUrl('../x')).toThrow();
  });

  it('objeto: Wowhead (entorno Forever) con el icono de Blizzard como respaldo', async () => {
    let asked = '';
    const f = (async (u: string) => { asked = u; return json(200, { name: 'Linen Cloth', icon: 'inv_fabric_linen_01' }); }) as unknown as typeof fetch;
    const a = await resolveItem(2589, blizzard({ '/data/wow/media/item/2589': 'https://render.worldofwarcraft.com/forever-us/icons/56/132889.jpg' }), 'static-forever-us', f);
    expect(asked).toBe('https://nether.wowhead.com/tooltip/item/2589?dataEnv=16');
    expect(a.source).toBe('wowhead');
    expect(a.fallback_url).toContain('render.worldofwarcraft.com');
    expect(a.page_url).toBe('https://www.wowhead.com/forever/item=2589');
  });

  it('objeto sin ficha en Wowhead: icono oficial de Blizzard; sin ninguno: «ninguno», nunca otro por nombre', async () => {
    const nf = (async () => json(404, { error: 'Entity not found' })) as unknown as typeof fetch;
    const b = await resolveItem(5, blizzard({ '/data/wow/media/item/5': 'https://render.worldofwarcraft.com/forever-us/icons/56/1.jpg' }), 'ns', nf);
    expect([b.source, b.url]).toEqual(['blizzard', 'https://render.worldofwarcraft.com/forever-us/icons/56/1.jpg']);
    const n = await resolveItem(6, blizzard({}), 'ns', nf);
    expect([n.source, n.url]).toEqual(['ninguno', null]);
  });

  it('profesión: solo acepta el hechizo de Wowhead si el nombre coincide', async () => {
    const ok = (async () => json(200, { name: 'Alchemy', icon: 'trade_alchemy' })) as unknown as typeof fetch;
    expect((await resolveProfession(171, 'Alchemy', null, 'ns', ok)).icon_name).toBe('trade_alchemy');
    const wrong = (async () => json(200, { name: 'Otra cosa', icon: 'x' })) as unknown as typeof fetch;
    const r = await resolveProfession(171, 'Alchemy', null, 'ns', wrong);
    expect(r.source).toBe('ninguno');
    expect(r.error).toMatch(/no «Alchemy»/);
  });

  it('se guarda y se sirve en el tamaño pedido', async () => {
    const db = await openDb('pglite:memory');
    await migrate(db);
    await saveAsset(db, 'forever', { kind: 'item', id: 2589, source: 'wowhead', icon_name: 'inv_fabric_linen_01', ref_id: 2589,
      url: wowheadIconUrl('inv_fabric_linen_01'), fallback_url: 'https://render.worldofwarcraft.com/forever-us/icons/56/132889.jpg', page_url: null, error: null });
    const out = await loadAssets(db, 'forever', [2589, 999], [], 'small');
    expect(out.items[2589].src).toBe('https://wow.zamimg.com/images/wow/icons/small/inv_fabric_linen_01.jpg');
    expect(out.items[2589].fallback).toContain('132889');
    expect(out.items[999]).toBeUndefined();
  });
});
