import React, { useState } from 'react';
import { api, useApp, useAsync, money, getDraft, setDraft, ErrorBox, DemoBanner, dt, type DraftEntry } from '../lib.js';

export function PlanPage() {
  const { ctx, profileId } = useApp();
  const [entries, setEntries] = useState<DraftEntry[]>(getDraft);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planName, setPlanName] = useState('');
  const plans = useAsync(() => api('/api/plans'), []);

  const update = (next: DraftEntry[]) => { setEntries(next); setDraft(next); setResult(null); };
  const compute = async () => {
    setBusy(true); setErr(null);
    try {
      setResult(await api('/api/crafting-plan', { method: 'POST', body: { ...ctx, profileId, entries } }));
    } catch (e: any) { setErr(e.message); setResult(null); } finally { setBusy(false); }
  };
  const savePlan = async () => {
    await api('/api/plans', { method: 'POST', body: { name: planName || 'Plan', profileId, ctx, entries } });
    plans.reload(); setPlanName('');
  };

  return (
    <div>
      <DemoBanner />
      <h1>Lista de fabricación y compras</h1>
      <p className="muted small">Agrupa materiales de varias recetas, aplica el inventario del perfil una sola vez y muestra el capital necesario antes de fabricar. Las cantidades no garantizan ventas.</p>
      {!profileId && <div className="alert info"><p>Sin perfil seleccionado: no se descuenta inventario.</p></div>}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Recetas del plan</h2>
        {!entries.length && <p className="empty">La lista está vacía. Añade recetas desde su página de detalle.</p>}
        {entries.length > 0 && (
          <div className="table-wrap">
            <table className="responsive">
              <thead><tr><th>Receta</th><th className="num">Cantidad</th><th>Unidad</th><th></th></tr></thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.recipeId}>
                    <td data-label="Receta"><a href={`#/receta/${e.recipeId}`}>{e.name}</a></td>
                    <td data-label="Cantidad" className="num">
                      <input type="number" min={1} step={1} aria-label={`Cantidad de ${e.name}`} style={{ width: 90 }} value={e.amount}
                        onChange={(ev) => update(entries.map((x, j) => (j === i ? { ...x, amount: Number(ev.target.value) } : x)))} />
                    </td>
                    <td data-label="Unidad">
                      <select aria-label={`Unidad de ${e.name}`} value={e.mode} onChange={(ev) => update(entries.map((x, j) => (j === i ? { ...x, mode: ev.target.value as any } : x)))}>
                        <option value="ejecuciones">ejecuciones</option><option value="unidades">unidades del resultado</option>
                      </select>
                    </td>
                    <td><button className="link danger" onClick={() => update(entries.filter((_, j) => j !== i))}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" onClick={compute} disabled={!entries.length || busy}>{busy ? 'Calculando…' : 'Calcular plan'}</button>
          <button onClick={() => update([])} disabled={!entries.length}>Vaciar</button>
          <label className="field">Nombre del plan<input type="text" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Plan" /></label>
          <button onClick={savePlan} disabled={!entries.length}>Guardar plan</button>
          {(plans.data?.plans ?? []).length > 0 && (
            <label className="field">Planes guardados
              <select defaultValue="" onChange={(e) => { const p = plans.data.plans.find((x: any) => x.id === e.target.value); if (p) update(p.data.entries ?? []); }}>
                <option value="" disabled>Cargar…</option>
                {plans.data.plans.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {dt(p.updated_at)}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>
      {err && <ErrorBox error={err} />}
      {result && (
        <>
          {result.warnings.length > 0 && <div className="alert warn">{result.warnings.map((w: string, i: number) => <p key={i}>{w}</p>)}</div>}
          {result.plan.errors.length > 0 && <div className="alert bad">{result.plan.errors.map((w: string, i: number) => <p key={i}>{w}</p>)}</div>}
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Resumen</h2>
            <dl className="kv">
              <dt>Costo de reposición total</dt><dd>{money(result.plan.replacementCost)}{result.plan.incomplete.length ? ' (incompleto)' : ''}</dd>
              <dt>Desembolso (compras pendientes)</dt><dd><strong>{money(result.plan.outOfPocket)}</strong></dd>
              <dt>Ingreso neto estimado</dt><dd>{money(result.plan.netRevenue)} <span className="small muted">(comisión {result.commission})</span></dd>
              <dt>Ganancia estimada</dt><dd>{money(result.plan.estimatedProfit)}</dd>
            </dl>
            {result.plan.incomplete.length > 0 && <p className="small" style={{ color: 'var(--bad)' }}>Total incompleto: faltan precios de {result.plan.incomplete.join(', ')}.</p>}
            <p className="small muted">{result.note}</p>
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Ejecuciones</h2>
            <div className="table-wrap">
              <table className="responsive">
                <thead><tr><th>Receta</th><th className="num">Solicitado</th><th className="num">Ejecuciones</th><th className="num">Unidades</th><th className="num">Excedente</th><th className="num">Costo</th><th className="num">Ingreso neto</th></tr></thead>
                <tbody>
                  {result.plan.entries.map((e: any) => (
                    <tr key={e.recipeId}>
                      <td data-label="Receta">{e.name}</td>
                      <td data-label="Solicitado" className="num">{e.requested} {e.mode}</td>
                      <td data-label="Ejecuciones" className="num">{e.runs}</td>
                      <td data-label="Unidades" className="num">{e.unitsProduced}</td>
                      <td data-label="Excedente" className="num">{e.surplus}</td>
                      <td data-label="Costo" className="num">{money(e.cost)}</td>
                      <td data-label="Ingreso neto" className="num">{money(e.netRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Lista de compras</h2>
            <div className="table-wrap">
              <table className="responsive">
                <thead><tr><th>Material</th><th className="num">Necesario</th><th className="num">En inventario</th><th className="num">Usado del inventario</th><th className="num">A comprar</th><th className="num">Precio unit.</th><th className="num">Reposición</th><th className="num">Desembolso</th></tr></thead>
                <tbody>
                  {result.plan.materials.map((m: any) => (
                    <tr key={m.itemKey}>
                      <td data-label="Material">{m.name} <span className="small muted">ID {m.itemKey}</span></td>
                      <td data-label="Necesario" className="num">{m.need}</td>
                      <td data-label="Inventario" className="num">{m.owned}</td>
                      <td data-label="Usado" className="num">{m.used}</td>
                      <td data-label="A comprar" className="num"><strong>{m.toBuy}</strong></td>
                      <td data-label="Precio" className="num">{money(m.unitPrice)}</td>
                      <td data-label="Reposición" className="num">{money(m.replacementCost)}</td>
                      <td data-label="Desembolso" className="num">{money(m.outOfPocket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
