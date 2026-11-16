import { describe, expect, it } from 'vitest';
import { parseSearchItems, pickRecipeItem } from '../scripts/sync-recipe-items.js';

const RESPONSE = `["Linen Reagent Bag", {
	items: [
		{"classs":9,"displayName":"Pattern: Linen Reagent Bag","id":253665,"name":"Pattern: Linen Reagent Bag","quality":2,"source":[5],"buyprice":150,"reqskill":197,"reqskillrank":5,"note":"a [b] {c}"},
		{"classs":1,"id":253664,"name":"Linen Reagent Bag","quality":1,"source":[1]}
	]
}]`;

describe('objetos de receta (Wowhead)', () => {
  it('lee el array de objetos del buscador, aunque haya corchetes dentro de textos', () => {
    const items = parseSearchItems(RESPONSE);
    expect(items.map((i) => i.id)).toEqual([253665, 253664]);
    expect(parseSearchItems('["x", {\n}]')).toEqual([]);
  });

  it('elige el objeto de clase receta de la misma profesión con el mismo nombre', () => {
    const it0 = pickRecipeItem(parseSearchItems(RESPONSE), { name: 'Linen Reagent Bag', learnedAt: 5 }, 197);
    expect(it0).toMatchObject({ itemId: 253665, sources: [5], buyPrice: 150 });
    expect(pickRecipeItem(parseSearchItems(RESPONSE), { name: 'Linen Reagent Bag', learnedAt: 5 }, 171)).toBeNull();
  });

  it('con varios candidatos, el del mismo nivel; si no se puede decidir, ninguno', () => {
    const two = [
      { classs: 9, id: 1, name: 'Recipe: Elixir of Fire Power', reqskill: 171, reqskillrank: 140, source: [5] },
      { classs: 9, id: 2, name: 'Recipe: Elixir of Firepower', reqskill: 171, reqskillrank: 150, source: [2] },
    ];
    expect(pickRecipeItem(two, { name: 'Elixir of Fire Power', learnedAt: 150 }, 171)?.itemId).toBe(2);
    expect(pickRecipeItem(two, { name: 'Elixir of Fire Power', learnedAt: 200 }, 171)).toBeNull();
  });
});
