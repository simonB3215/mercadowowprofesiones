import React, { useState } from 'react';
import { api, useApp, useAsync, money, getDraft, setDraft, ErrorBox, Delta, PageHead, dt, type DraftEntry, Money } from '../lib.js';
import { ItemLabel } from '../icons.js';
import { Calculator, Trash, FloppyDisk, Info, ListChecks, WarningCircle } from '@phosphor-icons/react';
import { t } from '../i18n.js';

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
      <PageHead title={t('Lista de fabricación y compras')}>{t('Junta varias recetas que quieras fabricar y obtén la lista de compra total y el oro que necesitas antes de empezar.')}</PageHead>
      {!profileId && entries.length > 0 && <div className="alert info"><Info size={20} aria-hidden="true" /><div><p>{t('Si eliges un perfil manual arriba, se descuentan los materiales que ya tienes.')}</p></div></div>}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t('Recetas del plan')}</h2>
        {!entries.length && (
          <div className="empty">
            <ListChecks size={32} aria-hidden="true" />
            <div>
              <p style={{ margin: 0 }}><strong>{t('Tu lista está vacía.')}</strong>{' '}{t('Para añadir recetas:')}</p>
              <ol className="hint-steps" style={{ textAlign: 'left' }}>
                <li>{t('Abre el')}{' '}<a href="#/">{t('comparador')}</a>{' '}{t('y pulsa una receta.')}</li>
                <li>{t('Al final de su ficha, en «Añadir a la lista de fabricación», elige cuántas y pulsa «Añadir».')}</li>
                <li>{t('Vuelve aquí y pulsa «Calcular plan».')}</li>
              </ol>
            </div>
          </div>
        )}
        {entries.length > 0 && (
          <div className="table-wrap">
            <table className="responsive">
              <thead><tr><th>{t('Receta')}</th><th className="num">{t('Cantidad')}</th><th>{t('Unidad')}</th><th></th></tr></thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.recipeId}>
                    <td data-label={t('Receta')}><a href={`#/receta/${e.recipeId}`}>{e.name}</a></td>
                    <td data-label={t('Cantidad')} className="num">
                      <input type="number" min={1} step={1} aria-label={t('Cantidad de {x}', { x: e.name })} style={{ width: 90 }} value={e.amount}
                        onChange={(ev) => update(entries.map((x, j) => (j === i ? { ...x, amount: Number(ev.target.value) } : x)))} />
                    </td>
                    <td data-label={t('Unidad')}>
                      <select aria-label={t('Unidad de {x}', { x: e.name })} value={e.mode} onChange={(ev) => update(entries.map((x, j) => (j === i ? { ...x, mode: ev.target.value as any } : x)))}>
                        <option value="ejecuciones">{t('veces que la fabricas')}</option><option value="unidades">{t('unidades del resultado')}</option>
                      </select>
                    </td>
                    <td><button className="link danger icon-inline" onClick={() => update(entries.filter((_, j) => j !== i))}><Trash size={16} aria-hidden="true" />{t('Quitar')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ marginTop: 10 }} hidden={!entries.length && !(plans.data?.plans ?? []).length}>
          <button className="primary" onClick={compute} disabled={!entries.length || busy}><Calculator size={18} aria-hidden="true" />{busy ? t('Calculando…') : t('Calcular plan')}</button>
          <button onClick={() => update([])} disabled={!entries.length}><Trash size={18} aria-hidden="true" />{t('Vaciar')}</button>
          <label className="field">{t('Nombre del plan')}<input type="text" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder={t('Plan')} /></label>
          <button onClick={savePlan} disabled={!entries.length}><FloppyDisk size={18} aria-hidden="true" />{t('Guardar plan')}</button>
          {(plans.data?.plans ?? []).length > 0 && (
            <label className="field">{t('Planes guardados')}<select defaultValue="" onChange={(e) => { const p = plans.data.plans.find((x: any) => x.id === e.target.value); if (p) update(p.data.entries ?? []); }}>
                <option value="" disabled>{t('Cargar…')}</option>
                {plans.data.plans.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {dt(p.updated_at)}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>
      {err && <ErrorBox error={err} />}
      {result && (
        <>
          {result.warnings.length > 0 && <div className="alert warn"><WarningCircle size={20} aria-hidden="true" /><div>{result.warnings.map((w: string, i: number) => <p key={i}>{w}</p>)}</div></div>}
          {result.plan.errors.length > 0 && <div className="alert bad" role="alert"><WarningCircle size={20} aria-hidden="true" /><div>{result.plan.errors.map((w: string, i: number) => <p key={i}>{w}</p>)}</div></div>}
          <section className="card">
            <h2 style={{ marginTop: 0 }}>{t('Resumen')}</h2>
            <dl className="kv">
              <dt>{t('Costo total de los materiales')}</dt><dd><Money v={result.plan.replacementCost} />{result.plan.incomplete.length ? t(' (incompleto)') : ''}</dd>
              <dt>{t('Oro que necesitas para comprar lo que falta')}</dt><dd><strong><Money v={result.plan.outOfPocket} /></strong></dd>
              <dt>{t('Cobrarías al venderlo todo')}</dt><dd><Money v={result.plan.netRevenue} /> <span className="small muted">{t('(menos la comisión del')}{' '}{Math.round(Number(result.commission) * 100)} %)</span></dd>
              <dt>{t('Ganancia estimada')}</dt><dd><Delta v={result.plan.estimatedProfit} /></dd>
            </dl>
            {result.plan.incomplete.length > 0 && <p className="small" style={{ color: 'var(--color-bad)' }}>{t('Total incompleto: faltan precios de')}{' '}{result.plan.incomplete.join(', ')}.</p>}
            <p className="small muted">{result.note}</p>
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>{t('Qué fabricar')}</h2>
            <div className="table-wrap">
              <table className="responsive cards-lg">
                <thead><tr><th>{t('Receta')}</th><th className="num">{t('Pedido')}</th><th className="num">{t('Veces')}</th><th className="num">{t('Unidades')}</th><th className="num">{t('Sobran')}</th><th className="num">{t('Costo')}</th><th className="num">{t('Cobras')}</th></tr></thead>
                <tbody>
                  {result.plan.entries.map((e: any) => (
                    <tr key={e.recipeId}>
                      <td data-label={t('Receta')}>{e.name}</td>
                      <td data-label={t('Pedido')} className="num">{e.requested} {e.mode === 'ejecuciones' ? t('veces') : t('unidades')}</td>
                      <td data-label={t('Veces')} className="num">{e.runs}</td>
                      <td data-label={t('Unidades')} className="num">{e.unitsProduced}</td>
                      <td data-label={t('Sobran')} className="num">{e.surplus}</td>
                      <td data-label={t('Costo')} className="num"><Money v={e.cost} /></td>
                      <td data-label={t('Cobras')} className="num"><Money v={e.netRevenue} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>{t('Lista de compras')}</h2>
            <div className="table-wrap">
              <table className="responsive cards-lg">
                <thead><tr><th>{t('Material')}</th><th className="num">{t('Necesitas')}</th><th className="num">{t('Tienes')}</th><th className="num">{t('Usas de lo tuyo')}</th><th className="num">{t('A comprar')}</th><th className="num">{t('Precio unid.')}</th><th className="num">{t('Valor total')}</th><th className="num">{t('Gastas')}</th></tr></thead>
                <tbody>
                  {result.plan.materials.map((m: any) => (
                    <tr key={m.itemKey}>
                      <td data-label={t('Material')} className="cell-main"><ItemLabel id={Number(m.itemKey) || null} href={`#/materiales/${m.itemKey}`} name={m.name ?? t('Objeto {id}', { id: m.itemKey })} /></td>
                      <td data-label={t('Necesitas')} className="num">{m.need}</td>
                      <td data-label={t('Tienes')} className="num">{m.owned}</td>
                      <td data-label={t('Usas de lo tuyo')} className="num">{m.used}</td>
                      <td data-label={t('A comprar')} className="num"><strong>{m.toBuy}</strong></td>
                      <td data-label={t('Precio')} className="num"><Money v={m.unitPrice} /></td>
                      <td data-label={t('Valor total')} className="num"><Money v={m.replacementCost} /></td>
                      <td data-label={t('Gastas')} className="num"><Money v={m.outOfPocket} /></td>
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
