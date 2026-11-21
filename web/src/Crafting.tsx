/**
 * Cómo se fabrica un objeto: qué recetas lo crean, con qué profesión y nivel, y si la enseña el instructor o hace falta
 * un objeto de receta (patrón, diseño, fórmula…); y si el objeto es material de otras recetas.
 * `compact` para la ventana al pasar el ratón; completo para la página del material.
 */
import React from 'react';
import { api, useAsync, useApp, Money } from './lib.js';
import { WowIcon } from './icons.js';
import { ArrowSquareOut, Hammer } from '@phosphor-icons/react';
import { RecipeWhere, whereText } from './RouteTools.js';

export interface CraftingData { itemId: number; reagentOf: number; createdBy: any[] }

const HOW_ES: Record<string, string> = { vendedor: 'vendedor', 'botín': 'botín', 'misión': 'misión', fabricado: 'fabricada', otra: 'otra fuente' };
/** Texto del enlace a la lista de Wowhead que dice dónde (vendedores y su zona, enemigos que la sueltan, misiones). */
const WHERE_ES: Record<string, string> = { vendedor: 'qué vendedor la vende y en qué zona', 'botín': 'qué enemigos la sueltan', 'misión': 'qué misión la da', fabricado: 'quién la fabrica', otra: 'dónde se consigue' };

/** «Instructor», «Al empezar», «Receta: …» o «Forma de aprenderla desconocida». */
export function learnText(r: any): string {
  if (r.availability === 'instructor') return 'Instructor';
  if (r.availability === 'inicial') return 'Al empezar (sin receta)';
  if (r.availability === 'otra') {
    if (!r.recipeItem) return 'Con receta (objeto)';
    const how = r.recipeItem.obtain.map((o: any) => HOW_ES[o.how] ?? o.how).join(', ');
    const where = whereText(r.recipeItem);
    return `Receta: ${r.recipeItem.nameEn}${how ? ` (${how})` : ''}${where ? ` · ${where}` : ''}`;
  }
  return 'Forma de aprenderla desconocida';
}

const levelText = (r: any) => (r.learnedAt ? `nivel ${r.learnedAt}` : 'nivel desconocido');
const MAX_TIP = 3;

/** Líneas cortas para la ventana del objeto. */
export function CraftingTip({ c }: { c: CraftingData | null | undefined }) {
  if (!c) return null;
  const list = c.createdBy;
  return (
    <div className="it-craft">
      {list.length === 0
        ? <p className="it-muted">No se fabrica con ninguna profesión (se recolecta, cae o se compra).</p>
        : <>
          <p className="it-gold">Se fabrica con:</p>
          {list.slice(0, MAX_TIP).map((r, i) => (
            <p key={i} className="it-craft-row">
              <span>{r.profession} · {levelText(r)}</span>
              <span className="it-muted"> · {learnText(r)}</span>
            </p>
          ))}
          {list.length > MAX_TIP && <p className="it-muted">y {list.length - MAX_TIP} receta{list.length - MAX_TIP > 1 ? 's' : ''} más</p>}
        </>}
      <p className="it-muted">{c.reagentOf > 0 ? `Material: se usa en ${c.reagentOf} receta${c.reagentOf > 1 ? 's' : ''}.` : 'No es material de ninguna receta.'}</p>
    </div>
  );
}

/** Tarjeta completa: recetas que lo crean y si es material. */
export function CraftingCard({ itemId }: { itemId: number }) {
  const { ctx } = useApp();
  const d = useAsync(() => api<CraftingData>(`/api/items/${itemId}/crafting?version=${ctx.version}`), [itemId, ctx.version]);
  const c = d.data;
  return (
    <section className="card" aria-labelledby={`craft-${itemId}`}>
      <h2 id={`craft-${itemId}`} className="icon-inline" style={{ marginTop: 0 }}><Hammer size={20} aria-hidden="true" />Cómo se fabrica</h2>
      {d.loading && <p className="small muted">Cargando…</p>}
      {d.error && <p className="small lv-error">No se pudo cargar.</p>}
      {c && (
        <>
          <p className="small">
            {c.reagentOf > 0 ? <><strong>Es material</strong>: se usa en {c.reagentOf} receta{c.reagentOf > 1 ? 's' : ''}.</> : 'No es material de ninguna receta.'}
            {' '}{c.createdBy.length === 0 ? <><strong>No se fabrica</strong> con ninguna profesión: se recolecta, cae de enemigos o se compra.</> : <>Se fabrica con {c.createdBy.length} receta{c.createdBy.length > 1 ? 's' : ''}:</>}
          </p>
          {c.createdBy.length > 0 && (
            <div className="table-wrap">
              <table className="responsive">
                <thead><tr><th>Receta</th><th>Profesión</th><th className="num">Nivel necesario</th><th>Cómo se aprende</th></tr></thead>
                <tbody>
                  {c.createdBy.map((r, i) => (
                    <tr key={i}>
                      <td data-label="Receta" className="cell-main">
                        {r.recipeId ? <a href={`#/receta/${r.recipeId}`}>{r.name}</a> : r.name}
                        {r.unitsPerCraft > 1 && <div className="small muted">{r.unitsPerCraft} por fabricación</div>}
                      </td>
                      <td data-label="Profesión"><span className="icon-inline"><WowIcon kind="profession" id={r.professionId} px={18} />{r.profession}</span></td>
                      <td data-label="Nivel necesario" className="num">{r.learnedAt ?? '—'}</td>
                      <td data-label="Cómo se aprende">
                        {r.availability === 'instructor' && <>Instructor{r.trainingCost && r.trainingCost !== '0' && <> · <Money v={{ n: r.trainingCost, d: '1' }} /></>}</>}
                        {r.availability === 'inicial' && 'Se sabe al aprender la profesión'}
                        {r.availability === 'otra' && (r.recipeItem
                          ? <>Necesita la receta{' '}
                            <a href={r.recipeItem.wowheadUrl} target="_blank" rel="noreferrer" className="icon-inline"><WowIcon id={r.recipeItem.itemId} px={18} tip={false} />{r.recipeItem.nameEn}<ArrowSquareOut size={12} aria-hidden="true" /></a>
                            {r.recipeItem.obtain.length > 0 && <div className="small">Se consigue: {r.recipeItem.obtain.map((o: any, j: number) => <React.Fragment key={j}>{j > 0 && ' · '}<strong>{HOW_ES[o.how] ?? o.how}</strong> (<a href={o.url} target="_blank" rel="noreferrer" className="icon-inline">ver {WHERE_ES[o.how] ?? 'dónde'}<ArrowSquareOut size={12} aria-hidden="true" /></a>)</React.Fragment>)}{r.recipeItem.buyPrice && <> · <Money v={{ n: r.recipeItem.buyPrice, d: '1' }} /> en el vendedor</>}</div>}
                            {r.recipeItem.where?.length > 0 && <div className="small"><RecipeWhere ri={r.recipeItem} /></div>}
                          </>
                          : <>Necesita una receta (objeto){r.wowheadUrl && <> · <a href={r.wowheadUrl} target="_blank" rel="noreferrer">ver en Wowhead</a></>}</>)}
                        {r.availability === null && <span className="muted">Desconocido (la receta no coincide con los datos de Wowhead)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted" style={{ marginBottom: 0 }}>Nivel y forma de aprenderla: Wowhead (WoW Forever). El nombre de la receta (objeto) va en inglés.</p>
        </>
      )}
    </section>
  );
}
