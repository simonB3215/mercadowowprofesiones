/**
 * Herramientas comunes a las rutas de subida («Subir nivel» y «Mi personaje»): marcar pasos hechos (se guarda en
 * este navegador), lista de compra con «solo lo que falta», copiar y descargar CSV, procedencia de recetas y
 * materiales, y otras recetas posibles en cada paso («Evitar esta receta»).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Money, Q, toQ } from './lib.js';
import { ItemLabel } from './icons.js';
import { downloadCsv, goldCell, toCsv } from './csv.js';
import { ArrowSquareOut, ArrowCounterClockwise, Copy, DownloadSimple, Check, Prohibit, ArrowsLeftRight } from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Pasos hechos
// ---------------------------------------------------------------------------

/** Clave estable de un paso: niveles + receta (si la ruta cambia, las marcas de pasos distintos no se arrastran). */
export const stepKey = (s: any) => `${s.from}-${s.to}-${s.recipe?.spellId ?? 'sin'}`;

const DONE_PREFIX = 'routeDone:';
function readDone(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_PREFIX + key) ?? '[]')); } catch { return new Set(); }
}

/** Pasos marcados como hechos para una ruta (por profesión, objetivo y modo; personaje si lo hay). */
export function useStepsDone(key: string) {
  const [done, setDone] = useState<Set<string>>(() => readDone(key));
  useEffect(() => { setDone(readDone(key)); }, [key]);
  const write = useCallback((next: Set<string>) => {
    setDone(next);
    try {
      if (next.size) localStorage.setItem(DONE_PREFIX + key, JSON.stringify([...next]));
      else localStorage.removeItem(DONE_PREFIX + key);
    } catch { /* sin almacenamiento: se mantiene solo mientras la página esté abierta */ }
  }, [key]);
  const toggle = (k: string) => { const n = new Set(done); if (n.has(k)) n.delete(k); else n.add(k); write(n); };
  return { done, toggle, reset: () => write(new Set()) };
}

/** Casilla «Hecho» de un paso. */
export function StepCheck({ s, i, done, onToggle }: { s: any; i: number; done: boolean; onToggle: () => void }) {
  return (
    <label className="rt-check" title="Márcalo cuando termines este paso">
      <input type="checkbox" checked={done} onChange={onToggle} aria-label={`Paso ${i + 1} (${s.from} → ${s.to}) hecho`} />
      <span>Hecho</span>
    </label>
  );
}

/** Progreso: pasos hechos y nivel alcanzado (el final del último paso hecho sin huecos desde el principio). */
export function RouteProgress({ steps, done, onReset }: { steps: any[]; done: Set<string>; onReset: () => void }) {
  const count = steps.filter((s) => done.has(stepKey(s))).length;
  if (!steps.length) return null;
  let reached = steps[0].from;
  for (const s of steps) { if (!done.has(stepKey(s))) break; reached = s.to; }
  const pctDone = Math.round((count / steps.length) * 100);
  return (
    <div className="rt-progress" aria-live="polite">
      <div className="rt-progress-text">
        <strong>{count} de {steps.length} pasos hechos</strong>
        <span className="muted"> · nivel alcanzado {reached}</span>
        {count > 0 && <button type="button" className="link" onClick={onReset}><ArrowCounterClockwise size={14} aria-hidden="true" />Desmarcar todo</button>}
      </div>
      <div className="pc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctDone} aria-label="Progreso de la ruta">
        <span style={{ width: `${pctDone}%` }} />
      </div>
      <p className="small muted rt-note">Las marcas se guardan solo en este navegador.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Procedencia
// ---------------------------------------------------------------------------

/** Códigos de fuente de Wowhead (recetas). */
const SOURCE_LABEL: Record<number, string> = { 6: 'instructor', 5: 'patrón de vendedor', 2: 'botín', 4: 'misión', 1: 'fabricado', 16: 'otra fuente', 21: 'otra fuente' };

/** Cómo se consigue la receta, con enlace a la página de Wowhead que dice dónde. */
export function HowToLearn({ r }: { r: any }) {
  if (r.availability === 'instructor') {
    const cost = String(r.trainingCost ?? '0'); // cobre como texto (bigint serializado)
    return <>Instructor (nivel {r.learnedAt}){cost !== '0' && <>{' · '}<Money v={{ n: cost, d: '1' }} /></>}</>;
  }
  if (r.availability === 'inicial') return <span title="Wowhead no indica su fuente; se deduce que se conoce al aprender la profesión.">Se conoce al aprender la profesión</span>;
  const labels = [...new Set(((r.sources ?? []) as number[]).map((c) => SOURCE_LABEL[c]).filter(Boolean))];
  const text = labels.length ? labels.join(', ') : 'patrón, botín o misión';
  return (
    <span className="lv-warn-text" title="No la enseña el instructor: hay que conseguir la receta (no está garantizada).">
      {text[0].toUpperCase() + text.slice(1)} (nivel {r.learnedAt})
      {r.wowheadUrl && <> · <a href={`${r.wowheadUrl}#taught-by-item`} target="_blank" rel="noreferrer" className="icon-inline">ver dónde<ArrowSquareOut size={12} aria-hidden="true" /></a></>}
    </span>
  );
}

const soldByUrl =(itemId: number) => `https://www.wowhead.com/forever/item=${itemId}#sold-by`;

/** Etiqueta de procedencia del precio de un material (manual / vendedor con enlace a quién lo vende). */
export function PriceTag({ m }: { m: any }) {
  if (m.priceSource === 'manual') return <span className="lv-manual" title="Precio indicado por ti">manual</span>;
  if (m.priceSource === 'vendedor') {
    return <a className="lv-manual" href={soldByUrl(m.itemId)} target="_blank" rel="noreferrer" title="Lo vende un PNJ (más barato que la casa de subastas). Abre en Wowhead quién lo vende.">vendedor</a>;
  }
  return null;
}

const WHERE = (m: any) => (m.priceSource === 'vendedor' ? 'Vendedor' : m.priceSource === 'manual' ? 'Precio tuyo' : 'Casa de subastas');

// ---------------------------------------------------------------------------
// Lista de compra
// ---------------------------------------------------------------------------

interface ShopRow { itemId: number; name: string | null; quality: string | null; quantity: bigint; unitPrice: Q | null; cost: Q | null; priceSource: string | null }

/** Materiales de los pasos sin marcar, agrupados (para «Solo lo que falta»). */
function remainingShopping(steps: any[], done: Set<string>): ShopRow[] {
  const by = new Map<number, ShopRow>();
  for (const s of steps) {
    if (!s.recipe || done.has(stepKey(s))) continue;
    for (const m of s.materials) {
      const cost = toQ(m.cost);
      const prev = by.get(m.itemId);
      if (prev) { prev.quantity += BigInt(m.quantity); prev.cost = prev.cost && cost ? prev.cost.add(cost) : null; }
      else by.set(m.itemId, { itemId: m.itemId, name: m.name, quality: m.quality, quantity: BigInt(m.quantity), unitPrice: toQ(m.unitPrice), cost, priceSource: m.priceSource });
    }
  }
  return [...by.values()].sort((a, b) => (b.cost && a.cost ? b.cost.cmp(a.cost) : 0));
}
const fromApi = (m: any): ShopRow => ({ itemId: m.itemId, name: m.name, quality: m.quality, quantity: BigInt(m.quantity), unitPrice: toQ(m.unitPrice), cost: toQ(m.cost), priceSource: m.priceSource });

const nameOf = (m: ShopRow) => m.name ?? `Objeto ${m.itemId}`;

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* sin permiso: método antiguo */ }
  try {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch { return false; }
}

/** Lista de compra con «Solo lo que falta», copiar como texto y descargar CSV. */
export function ShoppingPanel({ d, done }: { d: any; done: Set<string> }) {
  const anyDone = d.steps.some((s: any) => done.has(stepKey(s)));
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [copied, setCopied] = useState<'ok' | 'error' | null>(null);
  const missing = onlyMissing && anyDone;
  const rows: ShopRow[] = useMemo(() => (missing ? remainingShopping(d.steps, done) : d.shopping.map(fromApi)), [missing, d, done]);
  const total = rows.every((r) => r.cost) ? rows.reduce((acc, r) => acc.add(r.cost!), Q.zero) : null;
  const title = `${d.profession.name} ${d.from} → ${d.to}`;

  const asText = () => [`Lista de compra · ${title}${missing ? ' (lo que falta)' : ''}`, ...rows.map((m) => `${String(m.quantity)} × ${nameOf(m)}`)].join('\n');
  const asCsv = () => toCsv(['Material', 'Id', 'Cantidad', 'Precio unidad (oro)', 'Total (oro)', 'Dónde'],
    rows.map((m) => [nameOf(m), String(m.itemId), String(m.quantity), goldCell(m.unitPrice), goldCell(m.cost), WHERE(m)]));
  const onCopy = async () => { setCopied((await copyText(asText())) ? 'ok' : 'error'); setTimeout(() => setCopied(null), 2500); };
  const slug = `${d.profession.name}-${d.from}-${d.to}`.toLowerCase().normalize('NFD').replace(/[^a-z0-9-]+/g, '');

  return (
    <section className="card lv-shop">
      <div className="rt-shop-tools">
        {anyDone && (
          <label className="check"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />Solo lo que falta (sin los pasos hechos)</label>
        )}
        <div className="rt-shop-buttons">
          <button type="button" onClick={onCopy} disabled={!rows.length}>{copied === 'ok' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied === 'ok' ? 'Copiado' : 'Copiar lista'}</button>
          <button type="button" onClick={() => downloadCsv(`lista-compra-${slug}${missing ? '-falta' : ''}.csv`, asCsv())} disabled={!rows.length}><DownloadSimple size={16} aria-hidden="true" />Descargar CSV</button>
        </div>
        <span className="sr-only" aria-live="polite">{copied === 'ok' ? 'Lista copiada al portapapeles' : copied === 'error' ? 'No se pudo copiar' : ''}</span>
        {copied === 'error' && <span className="small lv-error">No se pudo copiar: el navegador no lo permite.</span>}
      </div>
      {!rows.length ? <p className="muted rt-empty">{missing ? 'Ya tienes hechos todos los pasos con materiales.' : 'No hay materiales con precio para comprar.'}</p> : (
        <table className="lv-shop-table">
          <thead><tr><th>Material</th><th className="num">Cantidad</th><th className="num">Total</th><th className="rt-where">Dónde</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.itemId}>
                <td><ItemLabel id={m.itemId} quality={m.quality} px={24} href={`#/materiales/${m.itemId}`} name={nameOf(m)} /></td>
                <td className="num">{String(m.quantity)}</td>
                <td className="num"><Money v={m.cost?.toJSON()} /><span className="lv-unit"><Money v={m.unitPrice?.toJSON()} /> c/u</span><span className="lv-unit rt-where-m">{WHERE(m)}</span></td>
                <td className="small rt-where">
                  {m.priceSource === 'vendedor'
                    ? <a href={soldByUrl(m.itemId)} target="_blank" rel="noreferrer" className="icon-inline">Vendedor<ArrowSquareOut size={12} aria-hidden="true" /></a>
                    : WHERE(m)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th colSpan={2}>{missing ? 'Total de lo que falta' : 'Total materiales'}</th><td className="num"><Money v={total?.toJSON()} /></td><td className="rt-where" /></tr></tfoot>
        </table>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Otras recetas para un paso
// ---------------------------------------------------------------------------

const COLOR_ES: Record<string, string> = { naranja: 'naranja', amarillo: 'amarillo', verde: 'verde', gris: 'gris' };

/** Otras recetas que dan puntos al empezar el paso y botón para no usar la elegida. */
export function StepAlternatives({ s, onAvoid }: { s: any; onAvoid?: (spellId: number, name: string) => void }) {
  if (!s.recipe) return null;
  const alts: any[] = s.alternatives ?? [];
  if (!alts.length && !onAvoid) return null;
  return (
    <details className="rt-alts">
      <summary><ArrowsLeftRight size={14} aria-hidden="true" />Otras recetas para este paso{alts.length ? ` (${alts.length})` : ''}</summary>
      {alts.length ? (
        <ul className="rt-alts-list">
          {alts.map((a) => (
            <li key={a.spellId}>
              <a href={a.wowheadUrl} target="_blank" rel="noreferrer">{a.name ?? a.createsName ?? a.nameEn}</a>
              <span className={`skill skill-${a.color}`}>{COLOR_ES[a.color] ?? a.color}</span>
              <span className="muted small">{a.costPerPoint ? <><Money v={a.costPerPoint} /> por punto</> : 'sin precio'}</span>
              {a.availability === 'otra' && <span className="badge b-warn" title="No la enseña el instructor">patrón</span>}
            </li>
          ))}
        </ul>
      ) : <p className="small muted">No hay otra receta disponible en este nivel con las opciones elegidas.</p>}
      <p className="small muted">En el nivel {s.from}, la elegida cuesta {s.costPerPointAtStart ? <><Money v={s.costPerPointAtStart} /> por punto</> : 'sin datos'}. Costo esperado por punto = materiales de una fabricación ÷ probabilidad de subir; cambia a medida que la receta pierde color.</p>
      {onAvoid && (
        <button type="button" className="rt-avoid" onClick={() => onAvoid(s.recipe.spellId, s.recipe.name ?? s.recipe.nameEn)}>
          <Prohibit size={16} aria-hidden="true" />Evitar esta receta y recalcular
        </button>
      )}
    </details>
  );
}

export interface Avoided { id: number; name: string }

/** Recetas evitadas, con «Permitir de nuevo». */
export function AvoidedList({ list, onRemove, onClear }: { list: Avoided[]; onRemove: (id: number) => void; onClear: () => void }) {
  if (!list.length) return null;
  return (
    <div className="card rt-avoided" aria-label="Recetas evitadas">
      <span className="small"><Prohibit size={14} aria-hidden="true" /> Recetas que no se usan en esta ruta:</span>
      {list.map((a) => (
        <span key={a.id} className="lv-chip">{a.name}<button type="button" className="link" onClick={() => onRemove(a.id)} aria-label={`Permitir de nuevo ${a.name}`}>Permitir</button></span>
      ))}
      {list.length > 1 && <button type="button" className="link" onClick={onClear}>Permitir todas</button>}
    </div>
  );
}
