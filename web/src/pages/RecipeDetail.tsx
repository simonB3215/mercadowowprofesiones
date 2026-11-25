import React, { useEffect, useState } from 'react';
import { api, useApp, useAsync, money, pct, toQ, exactGold, StatusBadge, STATUS_HELP, priceSource, PctShort, Loading, ErrorBox, GoldInput, addToDraft, dt, age, hoursSince, formatMoney, Q, Delta, Money } from '../lib.js';
import { ItemLabel, WowIcon, useAsset, QualityText } from '../icons.js';
import { PriceHistory, SupplyText } from '../PriceHistory.js';
import { FavButton } from '../favorites.js';
import { PriceAlertButton } from '../priceAlerts.js';
import { RecipeItemInfo } from '../RouteTools.js';
import { BuyOrCraftCard } from '../BuyOrCraft.js';
import { ArrowLeft, ArrowSquareOut, Calculator, ArrowCounterClockwise, FloppyDisk, Plus, ListChecks, Hourglass, Coins, Tag, TrendUp, ChartLineUp } from '@phosphor-icons/react';
import { cooldownLabel, durationLabel, minTimeForRuns } from '../../../src/engine/cooldown.js';
import { t } from '../i18n.js';
import { NoSales } from '../verdict.js';

function backHref() {
  try { return sessionStorage.getItem('lastComparator') ?? '#/'; } catch { return '#/'; }
}

function Breakdown({ e, title }: { e: any; title: string }) {
  const p = e.profit;
  const c = e.cost;
  return (
    <section className="card" aria-label={title}>
      <h2 style={{ marginTop: 0 }}>{title} {e.manual ? <span className="badge b-info">{t('Valores manuales')}</span> : e.edited ? <span className="badge b-info">{t('Editado')}</span> : null}</h2>
      <p><StatusBadge s={e.status} /></p>
      <ul className="reasons">{e.reasons.map((r: string, i: number) => <li key={i}>{t(r)}</li>)}</ul>
      <dl className="kv">
        <dt>{t('Ejecuciones')}</dt><dd>{e.runs}</dd>
        {e.cooldown > 0 && <><dt>{t('Reutilización')}</dt><dd>{cooldownLabel(e.cooldown)}{' '}{t('entre fabricaciones')}{' '}<span className="small muted">{t('(Wowhead;')}{' '}{e.runs > 1 ? t('{n} ejecuciones tardan al menos {d}', { n: e.runs, d: durationLabel(minTimeForRuns(e.runs, e.cooldown)) }) : t('no se puede repetir seguida')})</span></dd></>}
        <dt>{t('Unidades producidas')}</dt><dd>{e.unitsPerRun !== null ? t('{a} ({b} por ejecución)', { a: e.unitsPerRun * e.runs, b: e.unitsPerRun }) : t('desconocido')}</dd>
        <dt>{t('Costo de materiales')}</dt><dd><Money v={c.materials} /></dd>
        <dt>{t('Costo del lote')}</dt><dd><Money v={c.batch} /></dd>
        <dt>{t('Costo por unidad')}</dt><dd><Money v={c.unit} /></dd>
        <dt>{t('Lo que tienes que comprar')}</dt><dd><Money v={c.outOfPocket} /> <span className="small muted">{t('(descontado lo que ya tienes en el perfil)')}</span></dd>
        <dt>{t('Precio de venta usado')}</dt><dd><Money v={e.sellPrice.copper} /> <span className="small muted">{priceSource(e.sellPrice.field, e.sellPrice.scope)}</span>{e.sellPrice.supply && <div className="small"><SupplyText s={e.sellPrice.supply} /></div>}</dd>
        <dt>{t('Cobras al vender (menos comisión)')}</dt><dd><Money v={p.netRevenue} /></dd>
        <dt>{t('Ganancia estimada por lote')}</dt><dd><Delta v={p.profitBatch} /></dd>
        <dt>{t('Ganancia estimada por unidad')}</dt><dd><Delta v={p.profitUnit} /></dd>
        <dt>{t('ROI (ganancia ÷ costo)')}</dt><dd>{p.roiUndefined ? t('no definido (costo cero)') : <PctShort v={p.roiPct} />}</dd>
        <dt>{t('Precio mínimo sin perder')}</dt><dd><Money v={p.breakEven} /></dd>
        <dt>{t('Precio para tu objetivo')}</dt><dd><Money v={p.targetPrice} /></dd>
        <dt>{t('Publícalo como mínimo a')}</dt><dd>{p.minListPrice ? <><Money v={{ n: String(p.minListPrice), d: '1' }} /> {t('(redondeado al cobre superior)')}</> : '—'}</dd>
        <dt>{t('Capital necesario')}</dt><dd><Money v={p.capitalRequired} /> <span className="small muted">{t('(costo + depósitos)')}</span></dd>
      </dl>
      {e.dropScenario && (
        <div className="alert info" style={{ marginTop: 10 }}>
          <p><strong>{t('Con caída del')}{' '}{e.dropScenario.drop} %:</strong>{' '}{t('precio')}{' '}<Money v={e.dropScenario.price} />{' '}{t('→ ganancia por lote')}{' '}<Money v={e.dropScenario.profit.profitBatch} />{t(', por unidad')}{' '}<Money v={e.dropScenario.profit.profitUnit} />.</p>
        </div>
      )}
      {e.notes.length > 0 && <details style={{ marginTop: 8 }}><summary>{t('Notas y limitaciones (')}{e.notes.length})</summary><ul className="reasons small">{e.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></details>}
    </section>
  );
}

function SourcingNode({ n, depth = 0 }: { n: any; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 14 }} className="small">
      <strong>{n.choice === 'fabricar' ? t('Fabricar') : n.choice === 'comprar' ? t('Comprar') : t('Sin datos')}</strong> · <Money v={n.unitCost} />{' '}{t('/unid.')}{' '}<span className="muted">{t('(compra')}{' '}<Money v={n.buyPrice} />{' '}{t('· fabricación')}{' '}<Money v={n.craftCost} />)</span>
      {n.cycle && <span className="badge b-warn" style={{ marginLeft: 6 }}>{t('Ciclo detectado')}</span>}
      {n.note && <span className="muted"> — {n.note}</span>}
      {n.choice === 'fabricar' && (n.children ?? []).map((c: any, i: number) => (
        <div key={i}><span className="muted icon-inline"><WowIcon id={Number(c.node.itemKey) || null} px={18} />{c.quantity}{' '}{t('× objeto')}{' '}{c.node.itemKey}:</span> <SourcingNode n={c.node} depth={depth + 1} /></div>
      ))}
    </div>
  );
}

/** Encabezado del detalle: icono grande del resultado y enlace a su ficha de Wowhead (si está verificada). */
function RecipeHeader({ e }: { e: any }) {
  const a = useAsset('item', e.output?.itemId, 'large');
  return (
    <div className="card title-with-icon" style={{ alignItems: 'center' }}>
      <WowIcon id={e.output?.itemId} px={56} quality={e.output?.quality} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1 style={{ margin: 0 }}>{e.name}</h1>
        <p className="muted small icon-inline" style={{ margin: '4px 0 0', flexWrap: 'wrap' }}>
          <WowIcon kind="profession" id={e.professionId} px={18} />
          {e.profession}{e.tier && e.tier !== e.profession ? ` · ${e.tier}` : ''}{e.category ? ` · ${e.category}` : ''}
        </p>
      </div>
      <div className="row" style={{ alignItems: 'center' }}>
        <FavButton id={e.recipeId} name={e.name} withLabel />
        {e.output?.itemId && <PriceAlertButton itemId={e.output.itemId} name={e.output.name ?? e.name} price={toQ(e.sellPrice?.copper)} />}
        <StatusBadge s={e.status} />
        {e.cooldown > 0 && <span className="badge b-info" title={t('Tiempo de reutilización (Wowhead)')}><Hourglass size={12} weight="bold" aria-hidden="true" />{t('1 cada')}{' '}{cooldownLabel(e.cooldown)}</span>}
        {a?.page && <a className="icon-inline small" href={a.page} target="_blank" rel="noopener noreferrer">{t('Ficha en Wowhead')}<ArrowSquareOut size={14} aria-hidden="true" /><span className="sr-only">{t('(se abre en otra pestaña)')}</span></a>}
      </div>
    </div>
  );
}

/** Lo esencial de la receta en una frase y cuatro cifras: cuánto cuesta, por cuánto se vende, cuánto queda y cuánto se vende. */
function Summary({ e, commission }: { e: any; commission: string }) {
  const profit = toQ(e.profit.profitUnit);
  const per = e.unitsPerRun && e.unitsPerRun !== 1 ? ` ${t('por unidad')}` : '';
  const sold = e.demand?.soldPerDay;
  return (
    <section className="card rd-summary" aria-label={t('Resumen')}>
      <h2 style={{ marginTop: 0 }}>{t('En resumen')}</h2>
      <div className="rd-figs">
        <div><span className="rd-fig-label"><Coins size={16} aria-hidden="true" />{t('Fabricarla cuesta')}{per}</span><span className="rd-fig"><Money v={e.cost.unit} /></span>
          <span className="small muted">{t('materiales con los precios actuales')}</span></div>
        <div><span className="rd-fig-label"><Tag size={16} aria-hidden="true" />{t('Se vende por')}</span><span className="rd-fig"><Money v={e.sellPrice.copper} /></span>
          <span className="small muted">{priceSource(e.sellPrice.field, e.sellPrice.scope)}</span></div>
        <div><span className="rd-fig-label"><TrendUp size={16} aria-hidden="true" />{t('Te queda')}{per}</span><span className="rd-fig"><Delta v={e.profit.profitUnit} /></span>
          <span className="small muted">{t('tras la comisión de la subasta (')}{Math.round(Number(commission) * 100)} %)</span></div>
        <div><span className="rd-fig-label"><ChartLineUp size={16} aria-hidden="true" />{t('Ventas en la región')}</span><span className="rd-fig">{sold != null ? t('{n} al día', { n: sold }) : '—'}</span>
          <span className="small muted">{sold == null ? <NoSales why={e.noSales} /> : sold < 1 ? t('pocas: puede tardar en venderse') : t('se vende con regularidad')}</span></div>
      </div>
      <div className="rd-verdict">
        <StatusBadge s={e.status} />
        <span>{t(STATUS_HELP[e.status as keyof typeof STATUS_HELP])}</span>
      </div>
      {e.sellPrice.supply?.auctions === 1 && <p className="small lv-error" style={{ margin: '8px 0 0' }}>{t('Solo hay una publicación del objeto: el precio de venta es poco fiable.')}</p>}
      {!profit && <p className="small muted" style={{ margin: '8px 0 0' }}>{t('No se puede calcular la ganancia:')}{' '}{e.reasons[0]}</p>}
    </section>
  );
}

/** Si hace falta comprar o conseguir la receta (objeto de patrón, diseño…) y dónde; o si la enseña el instructor. */
function LearnCard({ l }: { l: any }) {
  let body: React.ReactNode;
  if (!l) body = <span className="muted">{t('No se pudo enlazar con los datos de Wowhead: revisa la ficha de la receta.')}</span>;
  else if (l.availability === 'instructor') body = <>{t('No necesita objeto de receta: la enseña el instructor de la profesión desde el nivel')}{' '}{l.learnedAt}{l.trainingCost !== '0' && <>{' '}{t('por')}{' '}<Money v={{ n: l.trainingCost, d: '1' }} /></>}.</>;
  else if (l.availability === 'inicial') body = <>{t('No necesita objeto de receta: se conoce al aprender la profesión.')}</>;
  else if (l.recipeItem) body = <RecipeItemInfo ri={l.recipeItem} learnedAt={l.learnedAt} long />;
  else body = <span className="lv-warn-text">{t('Necesita un objeto de receta (patrón, botín o misión), nivel')}{' '}{l.learnedAt}. <a href={`${l.wowheadUrl}#taught-by-item`} target="_blank" rel="noreferrer" className="icon-inline">{t('Ver en Wowhead cuál y dónde')}<ArrowSquareOut size={12} aria-hidden="true" /></a></span>;
  return (
    <section className="card rd-learn" aria-label={t('Cómo se aprende')}>
      <h2 style={{ marginTop: 0 }}>{t('¿Necesita receta?')}</h2>
      <p style={{ margin: 0 }}>{body}</p>
      {l?.recipeItem && <p className="small muted" style={{ margin: '8px 0 0' }}>{t('Datos de Wowhead (WoW Forever). El precio del vendedor no incluye descuentos por reputación; algunas recetas de vendedor tienen existencias limitadas.')}</p>}
    </section>
  );
}

export function RecipeDetail({ id }: { id: number }) {
  const { ctx, ctxQuery, profileId } = useApp();
  const d = useAsync(() => api(`/api/recipes/${id}?${ctxQuery}${profileId ? `&profileId=${profileId}` : ''}`), [id, ctxQuery, profileId]);
  const [ov, setOv] = useState<any>({ prices: {} });
  const [scenario, setScenario] = useState<any>(null);
  const [scErr, setScErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planAmt, setPlanAmt] = useState('1');
  const [planMode, setPlanMode] = useState<'ejecuciones' | 'unidades'>('ejecuciones');
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const recipeKey = `${ctx.version}:${id}`;
  const saved = useAsync(() => api(`/api/scenarios?recipeKey=${encodeURIComponent(recipeKey)}`), [recipeKey]);

  useEffect(() => { setOv({ prices: {} }); setScenario(null); }, [id, ctxQuery]);

  if (!Number.isInteger(id)) return <ErrorBox error={t('Identificador de receta inválido.')} />;
  if (d.loading) return <Loading rows={5} />;
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  const e = d.data.evaluation;

  const calc = async () => {
    setBusy(true);
    setScErr(null);
    try {
      const body: any = { ...ctx, recipeId: id, profileId, overrides: { ...ov, units: ov.units ? Number(ov.units) : undefined, runs: ov.runs ? Number(ov.runs) : undefined } };
      const r = await api('/api/calculate', { method: 'POST', body });
      setScenario(r.scenario);
    } catch (err: any) {
      setScErr(err.message);
    } finally {
      setBusy(false);
    }
  };
  const setP = (k: string, v: string) => setOv((o: any) => ({ ...o, prices: { ...o.prices, [k]: v } }));
  const reset = () => { setOv({ prices: {} }); setScenario(null); };
  const saveScenario = async () => {
    const name = prompt(t('Nombre del escenario'), t('Mi escenario'));
    if (!name) return;
    await api('/api/scenarios', { method: 'POST', body: { recipeKey, name, overrides: ov } });
    saved.reload();
  };
  const addPlan = () => {
    const n = Number(planAmt);
    if (!Number.isInteger(n) || n <= 0) { setPlanMsg(t('La cantidad debe ser un entero mayor que 0.')); return; }
    addToDraft({ recipeId: id, name: e.name, amount: n, mode: planMode });
    setPlanMsg(t('Añadido a la lista de fabricación ({n} {m}).', { n, m: t(planMode) }));
  };

  return (
    <div>
      <p><a className="icon-inline" href={backHref()}><ArrowLeft size={16} aria-hidden="true" />{t('Volver al comparador')}</a></p>
      <RecipeHeader e={e} />
      <Summary e={e} commission={d.data.settings.commission} />
      <LearnCard l={d.data.learn} />
      {e.output && <BuyOrCraftCard recipeId={id} />}

      <div className="grid grid-2">
        <Breakdown e={e} title={scenario ? t('Cálculo con los precios actuales') : t('Cálculo detallado')} />
        {scenario ? <Breakdown e={scenario} title={t('Escenario editado')} /> : (
          <section className="card">
            <h2 style={{ marginTop: 0 }}>{t('El objeto y sus ventas')}</h2>
            <dl className="kv">
              <dt>{t('Objeto')}</dt><dd>{e.output ? <ItemLabel id={e.output.itemId} quality={e.output.quality} px={24} name={e.output.name ?? t('Sin nombre')} /> : t('No produce objeto')}</dd>
              <dt>{t('Calidad')}</dt><dd><QualityText q={e.output?.quality} /></dd>
              <dt>{t('Vinculación')}</dt><dd>{e.output?.binding ? t(e.output.binding) : t('desconocida')}</dd>
              <dt>{t('Canal')}</dt><dd>{e.channel === 'subasta' ? t('Subasta') : e.channel === 'vinculado' ? t('Vinculado (no vendible)') : e.channel === 'servicio' ? t('Servicio / efecto aplicado') : t('Desconocido')}</dd>
              <dt>{t('Motivo')}</dt><dd className="small">{e.channelReason ? t(e.channelReason) : e.channelReason}</dd>
              <dt>{t('Unidades por fabricación')}</dt><dd>{e.yieldRange[0] === null ? t('no informado') : e.yieldRange[0] === e.yieldRange[1] ? t('{n} por ejecución', { n: e.yieldRange[0] }) : `${e.yieldRange[0]}–${e.yieldRange[1]} (${t('variable')})`}</dd>
              <dt>{t('Personaje')}</dt><dd>{t(({ conoce: 'Conoce la receta', no_conoce: 'No la conoce', requisito_no_cumplido: 'No tiene la profesión', sin_perfil: 'Sin perfil: sin confirmar' } as Record<string, string>)[e.character as string] ?? '')}</dd>
            </dl>
            <h3 style={{ marginTop: 12 }}>{t('Ventas en toda la región')}</h3>
            {e.demand ? (
              <>
                <dl className="kv">
                  <dt>{t('Vendidos al día')}</dt><dd>{e.demand.soldPerDay ?? '—'}</dd>
                  <dt>{t('Tasa de venta')}</dt><dd>{e.demand.saleRate ?? '—'} <span className="small muted">{t('(qué parte de lo publicado llega a venderse)')}</span></dd>
                  <dt>{t('Precio medio de venta')}</dt><dd><Money v={e.demand.avgSalePrice} /></dd>
                  <dt>{t('Dato de')}</dt><dd>{dt(e.demand.sourceTime)} ({age(hoursSince(e.demand.sourceTime))})</dd>
                </dl>
                <p className="small muted">{t('Son datos de toda la región (TradeSkillMaster) para comparar recetas; no son las ventas de tu reino ni la probabilidad de vender hoy.')}</p>
              </>
            ) : <p className="muted small">{t('Sin señales de demanda para este objeto.')}</p>}
          </section>
        )}
      </div>

      {e.output?.itemId && e.channel !== 'vinculado' && <PriceHistory itemId={e.output.itemId} title={t('Historial de precio de {x}', { x: e.output.name ?? t('lo fabricado') })} />}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t('Materiales')}</h2>
        <div className="table-wrap">
          <table className="responsive cards-lg">
            <thead><tr><th>{t('Material')}</th><th className="num">{t('Cantidad')}</th><th className="num">{t('Precio usado')}</th><th>{t('Origen del precio')}</th><th className="num">{t('Subtotal')}</th><th className="num">{t('Tienes')}</th><th className="num">{t('A comprar')}</th><th>{t('Tu precio (oro)')}</th></tr></thead>
            <tbody>
              {e.reagents.map((r: any) => (
                <tr key={r.itemId}>
                  <td data-label={t('Material')} className="cell-main"><ItemLabel id={r.itemId} href={`#/materiales/${r.itemId}`} name={r.name ?? t('Objeto {id}', { id: r.itemId })} sub={r.variants.length ? t('hay otro objeto con el mismo nombre') : undefined} /></td>
                  <td data-label={t('Cantidad')} className="num">{r.quantity === null ? '—' : r.quantity * e.runs}</td>
                  <td data-label={t('Precio usado')} className="num"><Money v={r.price.copper} />{r.price.supply && <div className="small"><SupplyText s={r.price.supply} /></div>}</td>
                  <td data-label={t('Origen del precio')} className="small">{priceSource(r.price.field, r.price.scope)}{r.price.sourceTime ? ` · ${t('hace {a}', { a: age(hoursSince(r.price.sourceTime)) })}` : ''}</td>
                  <td data-label={t('Subtotal')} className="num"><Money v={r.subtotal} /></td>
                  <td data-label={t('Tienes')} className="num">{r.owned}</td>
                  <td data-label={t('A comprar')} className="num">{r.toBuy}</td>
                  <td data-label={t('Tu precio')}>
                    <input type="text" inputMode="decimal" aria-label={t('Precio manual de {x} en oro', { x: r.name ?? r.itemId })} style={{ width: 100 }} value={ov.prices?.[r.itemId] ?? ''} onChange={(ev) => setP(String(r.itemId), ev.target.value)} placeholder={t('oro')} />
                  </td>
                </tr>
              ))}
              {!e.reagents.length && <tr><td colSpan={8} className="empty">{t('La receta no tiene ingredientes registrados: el costo queda como desconocido.')}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="small muted">{t('¿Lo consigues más barato o ya lo tienes? Escribe tu precio en «Tu precio» y pulsa «Recalcular» en «¿Y si cambian los precios?». El costo es estimado: puede que no haya suficientes unidades a ese precio.')}</p>
      </section>

      <details className="card rd-fold" open={Boolean(scenario) || undefined}>
        <summary><h2>{t('¿Y si cambian los precios?')}</h2><span className="small muted">{t('Prueba otro precio de venta, una bajada de precio o costos extra')}</span></summary>
        <p className="small muted">{t('Escribe solo lo que quieras cambiar y pulsa «Recalcular». Los datos reales no se modifican; el resultado aparece junto al cálculo detallado.')}</p>
        <div className="grid grid-3">
          <GoldInput label={t('Precio de venta (oro/unidad)')} value={ov.sellPrice ?? ''} onChange={(v) => setOv({ ...ov, sellPrice: v })} placeholder={money(e.sellPrice.copper)} />
          <GoldInput label={t('Caída del precio (%)')} value={ov.priceDrop ?? ''} onChange={(v) => setOv({ ...ov, priceDrop: v })} placeholder={t('p. ej. 15')} />
          <GoldInput label={t('Comisión (decimal)')} value={ov.commission ?? ''} onChange={(v) => setOv({ ...ov, commission: v })} placeholder={d.data.settings.commission} hint="0.05 = 5 %" />
          <GoldInput label={t('Depósitos perdidos (oro/lote)')} value={ov.lostDeposits ?? ''} onChange={(v) => setOv({ ...ov, lostDeposits: v })} placeholder="0" hint={t('Si la subasta caduca sin venderse')} />
          <GoldInput label={t('Depósitos recuperables (oro/lote)')} value={ov.recoverableDeposits ?? ''} onChange={(v) => setOv({ ...ov, recoverableDeposits: v })} placeholder="0" hint={t('Se devuelven al vender')} />
          <GoldInput label={t('Ganancia objetivo (oro/lote)')} value={ov.targetProfit ?? ''} onChange={(v) => setOv({ ...ov, targetProfit: v })} placeholder="0" />
          <GoldInput label={t('Costo adicional (oro/ejecución)')} value={ov.additionalCost ?? ''} onChange={(v) => setOv({ ...ov, additionalCost: v })} placeholder="0" hint={t('Consumibles, desplazamiento…')} />
          <label className="field">{t('Veces que la fabricas')}<input type="number" min={1} step={1} value={ov.runs ?? ''} onChange={(ev) => setOv({ ...ov, runs: ev.target.value })} placeholder="1" />
          </label>
          <label className="field">{t('Unidades por ejecución (manual)')}<input type="number" min={1} step={1} value={ov.units ?? ''} onChange={(ev) => setOv({ ...ov, units: ev.target.value })} placeholder={e.unitsPerRun ?? t('desconocido')} />
          </label>
        </div>
        <label className="check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={Boolean(ov.assumeQuality)} onChange={(ev) => setOv({ ...ov, assumeQuality: ev.target.checked })} />{t('Asumir manualmente que el precio corresponde al objeto obtenido aunque haya otro con el mismo nombre (excluye la recomendación automática)')}</label>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" onClick={calc} disabled={busy}><Calculator size={18} aria-hidden="true" />{busy ? t('Calculando…') : t('Recalcular')}</button>
          <button onClick={reset}><ArrowCounterClockwise size={18} aria-hidden="true" />{t('Volver a los precios reales')}</button>
          <button onClick={saveScenario}><FloppyDisk size={18} aria-hidden="true" />{t('Guardar esta prueba')}</button>
          {(saved.data?.scenarios ?? []).length > 0 && (
            <label className="field">{t('Pruebas guardadas')}<select onChange={(ev) => { const s = saved.data.scenarios.find((x: any) => x.id === ev.target.value); if (s) setOv(s.data); }} defaultValue="">
                <option value="" disabled>{t('Cargar…')}</option>
                {saved.data.scenarios.map((s: any) => <option key={s.id} value={s.id}>{s.name} · {dt(s.updated_at)}</option>)}
              </select>
            </label>
          )}
        </div>
        {scErr && <ErrorBox error={scErr} />}
      </details>

      <details className="card rd-fold">
        <summary><h2>{t('Fórmulas aplicadas')}</h2><span className="small muted">{t('Cómo se calcula cada cifra')}</span></summary>
        <div className="formula">{`C_materiales = Σ(cantidad × precio) = ${money(e.cost.materials)}
C_lote = C_materiales + C_adicional = ${money(e.cost.batch)}
C_unidad = C_lote / unidades = ${money(e.cost.unit)}
Ingreso_neto = Q × P × (1 − t) = ${money(e.profit.netRevenue)}   (t = ${d.data.settings.commission})
Ganancia_lote = Ingreso_neto − C − D = ${money(e.profit.profitBatch)}
ROI = Ganancia_lote / C × 100 = ${e.profit.roiUndefined ? 'no definido' : pct(e.profit.roiPct)}
Precio_equilibrio = (C + D) / (Q × (1 − t)) = ${exactGold(toQ(e.profit.breakEven))}`}</div>
      </details>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t('¿Comprar los materiales o fabricarlos?')}</h2>
        <p className="small muted">{t('Para cada material, si sale más barato comprarlo o fabricarlo tú con otra receta')}{profileId ? t(' que el perfil conoce') : ''}.</p>
        {d.data.sourcing.map((s: any) => (
          <div key={s.itemId} style={{ borderTop: '1px solid var(--color-border)', padding: '8px 0' }}>
            <span className="icon-inline"><WowIcon id={s.itemId} px={22} /><strong>{s.name ?? t('Objeto {id}', { id: s.itemId })}</strong></span> <span className="small muted">({s.recipesAvailable === 0 ? t('ninguna receta lo fabrica') : s.recipesAvailable === 1 ? t('1 receta lo fabrica') : t('{n} recetas lo fabrican', { n: s.recipesAvailable })})</span>
            <SourcingNode n={s.node} />
          </div>
        ))}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t('Añadir a la lista de fabricación')}</h2>
        <p className="small muted">{t('Junta varias recetas en «Fabricación» para ver la compra total de materiales y el oro que necesitas.')}</p>
        <div className="row">
          <label className="field">{t('Cantidad')}<input type="number" min={1} step={1} value={planAmt} onChange={(ev) => setPlanAmt(ev.target.value)} /></label>
          <label className="field">{t('Unidad')}<select value={planMode} onChange={(ev) => setPlanMode(ev.target.value as any)}>
              <option value="ejecuciones">{t('veces que la fabricas')}</option>
              <option value="unidades">{t('unidades del resultado')}</option>
            </select>
          </label>
          <button onClick={addPlan}><Plus size={18} aria-hidden="true" />{t('Añadir')}</button>
          <a className="icon-inline" href="#/plan"><ListChecks size={18} aria-hidden="true" />{t('Ver lista')}</a>
        </div>
        {planMsg && <p className="small" role="status">{planMsg}</p>}
      </section>

      <details className="card">
        <summary>{t('Datos de origen de la receta (respuesta del catálogo)')}</summary>
        <pre className="formula small">{JSON.stringify(d.data.rawRecipe, null, 2)?.slice(0, 6000) ?? t('sin datos')}</pre>
      </details>
    </div>
  );
}
