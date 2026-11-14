/**
 * Precio de compra al vendedor de los materiales que solo venden los vendedores (D35).
 * Fuente: data/leveling/forever-vendor-items.json, generado con `npm run sync:vendor` desde Wowhead Forever.
 * Un material que no aparece no tiene precio de vendedor (null): se usa la casa de subastas.
 */
import data from '../../data/leveling/forever-vendor-items.json' with { type: 'json' };
import { Q } from '../engine/rational.js';

const D = data as unknown as { source: string; checkedAt: string; vendor?: Record<string, { price: number; lot: number }> };

/**
 * Vendidos solo con reputación (Lokhtos Darkbargainer, Hermandad del Torio): Wowhead los marca como «de vendedor»
 * igual que el hilo, pero no están al alcance de cualquier personaje.
 */
export const REPUTATION_VENDOR = new Set([17010 /* Núcleo ígneo */, 18567 /* Flujo elemental */, 11382 /* Sangre de la montaña */]);

/**
 * Si la casa de subastas cobra más de este múltiplo del precio del vendedor, el vendedor no es accesible sin límite
 * (existencias limitadas, reputación o evento): nadie pagaría el triple si pudiera comprarlo libremente.
 */
export const RESTRICTED_RATIO = 3n;

const UNIT = new Map<number, Q>();
function load(entries: Record<string, { price: number; lot: number }>) {
  UNIT.clear();
  for (const [id, v] of Object.entries(entries)) {
    if (v.price > 0 && v.lot >= 1 && !REPUTATION_VENDOR.has(Number(id))) UNIT.set(Number(id), Q.of(v.price, v.lot));
  }
}
load(D.vendor ?? {});

export const VENDOR_SOURCE = { url: D.source, checkedAt: D.checkedAt, get items() { return UNIT.size; } };

/** Precio por unidad en cobre, o null si el material no se compra (solo) a un vendedor accesible. */
export const vendorUnitPrice = (itemId: number): Q | null => UNIT.get(itemId) ?? null;

/**
 * Precio de compra de un material: el más barato entre vendedor y casa de subastas. Si la subasta supera
 * RESTRICTED_RATIO × vendedor, se descarta el vendedor (ver arriba).
 */
export function bestBuyPrice(itemId: number, auction: Q | null): { copper: Q | null; source: 'vendedor' | 'casa de subastas' | 'sin datos' } {
  const vendor = vendorUnitPrice(itemId);
  const usable = vendor && (!auction || auction.cmp(vendor.mul(RESTRICTED_RATIO)) <= 0);
  if (usable && (!auction || vendor.cmp(auction) <= 0)) return { copper: vendor, source: 'vendedor' };
  return auction ? { copper: auction, source: 'casa de subastas' } : { copper: null, source: 'sin datos' };
}

/** Solo para pruebas: sustituye los precios de vendedor ({ itemId: { price, lot } }); null restaura los del archivo. */
export function setVendorPrices(entries: Record<number, { price: number; lot: number }> | null) {
  load(entries ?? D.vendor ?? {});
}
