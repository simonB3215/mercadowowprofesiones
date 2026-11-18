/**
 * Lo que ya tienes en la bolsa (PC-08 / PC-14): se descuenta de la lista de compra de las rutas de subida.
 * Se guarda solo en este navegador (Blizzard no expone el inventario del personaje), por ruta general o por personaje.
 * La ruta y su costo no cambian: lo que tienes vale lo mismo que en la casa de subastas, solo dejas de comprarlo.
 */
import { Q } from '../../src/engine/rational.js';

export type Owned = Record<string, number>;

/** Máximo que se acepta por material (evita cifras absurdas al escribir). */
export const MAX_OWNED = 100000;

/** Cantidad válida: entero ≥ 0 y ≤ MAX_OWNED; lo demás cuenta como 0. */
export function cleanQty(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_OWNED, Math.floor(n)) : 0;
}

interface Row { itemId: number; quantity: bigint; unitPrice: Q | null; cost: Q | null }

export interface OwnedRow<T extends Row> {
  row: T;
  /** Lo que pide la ruta. */
  need: bigint;
  /** Lo que tienes y se usa (nunca más de lo que pide la ruta). */
  owned: bigint;
  /** Lo que queda por comprar. */
  buy: bigint;
  /** Costo de lo que queda por comprar (0 si no hay que comprar nada, aunque no tenga precio; null = sin precio). */
  cost: Q | null;
  /** Lo que te ahorras con lo que tienes (null si no tiene precio). */
  saved: Q | null;
}

export function applyOwned<T extends Row>(rows: T[], owned: Owned): OwnedRow<T>[] {
  return rows.map((row) => {
    const have = BigInt(cleanQty(owned[String(row.itemId)]));
    const used = have < row.quantity ? have : row.quantity;
    const buy = row.quantity - used;
    const cost = buy === 0n ? Q.zero : row.unitPrice ? row.unitPrice.mul(buy) : used === 0n ? row.cost : null;
    const saved = used === 0n ? Q.zero : row.unitPrice ? row.unitPrice.mul(used) : null;
    return { row, need: row.quantity, owned: used, buy, cost, saved };
  });
}

/** Suma de importes; null si alguno no tiene precio (nunca se da un total incompleto como si fuera exacto). */
export const sumOrNull = (xs: Array<Q | null>): Q | null => (xs.every((x) => x) ? xs.reduce<Q>((a, x) => a.add(x!), Q.zero) : null);

const BAG_PREFIX = 'mw-bolsa:';

export function readOwned(key: string): Owned {
  try {
    const raw = JSON.parse(localStorage.getItem(BAG_PREFIX + key) ?? '{}');
    const out: Owned = {};
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) { const n = cleanQty(v); if (/^\d+$/.test(k) && n) out[k] = n; }
    return out;
  } catch { return {}; }
}

export function writeOwned(key: string, owned: Owned) {
  try {
    if (Object.keys(owned).length) localStorage.setItem(BAG_PREFIX + key, JSON.stringify(owned));
    else localStorage.removeItem(BAG_PREFIX + key);
  } catch { /* sin almacenamiento: solo mientras la página esté abierta */ }
}
