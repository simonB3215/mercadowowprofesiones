/** CSV para Excel en español: separador «;», coma decimal y BOM UTF-8 (para que se lean bien las tildes). */
import { Q } from './lib.js';

const COPPER = Q.of(10000);
/** Cobre → oro con hasta 4 decimales y coma decimal; vacío si no hay dato (nunca 0). */
export const goldCell = (q: Q | null | undefined) => (q ? q.div(COPPER).toDecimal(4).replace('.', ',') : '');
export const numCell = (q: Q | number | null | undefined, digits = 2) =>
  q === null || q === undefined ? '' : (typeof q === 'number' ? String(Number(q.toFixed(digits))) : q.toDecimal(digits)).replace('.', ',');

export function toCsv(head: string[], rows: string[][]): string {
  const esc = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

export function downloadCsv(filename: string, text: string) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
