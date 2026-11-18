import { describe, it, expect } from 'vitest';
import { openDb, migrate } from '../src/server/db.js';
import { parsePost, classify, numbersOf, changesOfTopic, gameChanges, parseDateHeading, type Fetcher } from '../src/server/gameChanges.js';

// HTML con la misma forma que los hilos de Blizzard (texto inventado).
const HOTFIX = `
<p><strong>November 17, 2026</strong></p>
<p><strong>Classes</strong></p>
<ul>
<li>Fixed a bug with all stuns.</li>
<li><strong>Shaman</strong>
<ul>
<li><strong>Enhancement</strong>
<ul>
<li>Stormstrike damage increased to 150% (was 100%).</li>
<li><em>Developers’ notes: a note about Stormstrike.</em></li>
</ul>
</li>
</ul>
</li>
</ul>
<p><strong>Dungeons</strong></p>
<ul><li>Something about a dungeon.</li></ul>
<hr>
<p><strong>November 10, 2026</strong></p>
<p><strong>Classes</strong></p>
<ul>
<li>
<p><strong>Warlock</strong></p>
<ul>
<li>Wrack damage reduced by 30%.</li>
<li>Life Tap cooldown reduced to 24 seconds (was 1 minute).
<ul><li><em>Developers’ notes: nested note.</em></li></ul>
</li>
</ul>
</li>
</ul>
<p><strong>Races</strong></p>
<ul><li><strong>Orc</strong><ul><li>Savage removed (1% increased critical strike chance).</li></ul></li></ul>
`;

describe('cambios del juego: lectura del foro', () => {
  it('lee fechas, secciones, clase, especialización, raza y notas', () => {
    const raw = parsePost(HOTFIX, '2026-11-01');
    const storm = raw.find((c) => c.text.startsWith('Stormstrike'))!;
    expect(storm).toMatchObject({ date: '2026-11-17', section: 'Classes', path: ['Shaman', 'Enhancement'], notes: ['Developers’ notes: a note about Stormstrike.'] });
    const tap = raw.find((c) => c.text.startsWith('Life Tap'))!;
    expect(tap).toMatchObject({ date: '2026-11-10', path: ['Warlock'], notes: ['Developers’ notes: nested note.'] });
    expect(parseDateHeading('November 5, 2026')).toBe('2026-11-05');

    const list = changesOfTopic({ topicId: 1, title: 't', fetchedAt: '', posts: [{ n: 1, created: '2026-11-01T00:00:00Z', cooked: HOTFIX }] }, { kind: 'hotfix', firstPostOnly: true });
    expect(list.map((c) => c.text)).not.toContain('Something about a dungeon.'); // solo clases y razas
    expect(list.find((c) => c.text.startsWith('Stormstrike'))).toMatchObject({ kind: 'clase', className: 'Shaman', spec: 'Enhancement', effect: 'mejora' });
    expect(list.find((c) => c.text.startsWith('Savage'))).toMatchObject({ kind: 'raza', race: 'Orc', effect: 'empeora' });
    expect(list.find((c) => c.text.startsWith('Fixed'))).toMatchObject({ kind: 'clase', className: null, effect: 'correccion' });
  });

  it('clasifica mejoras y empeoramientos teniendo en cuenta qué se mide', () => {
    expect(classify('Wrack damage reduced by 30%.')).toBe('empeora');
    expect(classify('Devouring Plague cooldown reduced to 24 seconds (was 1 minute).')).toBe('mejora');
    expect(classify('Shadow Word: Death cooldown increased to 18 seconds (was 12 seconds).')).toBe('empeora');
    expect(classify('Redoubt’s chance to Block changed to 4/8/12/16/20% (was 6/12/18/24/30%).')).toBe('empeora');
    expect(classify('Righteous Fury is now available to train at level 10 (was 16).')).toBe('mejora');
    expect(classify('Flawless Execution energy cost reduction increased to 15 (was 10).')).toBe('mejora');
    expect(classify('Riptide: Mana cost reduced by about 40%. Cooldown increased to 12 seconds from 6 seconds.')).toBe('mixto');
    expect(classify('Vampiric Embrace healing is now based on 10% of the Shadow damage done by the casting Priest (was 20%). The casting Priest receives 100% increased healing from this effect.')).toBe('mixto');
    expect(classify('New Talent: Death Mark. 25 Energy cost. 10 second cooldown.')).toBe('mejora');
    expect(classify('Improved Revenge moved to Row 2 (Was Row 3).')).toBe('cambio');
    expect(classify('Plainsrunning no longer increases mounted movement speed.')).toBe('empeora');
    // «3 s (era 6 %)» no se comparan; queda «lowered» sobre el maná devuelto: empeora.
    const shield = 'Shield Specialization Mana restored lowered to 4% with a 3 second internal cooldown (was 6% with a 3 second internal cooldown).';
    expect(numbersOf(shield)).toBeNull();
    expect(classify(shield)).toBe('empeora');
    expect(numbersOf('Hot Streak duration increased to 20 seconds (was 15 seconds).')).toMatchObject({ now: 20, was: 15 });
  });

  it('guarda una copia del foro y la usa si el foro falla', async () => {
    const db = await openDb('pglite:memory');
    await migrate(db);
    let calls = 0;
    const ok: Fetcher = async () => { calls++; return { ok: true, status: 200, json: async () => ({ title: 'Hotfixes', post_stream: { posts: [{ post_number: 1, created_at: '2026-11-01T00:00:00Z', staff: true, cooked: HOTFIX }, { post_number: 2, created_at: '2026-11-02T00:00:00Z', staff: false, cooked: '<ul><li><strong>Mage</strong><ul><li>Fake player post.</li></ul></li></ul>' }] } }) }; };
    const first = await gameChanges(db, { fetcher: ok, now: Date.now() });
    expect(first.changes.some((c) => c.text === 'Fake player post.')).toBe(false); // solo mensajes de Blizzard
    expect(first.changes.filter((c) => c.source === 'hotfix').length).toBeGreaterThan(3);
    const n = calls;
    await gameChanges(db, { fetcher: ok, now: Date.now() }); // copia de menos de una hora: no se pide
    expect(calls).toBe(n);
    const down: Fetcher = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const later = await gameChanges(db, { fetcher: down, now: Date.now() + 2 * 3600_000 });
    expect(later.sources[0]).toMatchObject({ stale: true });
    expect(later.changes.length).toBe(first.changes.length);
    await db.close();
  });
});
