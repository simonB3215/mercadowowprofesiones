import { afterEach, describe, expect, it } from 'vitest';
import { _setLangForTest, _setNamesForTest, nm, t, tp, translateData } from '../web/src/i18n.js';
import { EN } from '../web/src/i18n-en.js';

afterEach(() => { _setLangForTest('es'); _setNamesForTest({}); });

describe('idioma de la web', () => {
  it('en español devuelve el texto tal cual y sustituye variables', () => {
    expect(t('Se usa en {n} recetas', { n: 3 })).toBe('Se usa en 3 recetas');
    expect(translateData({ name: 'Barra de arcanita' })).toEqual({ name: 'Barra de arcanita' });
  });

  it('en inglés traduce con el diccionario y deja el español si falta la clave', () => {
    _setLangForTest('en');
    expect(t('Guardar')).toBe('Save');
    expect(t('Ruta para {x}', { x: 'Thrall' })).toBe('Route for Thrall');
    expect(t('Texto que no está en el diccionario')).toBe('Texto que no está en el diccionario');
    expect(tp(1, 'receta', 'recetas')).toMatch(/^1 /);
  });

  it('traduce nombres del juego y frases del servidor en las respuestas, sin tocar importes ni códigos', () => {
    _setLangForTest('en');
    _setNamesForTest({ 'Barra de arcanita': 'Arcanite Bar', 'Cristal de Arcanita': 'Arcane Crystal' });
    const out = translateData({
      name: 'Barra de arcanita',
      status: 'no_rentable',
      profit: { n: '5', d: '1' },
      reasons: ['Falta precio de 1 material(es): Cristal de Arcanita.', 'Beneficio positivo, pero ROI inferior al objetivo.'],
      notes: ['Reutilización de 2 días (Wowhead): como máximo una fabricación cada 2 días. La ganancia es por fabricación; no se puede repetir seguida.'],
      channelReason: 'El resultado se liga al recogerlo (ON_ACQUIRE).',
      staleDetail: 'Datos fuera de vigencia: precios de la casa de subastas con 3.5 h (máx. 2 h).',
      realmLabel: 'JcJ — Horda',
    });
    expect(out.name).toBe('Arcanite Bar');
    expect(out.status).toBe('no_rentable');
    expect(out.profit).toEqual({ n: '5', d: '1' });
    expect(out.reasons).toEqual(['Missing price for 1 material(s): Arcane Crystal.', 'Positive profit, but ROI below the target.']);
    expect(out.notes[0]).toBe('2 days cooldown (Wowhead): at most one craft every 2 days. Profit is per craft; it cannot be repeated back to back.');
    expect(out.channelReason).toBe('The result binds on pickup (ON_ACQUIRE).');
    expect(out.staleDetail).toBe('Stale data: auction house prices 3.5 h old (max. 2 h).');
    expect(out.realmLabel).toBe('PvP — Horde');
  });

  it('nm elige el nombre según el idioma, con el otro como respaldo', () => {
    expect(nm('Barra de arcanita', 'Arcanite Bar')).toBe('Barra de arcanita');
    _setLangForTest('en');
    expect(nm('Barra de arcanita', 'Arcanite Bar')).toBe('Arcanite Bar');
    expect(nm('Solo español', null)).toBe('Solo español');
  });

  it('cada traducción conserva las variables {x} del texto original', () => {
    const bad = Object.entries(EN).filter(([es, en]) => {
      const vars = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join(',');
      return vars(es) !== vars(en);
    });
    expect(bad).toEqual([]);
  });
});
