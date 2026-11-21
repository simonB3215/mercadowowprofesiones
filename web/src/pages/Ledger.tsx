import React, { useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, GoldInput, formatMoney, Q, dt, PageHead } from '../lib.js';
import { ItemPicker } from '../ItemPicker.js';
import { t } from '../i18n.js';

const KINDS: Record<string, string> = { venta: 'Venta', compra: 'Compra', fabricacion: 'Fabricación (unidades hechas)', gasto: 'Otro gasto', deposito_perdido: 'Depósito perdido (subasta caducada)' };
const m = (s: string) => formatMoney(Q.of(BigInt(s)));

export function Ledger() {
  const { profileId } = useApp();
  const l = useAsync(() => api(`/api/ledger${profileId ? `?profileId=${profileId}` : ''}`), [profileId]);
  const [f, setF] = useState({ kind: 'venta', itemId: '', itemName: '', quantity: '1', unitPriceGold: '', occurredAt: new Date().toISOString().slice(0, 10), note: '' });
  const [replaces, setReplaces] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async () => {
    setMsg(null);
    try {
      await api('/api/ledger', { method: 'POST', body: { ...f, quantity: Number(f.quantity), profileId, replacesId: replaces?.id, itemId: f.itemId || null, unitPriceGold: f.unitPriceGold || '0' } });
      setMsg(replaces ? t('Anotación corregida (la original queda anulada).') : 'Anotado.');
      setReplaces(null);
      l.reload();
    } catch (e: any) { setMsg(e.message); }
  };
  const edit = (e: any) => {
    setReplaces(e);
    setF({ kind: e.kind, itemId: e.item_id ?? '', itemName: e.item_name ?? '', quantity: String(e.quantity), unitPriceGold: Q.of(BigInt(e.unit_price_copper), 10000n).toDecimal(4), occurredAt: String(e.occurred_at).slice(0, 10), note: e.note ?? '' });
  };
  const voidIt = async (id: string) => { if (confirm(t('¿Anular esta anotación? Dejará de contar en el balance.'))) { await api(`/api/ledger/${id}/void`, { method: 'POST' }); l.reload(); } };

  return (
    <div>
      <PageHead title={t('Registro real')}>{t('Anota lo que compras, fabricas y vendes de verdad para saber cuánto oro has ganado realmente (las cifras del comparador son estimaciones). Lo fabricado y aún sin vender aparece como «pendiente de venta», no como ganancia.')}</PageHead>
      {l.loading ? <Loading /> : l.error ? <ErrorBox error={l.error} /> : (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>{t('Tu balance')}{' '}{profileId ? t('con este perfil') : t('(todos los perfiles)')}</h2>
          <dl className="kv">
            <dt>{t('Ventas')}</dt><dd>{m(l.data.summary.sales)}</dd>
            <dt>{t('Compras, gastos y depósitos perdidos')}</dt><dd>{m(l.data.summary.costs)}</dd>
            <dt>{t('Ganancia real')}</dt><dd><strong>{m(l.data.summary.realized)}</strong></dd>
            <dt>{t('Pendiente de venta')}</dt><dd>{l.data.summary.pendingToSell.length ? l.data.summary.pendingToSell.map((p: any) => `${p.name ?? p.itemId}: ${p.pending}`).join(', ') : t('nada')}</dd>
          </dl>
        </section>
      )}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{replaces ? t('Corregir una anotación') : t('Anotar una compra, venta o gasto')}</h2>
        <div className="row">
          <label className="field">{t('Tipo')}<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></label>
          <ItemPicker label={t('Objeto')} value={f.itemId ? { id: Number(f.itemId), name: f.itemName || t('Objeto {id}', { id: f.itemId }) } : null}
            onPick={(v) => setF({ ...f, itemId: v ? String(v.id) : '', itemName: v ? v.name : '' })} />
          <label className="field">{t('Cantidad')}<input type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></label>
          <GoldInput label={t('Precio por unidad (oro)')} value={f.unitPriceGold} onChange={(v) => setF({ ...f, unitPriceGold: v })} placeholder="0" />
          <label className="field">{t('Fecha')}<input type="date" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} /></label>
          <label className="field">{t('Nota (opcional)')}<input type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={submit}>{replaces ? t('Guardar corrección') : t('Anotar')}</button>
          {replaces && <button onClick={() => setReplaces(null)}>{t('Cancelar corrección')}</button>}
        </div>
        {msg && <p role="status" className="small">{msg}</p>}
      </section>
      {l.data && (
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>{t('Fecha')}</th><th>{t('Tipo')}</th><th>{t('Objeto')}</th><th className="num">{t('Cantidad')}</th><th className="num">{t('Precio unit.')}</th><th className="num">{t('Total')}</th><th>{t('Estado')}</th><th></th></tr></thead>
            <tbody>
              {l.data.entries.map((e: any) => (
                <tr key={e.id} style={{ opacity: e.voided ? 0.55 : 1 }}>
                  <td data-label={t('Fecha')}>{dt(e.occurred_at)}</td>
                  <td data-label={t('Tipo')}>{t(KINDS[e.kind])}</td>
                  <td data-label={t('Objeto')}>{e.item_name ?? e.item_id ?? '—'}</td>
                  <td data-label={t('Cantidad')} className="num">{e.quantity}</td>
                  <td data-label={t('Precio')} className="num">{m(e.unit_price_copper)}</td>
                  <td data-label={t('Total')} className="num">{m((BigInt(e.unit_price_copper) * BigInt(e.quantity)).toString())}</td>
                  <td data-label={t('Estado')}>{e.voided ? t('Anulado') : e.replaces_id ? t('Corrección') : t('Vigente')}</td>
                  <td>{!e.voided && <><button className="link" onClick={() => edit(e)}>{t('Corregir')}</button> · <button className="link danger" onClick={() => voidIt(e.id)}>{t('Anular')}</button></>}</td>
                </tr>
              ))}
              {!l.data.entries.length && <tr><td colSpan={8} className="empty">{t('Sin asientos.')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
