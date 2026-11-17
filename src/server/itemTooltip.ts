/**
 * Descripción de un objeto para la ventana emergente al pasar el ratón (como el tooltip del juego).
 * Sale de los datos del objeto que ya guarda el catálogo (Blizzard Game Data: `raw.preview_item`), en español de México
 * (el mismo idioma que el resto del catálogo). Sin datos del objeto, solo el nombre y la clase.
 */

export type TipTone = 'white' | 'green' | 'gold' | 'muted' | 'red';
export interface TipLine { text: string; right?: string; tone?: TipTone }
export interface ItemTooltip {
  itemId: number;
  name: string | null;
  quality: string | null;
  lines: TipLine[];
  /** Precio de venta al vendedor en cobre (null si no se puede vender o no se conoce). */
  vendorSell: string | null;
  /** El catálogo no tiene la ficha del objeto: solo nombre y clase. */
  partial: boolean;
}

const LOCALES = ['es_MX', 'es_ES', 'en_US'];
/** Texto de un campo localizado de Blizzard ({es_MX: …}) o ya plano. */
export function loc(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') for (const l of LOCALES) if (typeof (v as any)[l] === 'string') return (v as any)[l];
  return null;
}

/** Color de Blizzard (r,g,b) → tono de la ventana. */
function toneOf(c: any): TipTone | undefined {
  if (!c) return undefined;
  if (c.r === 0 && c.g === 255 && c.b === 0) return 'green';
  if (c.r === 255 && c.g === 0 && c.b === 0) return 'red';
  return undefined;
}

export function buildItemTooltip(row: { id: number; name: string | null; quality: string | null; item_class: string | null; item_subclass: string | null; raw: any }): ItemTooltip {
  const p = row.raw?.preview_item;
  const lines: TipLine[] = [];
  const add = (text: string | null | undefined, tone?: TipTone, right?: string | null) => { if (text) lines.push({ text, tone, ...(right ? { right } : {}) }); };
  if (!p) {
    add([row.item_class, row.item_subclass].filter(Boolean).join(' · ') || null, 'muted');
    return { itemId: row.id, name: row.name, quality: row.quality, lines, vendorSell: null, partial: true };
  }
  const equip = p.inventory_type?.type && p.inventory_type.type !== 'NON_EQUIP';
  if (equip && p.level?.display_string) add(loc(p.level.display_string), 'gold');
  add(loc(p.binding?.name));
  if (p.unique_equipped) add(loc(p.unique_equipped));
  if (equip) add(loc(p.inventory_type?.name), undefined, p.is_subclass_hidden ? null : loc(p.item_subclass?.name));
  if (p.weapon) {
    add(loc(p.weapon.damage?.display_string), undefined, loc(p.weapon.attack_speed?.display_string));
    add(loc(p.weapon.dps?.display_string));
  }
  if (p.armor?.display) add(loc(p.armor.display.display_string));
  for (const s of p.stats ?? []) add(loc(s.display?.display_string), s.is_equip_bonus ? 'green' : toneOf(s.display?.color));
  for (const r of p.resistances ?? []) add(loc(r.display?.display_string));
  if (p.durability?.display_string) add(loc(p.durability.display_string));
  if (p.requirements?.level?.display_string && p.requirements.level.value > 1) add(loc(p.requirements.level.display_string));
  if (p.requirements?.skill?.display_string) add(loc(p.requirements.skill.display_string));
  if (p.requirements?.reputation?.display_string) add(loc(p.requirements.reputation.display_string));
  for (const s of p.spells ?? []) add(loc(s.description), 'green');
  if (p.set?.display_string) add(loc(p.set.display_string), 'gold');
  if (p.description) add(`«${loc(p.description)}»`, 'gold');
  if (p.crafting_reagent) add(loc(p.crafting_reagent), 'muted');
  // Objetos sin equipar: la clase va al final, como referencia (p. ej. «Consumible · Pociones», «Objeto comerciable · Hierbas»).
  if (!equip) add([loc(p.item_class?.name), loc(p.item_subclass?.name)].filter(Boolean).join(' · ') || null, 'muted');
  const sell = p.sell_price?.value ?? (typeof row.raw?.sell_price === 'number' ? row.raw.sell_price : row.raw?.sell_price?.value);
  return {
    itemId: row.id, name: row.name ?? loc(p.name), quality: row.quality ?? p.quality?.type ?? null, lines,
    vendorSell: typeof sell === 'number' && sell > 0 ? String(sell) : null, partial: false,
  };
}
