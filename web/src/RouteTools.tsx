/**
 * Herramientas comunes a las rutas de subida («Subir nivel» y «Mi personaje»): marcar pasos hechos (se guarda en
 * este navegador), lista de compra con «solo lo que falta», copiar y descargar CSV, procedencia de recetas y
 * materiales, y otras recetas posibles en cada paso («Evitar esta receta»).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Money, Q, toQ } from './lib.js';
import { ItemLabel } from './icons.js';
import { downloadCsv, goldCell, toCsv } from './csv.js';
import { ArrowSquareOut, ArrowCounterClockwise, Copy, DownloadSimple, Check, Prohibit, ArrowsLeftRight, Recycle, Warning, BookOpen } from '@phosphor-icons/react';

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
  if (r.recipeItem) return <RecipeItemInfo ri={r.recipeItem} learnedAt={r.learnedAt} />;
  const labels = [...new Set(((r.sources ?? []) as number[]).map((c) => SOURCE_LABEL[c]).filter(Boolean))];
  const text = labels.length ? labels.join(', ') : 'patrón, botín o misión';
  return (
    <span className="lv-warn-text" title="No la enseña el instructor: hay que conseguir la receta (no está garantizada).">
      {text[0].toUpperCase() + text.slice(1)} (nivel {r.learnedAt})
      {r.wowheadUrl && <> · <a href={`${r.wowheadUrl}#taught-by-item`} target="_blank" rel="noreferrer" className="icon-inline">ver dónde<ArrowSquareOut size={12} aria-hidden="true" /></a></>}
    </span>
  );
}

const OBTAIN_LINK: Record<string, string> = { vendedor: 'quién la vende y dónde', 'botín': 'quién la suelta', 'misión': 'qué misión la da', fabricado: 'quién la fabrica', otra: 'dónde se consigue' };
const OBTAIN_TEXT: Record<string, string> = { vendedor: 'se compra a un vendedor', 'botín': 'cae de botín', 'misión': 'recompensa de misión', fabricado: 'la fabrica otro jugador', otra: 'otra fuente' };

/** Objeto de receta que hay que conseguir (no la enseña el instructor): nombre, cómo se consigue, precio y dónde. */
export function RecipeItemInfo({ ri, learnedAt, long }: { ri: any; learnedAt: number; long?: boolean }) {
  return (
    <span className="lv-warn-text rt-learn" title="No la enseña el instructor: hay que conseguir este objeto y usarlo para aprender la receta.">
      {long ? 'Necesitas el objeto de receta ' : 'Necesita '}
      <a href={ri.wowheadUrl} target="_blank" rel="noreferrer" className="icon-inline">«{ri.nameEn}»<ArrowSquareOut size={12} aria-hidden="true" /></a>
      {' '}(nivel {learnedAt}).{' '}
      {ri.obtain.length ? ri.obtain.map((o: any, i: number) => (
        <React.Fragment key={o.how}>
          {i > 0 && '; '}
          {i === 0 ? OBTAIN_TEXT[o.how][0].toUpperCase() + OBTAIN_TEXT[o.how].slice(1) : OBTAIN_TEXT[o.how]}
          {o.how === 'vendedor' && ri.buyPrice && <> por <Money v={{ n: ri.buyPrice, d: '1' }} /></>}
          {' · '}<a href={o.url} target="_blank" rel="noreferrer" className="icon-inline">{OBTAIN_LINK[o.how]}<ArrowSquareOut size={12} aria-hidden="true" /></a>
        </React.Fragment>
      )) : <a href={ri.wowheadUrl} target="_blank" rel="noreferrer">Dónde se consigue</a>}
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

/** Material de un paso: cantidad, nombre, dónde se compra y cuánto sale de lo fabricado en pasos anteriores. */
export function MatChip({ m }: { m: any }) {
  const prev = BigInt(m.fromSteps ?? 0);
  return (
    <li className="lv-chip">
      <span className="mono">{String(m.quantity)} ×</span>
      <ItemLabel id={m.itemId} quality={m.quality} px={18} name={m.name ?? `Objeto ${m.itemId}`} />
      <PriceTag m={m} />
      {prev > 0n && (
        <span className="lv-reuse" title="Lo fabricas en un paso anterior de esta ruta: no hace falta comprarlo">
          <Recycle size={12} aria-hidden="true" />{prev >= BigInt(m.quantity) ? 'de pasos anteriores' : `${String(prev)} de pasos anteriores`}
        </span>
      )}
    </li>
  );
}

/**
 * Resumen de la ruta como en una guía: tramo de niveles, receta, fabricaciones y materiales por fabricación.
 * Pulsar una fila lleva al detalle del paso.
 */
export function RouteGuide({ steps, done, onOpen }: { steps: any[]; done: Set<string>; onOpen: (i: number) => void }) {
  return (
    <div className="table-wrap">
      <table className="responsive rt-guide">
        <caption className="sr-only">Resumen de la ruta: qué fabricar en cada tramo de niveles</caption>
        <thead><tr><th>Niveles</th><th>Receta</th><th className="num">Fabricaciones</th><th>Materiales por fabricación</th><th className="num">Costo</th></tr></thead>
        <tbody>
          {steps.map((s, i) => {
            const crafts = s.crafts ? BigInt(s.crafts) : 0n;
            return (
              <tr key={i} className={done.has(stepKey(s)) ? 'rt-guide-done' : undefined}>
                <td data-label="Niveles" className="mono rt-guide-lvl">{s.from} → {s.to}{done.has(stepKey(s)) && <Check size={14} weight="bold" aria-label=" (hecho)" />}</td>
                {s.recipe ? (
                  <>
                    <td data-label="Receta" className="cell-main">
                      <button type="button" className="link rt-guide-recipe" onClick={() => onOpen(i)} title="Ver el detalle de este paso">
                        <ItemLabel id={s.recipe.createsItemId} quality={s.recipe.createsQuality} px={24} name={s.recipe.name ?? s.recipe.nameEn} />
                      </button>
                      {s.fillsTrainerGap && <span className="badge b-info rt-pattern" title="El instructor no enseña ninguna receta para estos niveles">patrón</span>}
                      {s.inGuide === false && s.recipe && <span className="badge rt-pattern" title="La guía no cubre estos niveles: receta de la ruta más rápida">calculado</span>}
                      {s.recipe?.availability === 'otra' && <div className="small rt-need"><HowToLearn r={s.recipe} /></div>}
                    </td>
                    <td data-label="Fabricaciones" className="num mono">{String(s.crafts)}{!s.certain && <span className="rt-guide-approx" title="Estimado: parte del tramo es amarillo o verde y no siempre da punto">≈</span>}</td>
                    <td data-label="Por fabricación">
                      <ul className="rt-guide-mats">
                        {s.materials.map((m: any) => (
                          <li key={m.itemId}>
                            <span className="mono">{crafts > 0n ? String(BigInt(m.quantity) / crafts) : '—'}</span>
                            <ItemLabel id={m.itemId} quality={m.quality} px={18} name={m.name ?? `Objeto ${m.itemId}`} />
                            {BigInt(m.fromSteps ?? 0) > 0n && <Recycle size={13} className="rt-reuse-icon" aria-label="(fabricado en un paso anterior)" />}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td data-label="Costo" className="num"><Money v={s.cost} /></td>
                  </>
                ) : (
                  <td colSpan={4} className="rt-guide-gap"><Warning size={16} weight="bold" aria-hidden="true" />Sin datos para estos niveles: mira el detalle.</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Aviso cuando la ruta usa recetas de patrón para niveles en los que el instructor no enseña ninguna. */
export function PatternNote({ levels, trainerOnly }: { levels: number; trainerOnly: boolean }) {
  if (!levels || !trainerOnly) return null;
  return (
    <p className="lv-status info">
      <BookOpen size={18} weight="bold" aria-hidden="true" />
      El instructor no enseña recetas que den puntos en {levels} niveles: ahí se usan recetas de patrón, botín o misión (marcadas «patrón»). Cada paso dice dónde se consigue.
    </p>
  );
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
      // Lo fabricado en pasos anteriores no se compra.
      const buy = BigInt(m.quantity) - BigInt(m.fromSteps ?? 0);
      if (buy <= 0n) continue;
      const cost = toQ(m.cost);
      const prev = by.get(m.itemId);
      if (prev) { prev.quantity += buy; prev.cost = prev.cost && cost ? prev.cost.add(cost) : null; }
      else by.set(m.itemId, { itemId: m.itemId, name: m.name, quality: m.quality, quantity: buy, unitPrice: toQ(m.unitPrice), cost, priceSource: m.priceSource });
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
