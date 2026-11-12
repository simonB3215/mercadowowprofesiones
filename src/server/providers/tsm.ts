/**
 * Adaptador de los CSV públicos de TSM.
 * Contrato verificado con muestras reales el 2026-11-11 (ver docs/VALIDACION_FUENTES.md):
 *  - realm/{slug}/items.csv y commodities.csv: itemId,name,marketValue,minBuyout,recent,historical,updatedAt
 *  - region/items.csv: itemId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt
 * Importes en cobre. updatedAt es igual en todas las filas (escaneo de origen).
 */
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { TSM_BASE } from '../config.js';

export type FileKind = 'commodities' | 'realm_items' | 'region_items';

export const EXPECTED_HEADERS: Record<FileKind, string[]> = {
  commodities: ['itemId', 'name', 'marketValue', 'minBuyout', 'recent', 'historical', 'updatedAt'],
  realm_items: ['itemId', 'name', 'marketValue', 'minBuyout', 'recent', 'historical', 'updatedAt'],
  region_items: ['itemId', 'name', 'marketValue', 'historical', 'avgSalePrice', 'saleRate', 'soldPerDay', 'updatedAt'],
};

export function tsmUrl(gameType: string, region: string, kind: FileKind, realm?: string): string {
  if (!/^[a-z-]+$/.test(gameType) || !/^[a-z]{2}$/.test(region)) throw new Error('Contexto inválido');
  if (kind === 'realm_items') {
    if (!realm || !/^[a-z0-9-]+$/.test(realm)) throw new Error('Slug de reino inválido');
    return `${TSM_BASE}/${gameType}/${region}/realm/${realm}/items.csv`;
  }
  if (kind === 'commodities') return `${TSM_BASE}/${gameType}/${region}/commodities.csv`;
  return `${TSM_BASE}/${gameType}/${region}/region/items.csv`;
}

export interface PriceRow {
  itemId: number;
  name: string | null;
  marketValue: bigint | null;
  minBuyout: bigint | null;
  recent: bigint | null;
  historical: bigint | null;
  avgSalePrice: bigint | null;
  saleRate: string | null;
  soldPerDay: string | null;
}

export interface ParsedFile {
  rows: PriceRow[];
  rejected: number;
  rejectSamples: string[];
  sourceTime: string | null;
  checksum: string;
  bytes: number;
}

const MAX_BYTES = 30 * 1024 * 1024;

/** Precio en cobre: vacío o 0 → null (0 indica ausencia de publicación/dato, nunca precio gratuito). */
function copper(v: string | undefined): bigint | null {
  if (v === undefined || v === '') return null;
  if (!/^\d+$/.test(v)) throw new Error(`importe no entero: ${v}`);
  const b = BigInt(v);
  return b === 0n ? null : b;
}
function rate(v: string | undefined): string | null {
  if (v === undefined || v === '') return null;
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error(`tasa inválida: ${v}`);
  return v;
}

export function parseTsmCsv(kind: FileKind, text: string): ParsedFile {
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_BYTES) throw new Error(`Archivo demasiado grande (${bytes} bytes)`);
  const checksum = createHash('sha256').update(text).digest('hex');
  const records: string[][] = parse(text, { relax_column_count: true, skip_empty_lines: true, bom: true });
  if (!records.length) throw new Error('Archivo vacío');
  const header = records[0];
  const expected = EXPECTED_HEADERS[kind];
  if (header.join(',') !== expected.join(',')) {
    throw new Error(`Cabecera inesperada. Esperada: ${expected.join(',')} · Recibida: ${header.join(',')}`);
  }
  const idx = (k: string) => header.indexOf(k);
  const rows: PriceRow[] = [];
  const seen = new Set<number>();
  let rejected = 0;
  const rejectSamples: string[] = [];
  let sourceTime: string | null = null;
  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    try {
      if (r.length !== header.length) throw new Error(`columnas ${r.length}`);
      const id = Number(r[idx('itemId')]);
      if (!Number.isInteger(id) || id <= 0) throw new Error('itemId inválido');
      if (seen.has(id)) throw new Error('itemId duplicado');
      const ts = r[idx('updatedAt')];
      if (Number.isNaN(Date.parse(ts))) throw new Error('updatedAt inválido');
      if (!sourceTime || ts > sourceTime) sourceTime = ts;
      const g = (k: string) => (idx(k) >= 0 ? r[idx(k)] : undefined);
      rows.push({
        itemId: id,
        name: r[idx('name')] || null,
        marketValue: copper(g('marketValue')),
        minBuyout: copper(g('minBuyout')),
        recent: copper(g('recent')),
        historical: copper(g('historical')),
        avgSalePrice: copper(g('avgSalePrice')),
        saleRate: rate(g('saleRate')),
        soldPerDay: rate(g('soldPerDay')),
      });
      seen.add(id);
    } catch (e) {
      rejected++;
      if (rejectSamples.length < 5) rejectSamples.push(`fila ${i + 1}: ${(e as Error).message}`);
    }
  }
  return { rows, rejected, rejectSamples, sourceTime, checksum, bytes };
}

export class TsmHttpError extends Error {
  constructor(public status: number, url: string) {
    super(status === 404 ? `TSM no publica este archivo (404): ${url}` : `TSM respondió ${status}: ${url}`);
  }
}

export async function fetchTsm(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(url, { headers: { 'user-agent': 'mercado-wow-profesiones/0.1' } });
  if (!res.ok) throw new TsmHttpError(res.status, url);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('csv') && !ct.includes('text')) throw new Error(`Tipo de contenido inesperado: ${ct}`);
  return res.text();
}
