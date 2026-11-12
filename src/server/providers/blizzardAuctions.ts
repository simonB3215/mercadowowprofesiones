/**
 * Casa de subastas de WoW Forever desde la Blizzard Game Data API (namespace dynamic-forever-{región}).
 * Verificado el 12-11-2026 con respuestas reales:
 *  - /data/wow/ruleset/{r}/auctions/{casa}              → auctions[].{item.id, buyout, quantity, bid?}
 *  - /data/wow/ruleset/{r}/auctions/{casa}/commodities  → auctions[].{item.id, unit_price, quantity}
 *  - El contenido no depende de {r}: las casas son globales. Se usa r = 2 (Normal).
 * Se resume por objeto en el mismo formato que el CSV por casa de TSM, para reutilizar la ingesta.
 */
import type { BlizzardClient } from './blizzard.js';

export const AUCTION_RULESET = 2;
export const AUCTION_HEADER = 'itemId,name,marketValue,minBuyout,recent,historical,updatedAt';

interface Listing {
  unit: bigint;
  qty: bigint;
}

/** Fracción más barata del volumen que se promedia para el valor de mercado. */
const MARKET_SHARE_NUM = 15n;
const MARKET_SHARE_DEN = 100n;

/**
 * Valor de mercado: media ponderada por cantidad del 15 % más barato del volumen publicado
 * (al menos una unidad). Resiste publicaciones aisladas muy baratas o muy caras. Redondea hacia abajo.
 */
export function marketValue(listings: Listing[]): bigint | null {
  if (!listings.length) return null;
  const sorted = [...listings].sort((a, b) => (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0));
  const total = sorted.reduce((a, l) => a + l.qty, 0n);
  let target = (total * MARKET_SHARE_NUM) / MARKET_SHARE_DEN;
  if (target < 1n) target = 1n;
  let taken = 0n;
  let sum = 0n;
  for (const l of sorted) {
    if (taken >= target) break;
    const q = l.qty < target - taken ? l.qty : target - taken;
    taken += q;
    sum += q * l.unit;
  }
  return sum / taken;
}

/** Agrupa publicaciones por objeto. Las subastas sin precio de compra inmediata se ignoran. */
export function summarize(auctions: any[], commodities: any[]): Map<number, Listing[]> {
  const by = new Map<number, Listing[]>();
  const add = (id: unknown, unit: bigint, qty: bigint) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0 || unit <= 0n || qty <= 0n) return;
    let l = by.get(n);
    if (!l) by.set(n, (l = []));
    l.push({ unit, qty });
  };
  for (const a of auctions) {
    if (!a?.buyout || !a?.quantity) continue;
    const qty = BigInt(a.quantity);
    add(a.item?.id, BigInt(a.buyout) / qty, qty);
  }
  for (const c of commodities) {
    if (!c?.unit_price || !c?.quantity) continue;
    add(c.item?.id, BigInt(c.unit_price), BigInt(c.quantity));
  }
  return by;
}

/** CSV con la cabecera de TSM por casa. `historical` queda vacío: Blizzard solo da la foto actual. */
export function toCsv(by: Map<number, Listing[]>, updatedAt: string): string {
  const lines = [AUCTION_HEADER];
  for (const id of [...by.keys()].sort((a, b) => a - b)) {
    const l = by.get(id)!;
    const min = l.reduce((m, x) => (x.unit < m ? x.unit : m), l[0].unit);
    const mv = marketValue(l)!;
    lines.push(`${id},,${mv},${min},${min},,${updatedAt}`);
  }
  return lines.join('\n') + '\n';
}

export async function fetchHouseCsv(client: BlizzardClient, houseId: number): Promise<{ text: string; url: string }> {
  const ns = `dynamic-forever-${client.region}`;
  const base = `/data/wow/ruleset/${AUCTION_RULESET}/auctions/${houseId}`;
  const [a, c] = await Promise.all([client.getRaw(base, ns), client.getRaw(`${base}/commodities`, ns)]);
  const times = [a.lastModified, c.lastModified].filter(Boolean).map((t) => Date.parse(t!)).filter((t) => !Number.isNaN(t));
  const updatedAt = new Date(times.length ? Math.max(...times) : Date.now()).toISOString().replace(/\.\d+Z$/, 'Z');
  const by = summarize(a.json?.auctions ?? [], c.json?.auctions ?? []);
  if (!by.size) throw new Error(`La casa de subastas ${houseId} no tiene publicaciones.`);
  return { text: toCsv(by, updatedAt), url: `https://${client.region}.api.blizzard.com${base}?namespace=${ns}` };
}
