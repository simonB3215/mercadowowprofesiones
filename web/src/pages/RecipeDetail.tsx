import React, { useEffect, useState } from 'react';
import { api, useApp, useAsync, money, pct, toQ, exactGold, StatusBadge, Loading, ErrorBox, GoldInput, addToDraft, dt, age, hoursSince, formatMoney, Q, Delta, Money } from '../lib.js';
import { ItemLabel, WowIcon, useAsset } from '../icons.js';
import { ArrowLeft, ArrowSquareOut, Calculator, ArrowCounterClockwise, FloppyDisk, Plus, ListChecks } from '@phosphor-icons/react';

function backHref() {
  try { return sessionStorage.getItem('lastComparator') ?? '#/'; } catch { return '#/'; }
}

function Breakdown({ e, title }: { e: any; title: string }) {
  const p = e.profit;
  const c = e.cost;
  return (
    <section className="card" aria-label={title}>
      <h2 style={{ marginTop: 0 }}>{title} {e.manual ? <span className="badge b-info">Valores manuales</span> : e.edited ? <span className="badge b-info">Editado</span> : null}</h2>
      <p><StatusBadge s={e.status} /></p>
      <ul className="reasons">{e.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
      <dl className="kv">
        <dt>Ejecuciones</dt><dd>{e.runs}</dd>
        <dt>Unidades producidas</dt><dd>{e.unitsPerRun !== null ? `${e.unitsPerRun * e.runs} (${e.unitsPerRun} por ejecución)` : 'desconocido'}</dd>
        <dt>Costo de materiales</dt><dd><Money v={c.materials} /></dd>
        <dt>Costo del lote (C)</dt><dd><Money v={c.batch} /></dd>
        <dt>Costo por unidad</dt><dd><Money v={c.unit} /></dd>
        <dt>Desembolso por faltantes</dt><dd><Money v={c.outOfPocket} /> <span className="small muted">(reposición ≠ desembolso)</span></dd>
        <dt>Precio de venta utilizado (P)</dt><dd><Money v={e.sellPrice.copper} /> <span className="small muted">{e.sellPrice.field} · {e.sellPrice.scope}</span></dd>
        <dt>Ingreso neto del lote</dt><dd><Money v={p.netRevenue} /></dd>
        <dt>Ganancia estimada por lote</dt><dd><Delta v={p.profitBatch} /></dd>
        <dt>Ganancia estimada por unidad</dt><dd><Delta v={p.profitUnit} /></dd>
        <dt>ROI</dt><dd>{p.roiUndefined ? 'no definido (costo cero)' : pct(p.roiPct)}</dd>
        <dt>Precio de equilibrio</dt><dd>{exactGold(toQ(p.breakEven))}</dd>
        <dt>Precio para el objetivo</dt><dd>{exactGold(toQ(p.targetPrice))}</dd>
        <dt>Mínimo publicable</dt><dd>{p.minListPrice ? `${formatMoney(Q.of(BigInt(p.minListPrice)))} (redondeado al cobre superior)` : '—'}</dd>
        <dt>Capital necesario</dt><dd><Money v={p.capitalRequired} /> <span className="small muted">(costo + depósitos)</span></dd>
      </dl>
      {e.dropScenario && (
        <div className="alert info" style={{ marginTop: 10 }}>
          <p><strong>Con caída del {e.dropScenario.drop} %:</strong> precio <Money v={e.dropScenario.price} /> → ganancia por lote <Money v={e.dropScenario.profit.profitBatch} />, por unidad <Money v={e.dropScenario.profit.profitUnit} />.</p>
        </div>
      )}
      {e.notes.length > 0 && <details style={{ marginTop: 8 }}><summary>Notas y limitaciones ({e.notes.length})</summary><ul className="reasons small">{e.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></details>}
    </section>
  );
}

function SourcingNode({ n, depth = 0 }: { n: any; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 14 }} className="small">
      <strong>{n.choice === 'fabricar' ? 'Fabricar' : n.choice === 'comprar' ? 'Comprar' : 'Sin datos'}</strong> · <Money v={n.unitCost} /> /unid.
      {' '}<span className="muted">(compra <Money v={n.buyPrice} /> · fabricación <Money v={n.craftCost} />)</span>
      {n.cycle && <span className="badge b-warn" style={{ marginLeft: 6 }}>Ciclo detectado</span>}
      {n.note && <span className="muted"> — {n.note}</span>}
      {n.choice === 'fabricar' && (n.children ?? []).map((c: any, i: number) => (
        <div key={i}><span className="muted icon-inline"><WowIcon id={Number(c.node.itemKey) || null} px={18} />{c.quantity} × objeto {c.node.itemKey}:</span> <SourcingNode n={c.node} depth={depth + 1} /></div>
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
          {e.profession}{e.tier ? ` · ${e.tier}` : ''}{e.category ? ` · ${e.category}` : ''} · receta {e.recipeId}
        </p>
      </div>
      <div className="row" style={{ alignItems: 'center' }}>
        <StatusBadge s={e.status} />
        {a?.page && <a className="icon-inline small" href={a.page} target="_blank" rel="noopener noreferrer">Ficha en Wowhead<ArrowSquareOut size={14} aria-hidden="true" /><span className="sr-only">(se abre en otra pestaña)</span></a>}
      </div>
    </div>
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

  if (!Number.isInteger(id)) return <ErrorBox error="Identificador de receta inválido." />;
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
    const name = prompt('Nombre del escenario', 'Mi escenario');
    if (!name) return;
    await api('/api/scenarios', { method: 'POST', body: { recipeKey, name, overrides: ov } });
    saved.reload();
  };
  const addPlan = () => {
    const n = Number(planAmt);
    if (!Number.isInteger(n) || n <= 0) { setPlanMsg('La cantidad debe ser un entero mayor que 0.'); return; }
    addToDraft({ recipeId: id, name: e.name, amount: n, mode: planMode });
    setPlanMsg(`Añadido a la lista de fabricación (${n} ${planMode}).`);
  };

  return (
    <div>
      <p><a className="icon-inline" href={backHref()}><ArrowLeft size={16} aria-hidden="true" />Volver al comparador</a></p>
      <RecipeHeader e={e} />

      <div className="grid grid-2">
        <Breakdown e={e} title="Escenario base (datos de origen)" />
        {scenario ? <Breakdown e={scenario} title="Escenario editado" /> : (
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Resultado y canal de venta</h2>
            <dl className="kv">
              <dt>Objeto</dt><dd>{e.output ? <ItemLabel id={e.output.itemId} quality={e.output.quality} px={24} name={e.output.name ?? 'Sin nombre'} sub={`ID ${e.output.itemId}`} /> : 'No produce objeto'}</dd>
              <dt>Calidad</dt><dd>{e.output?.quality ?? 'desconocida'}</dd>
              <dt>Vinculación</dt><dd>{e.output?.binding ?? 'desconocida'}</dd>
              <dt>Canal</dt><dd>{e.channel === 'subasta' ? 'Subasta' : e.channel === 'vinculado' ? 'Vinculado (no vendible)' : e.channel === 'servicio' ? 'Servicio / efecto aplicado' : 'Desconocido'}</dd>
              <dt>Motivo</dt><dd className="small">{e.channelReason}</dd>
              <dt>Rendimiento API</dt><dd>{e.yieldRange[0] === null ? 'no informado' : e.yieldRange[0] === e.yieldRange[1] ? `${e.yieldRange[0]} por ejecución` : `${e.yieldRange[0]}–${e.yieldRange[1]} (variable)`}</dd>
              <dt>Personaje</dt><dd>{{ conoce: 'Conoce la receta', no_conoce: 'No la conoce', requisito_no_cumplido: 'No tiene la profesión', sin_perfil: 'Sin perfil: sin confirmar' }[e.character as string]}</dd>
            </dl>
            <h3 style={{ marginTop: 12 }}>Demanda (regional)</h3>
            {e.demand ? (
              <>
                <dl className="kv">
                  <dt>Tasa de venta</dt><dd>{e.demand.saleRate ?? '—'}</dd>
                  <dt>Vendidos por día</dt><dd>{e.demand.soldPerDay ?? '—'}</dd>
                  <dt>Precio medio de venta</dt><dd><Money v={e.demand.avgSalePrice} /></dd>
                  <dt>Escaneo</dt><dd>{dt(e.demand.sourceTime)} ({age(hoursSince(e.demand.sourceTime))})</dd>
                </dl>
                <p className="small muted">Señales regionales comparativas: no son la probabilidad de vender hoy ni las ventas de tu personaje.</p>
              </>
            ) : <p className="muted small">Sin señales de demanda para este objeto.</p>}
          </section>
        )}
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Materiales</h2>
        <div className="table-wrap">
          <table className="responsive cards-lg">
            <thead><tr><th>Material</th><th className="num">Cantidad</th><th className="num">Precio usado</th><th>Procedencia</th><th className="num">Subtotal</th><th className="num">Inventario</th><th className="num">A comprar</th><th>Precio manual (oro)</th></tr></thead>
            <tbody>
              {e.reagents.map((r: any) => (
                <tr key={r.itemId}>
                  <td data-label="Material" className="cell-main"><ItemLabel id={r.itemId} href={`#/materiales/${r.itemId}`} name={r.name ?? `Objeto ${r.itemId}`} sub={`ID ${r.itemId}${r.variants.length ? ` · otros IDs con el mismo nombre: ${r.variants.join(', ')}` : ''}`} /></td>
                  <td data-label="Cantidad" className="num">{r.quantity === null ? '—' : r.quantity * e.runs}</td>
                  <td data-label="Precio usado" className="num"><Money v={r.price.copper} /></td>
                  <td data-label="Procedencia" className="small">{r.price.field} · {r.price.scope}{r.price.sourceTime ? ` · ${dt(r.price.sourceTime)}` : ''}</td>
                  <td data-label="Subtotal" className="num"><Money v={r.subtotal} /></td>
                  <td data-label="Inventario" className="num">{r.owned}</td>
                  <td data-label="A comprar" className="num">{r.toBuy}</td>
                  <td data-label="Precio manual">
                    <input type="text" inputMode="decimal" aria-label={`Precio manual de ${r.name ?? r.itemId} en oro`} style={{ width: 100 }} value={ov.prices?.[r.itemId] ?? ''} onChange={(ev) => setP(String(r.itemId), ev.target.value)} placeholder="oro" />
                  </td>
                </tr>
              ))}
              {!e.reagents.length && <tr><td colSpan={8} className="empty">La receta no tiene ingredientes registrados: el costo queda como desconocido.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="small muted">El costo es estimado: un precio observado no garantiza que se pueda comprar toda la cantidad a ese precio.</p>
      </section>

      <section className="card" aria-label="Simulador de escenarios">
        <h2 style={{ marginTop: 0 }}>Simulador de escenarios</h2>
        <p className="small muted">Los cambios no sobrescriben los datos de origen; el resultado se marca como manual.</p>
        <div className="grid grid-3">
          <GoldInput label="Precio de venta (oro/unidad)" value={ov.sellPrice ?? ''} onChange={(v) => setOv({ ...ov, sellPrice: v })} placeholder={money(e.sellPrice.copper)} />
          <GoldInput label="Caída del precio (%)" value={ov.priceDrop ?? ''} onChange={(v) => setOv({ ...ov, priceDrop: v })} placeholder="p. ej. 15" />
          <GoldInput label="Comisión (decimal)" value={ov.commission ?? ''} onChange={(v) => setOv({ ...ov, commission: v })} placeholder={d.data.settings.commission} hint="0 ≤ t < 1" />
          <GoldInput label="Depósitos perdidos (oro/lote)" value={ov.lostDeposits ?? ''} onChange={(v) => setOv({ ...ov, lostDeposits: v })} placeholder="0" hint="Gasto definitivo" />
          <GoldInput label="Depósitos recuperables (oro/lote)" value={ov.recoverableDeposits ?? ''} onChange={(v) => setOv({ ...ov, recoverableDeposits: v })} placeholder="0" hint="Capital inmovilizado" />
          <GoldInput label="Ganancia objetivo (oro/lote)" value={ov.targetProfit ?? ''} onChange={(v) => setOv({ ...ov, targetProfit: v })} placeholder="0" />
          <GoldInput label="Costo adicional (oro/ejecución)" value={ov.additionalCost ?? ''} onChange={(v) => setOv({ ...ov, additionalCost: v })} placeholder="0" hint="Consumibles, desplazamiento…" />
          <label className="field">Ejecuciones
            <input type="number" min={1} step={1} value={ov.runs ?? ''} onChange={(ev) => setOv({ ...ov, runs: ev.target.value })} placeholder="1" />
          </label>
          <label className="field">Unidades por ejecución (manual)
            <input type="number" min={1} step={1} value={ov.units ?? ''} onChange={(ev) => setOv({ ...ov, units: ev.target.value })} placeholder={e.unitsPerRun ?? 'desconocido'} />
          </label>
        </div>
        <label className="check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={Boolean(ov.assumeQuality)} onChange={(ev) => setOv({ ...ov, assumeQuality: ev.target.checked })} />
          Asumir manualmente que el precio corresponde al objeto obtenido aunque haya otro con el mismo nombre (excluye la recomendación automática)
        </label>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" onClick={calc} disabled={busy}><Calculator size={18} aria-hidden="true" />{busy ? 'Calculando…' : 'Recalcular escenario'}</button>
          <button onClick={reset}><ArrowCounterClockwise size={18} aria-hidden="true" />Restaurar escenario base</button>
          <button onClick={saveScenario}><FloppyDisk size={18} aria-hidden="true" />Guardar escenario</button>
          {(saved.data?.scenarios ?? []).length > 0 && (
            <label className="field">Escenarios guardados
              <select onChange={(ev) => { const s = saved.data.scenarios.find((x: any) => x.id === ev.target.value); if (s) setOv(s.data); }} defaultValue="">
                <option value="" disabled>Cargar…</option>
                {saved.data.scenarios.map((s: any) => <option key={s.id} value={s.id}>{s.name} · {dt(s.updated_at)}</option>)}
              </select>
            </label>
          )}
        </div>
        {scErr && <ErrorBox error={scErr} />}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Fórmulas aplicadas</h2>
        <div className="formula">{`C_materiales = Σ(cantidad × precio) = ${money(e.cost.materials)}
C_lote = C_materiales + C_adicional = ${money(e.cost.batch)}
C_unidad = C_lote / unidades = ${money(e.cost.unit)}
Ingreso_neto = Q × P × (1 − t) = ${money(e.profit.netRevenue)}   (t = ${d.data.settings.commission})
Ganancia_lote = Ingreso_neto − C − D = ${money(e.profit.profitBatch)}
ROI = Ganancia_lote / C × 100 = ${e.profit.roiUndefined ? 'no definido' : pct(e.profit.roiPct)}
Precio_equilibrio = (C + D) / (Q × (1 − t)) = ${exactGold(toQ(e.profit.breakEven))}`}</div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Comprar o fabricar componentes</h2>
        <p className="small muted">Solo se consideran recetas del catálogo con datos completos{profileId ? ' que el perfil conoce' : '; sin perfil, la accesibilidad está sin confirmar'}. Los ciclos se cortan y se marcan.</p>
        {d.data.sourcing.map((s: any) => (
          <div key={s.itemId} style={{ borderTop: '1px solid var(--color-border)', padding: '8px 0' }}>
            <span className="icon-inline"><WowIcon id={s.itemId} px={22} /><strong>{s.name ?? `Objeto ${s.itemId}`}</strong></span> <span className="small muted">({s.recipesAvailable} receta(s) lo producen)</span>
            <SourcingNode n={s.node} />
          </div>
        ))}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Añadir a la lista de fabricación</h2>
        <div className="row">
          <label className="field">Cantidad<input type="number" min={1} step={1} value={planAmt} onChange={(ev) => setPlanAmt(ev.target.value)} /></label>
          <label className="field">Unidad
            <select value={planMode} onChange={(ev) => setPlanMode(ev.target.value as any)}>
              <option value="ejecuciones">ejecuciones</option>
              <option value="unidades">unidades del resultado</option>
            </select>
          </label>
          <button onClick={addPlan}><Plus size={18} aria-hidden="true" />Añadir</button>
          <a className="icon-inline" href="#/plan"><ListChecks size={18} aria-hidden="true" />Ver lista</a>
        </div>
        {planMsg && <p className="small" role="status">{planMsg}</p>}
      </section>

      <details className="card">
        <summary>Datos de origen de la receta (respuesta del catálogo)</summary>
        <pre className="formula small">{JSON.stringify(d.data.rawRecipe, null, 2)?.slice(0, 6000) ?? 'sin datos'}</pre>
      </details>
    </div>
  );
}
