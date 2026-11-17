import { describe, it, expect } from 'vitest';
import { buildItemTooltip, loc } from '../src/server/itemTooltip.js';

const L = (es: string, en = es) => ({ es_MX: es, en_US: en });
const row = (raw: any) => ({ id: 1, name: 'Objeto', quality: 'UNCOMMON', item_class: 'Consumible', item_subclass: 'Pociones', raw });

describe('descripción del objeto al pasar el ratón', () => {
  it('poción: efecto de uso en verde, nivel requerido, clase y precio al vendedor', () => {
    const t = buildItemTooltip(row({
      preview_item: {
        spells: [{ description: L('Uso: Restaura 455 a 585 p. de maná.') }],
        requirements: { level: { value: 22, display_string: L('Necesitas ser de nivel 22') } },
        item_class: { name: L('Consumible') }, item_subclass: { name: L('Pociones') },
        inventory_type: { type: 'NON_EQUIP', name: L('No equipable') }, sell_price: { value: 120 },
      },
    }));
    expect(t.lines).toEqual([
      { text: 'Necesitas ser de nivel 22' },
      { text: 'Uso: Restaura 455 a 585 p. de maná.', tone: 'green' },
      { text: 'Consumible · Pociones', tone: 'muted' },
    ].map((l) => ({ tone: undefined, ...l })));
    expect(t.vendorSell).toBe('120');
    expect(t.partial).toBe(false);
  });

  it('arma: nivel de objeto, ranura y tipo, daño y velocidad, bonificaciones en verde', () => {
    const t = buildItemTooltip(row({
      preview_item: {
        level: { display_string: L('Nivel de objeto 23') }, binding: { name: L('Se liga al equiparlo') },
        inventory_type: { type: 'WEAPON', name: L('Una mano') }, item_subclass: { name: L('Daga') },
        weapon: { damage: { display_string: L('13 - 26 p. de daño') }, attack_speed: { display_string: L('Velocidad 1.70') }, dps: { display_string: L('(11.5 p. de daño por segundo)') } },
        stats: [{ display: { display_string: L('+2 Agilidad'), color: { r: 255, g: 255, b: 255 } } }, { is_equip_bonus: true, display: { display_string: L('+10 Poder con hechizos') } }],
        durability: { display_string: L('Durabilidad 45 / 45') }, sell_price: { value: 2107 },
      },
    }));
    const text = t.lines.map((l) => l.text);
    expect(text).toEqual(['Nivel de objeto 23', 'Se liga al equiparlo', 'Una mano', '13 - 26 p. de daño', '(11.5 p. de daño por segundo)', '+2 Agilidad', '+10 Poder con hechizos', 'Durabilidad 45 / 45']);
    expect(t.lines[2].right).toBe('Daga');
    expect(t.lines[3].right).toBe('Velocidad 1.70');
    expect(t.lines[6].tone).toBe('green');
  });

  it('sin ficha del objeto: solo clase y aviso de datos parciales; nivel 1 no se muestra', () => {
    const t = buildItemTooltip({ id: 2, name: 'Hierba', quality: 'COMMON', item_class: 'Objeto comerciable', item_subclass: 'Hierbas', raw: null });
    expect(t.partial).toBe(true);
    expect(t.lines).toEqual([{ text: 'Objeto comerciable · Hierbas', tone: 'muted' }]);
    const lvl1 = buildItemTooltip(row({ preview_item: { requirements: { level: { value: 1, display_string: L('Necesitas ser de nivel 1') } } } }));
    expect(lvl1.lines.some((l) => /nivel 1/.test(l.text))).toBe(false);
  });

  it('textos localizados: español de México, luego España, luego inglés', () => {
    expect(loc({ es_ES: 'Lingote', en_US: 'Bar' })).toBe('Lingote');
    expect(loc({ en_US: 'Bar' })).toBe('Bar');
    expect(loc('plano')).toBe('plano');
    expect(loc(null)).toBeNull();
  });
});
