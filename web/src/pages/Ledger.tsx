import React, { useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, GoldInput, formatMoney, Q, dt } from '../lib.js';

const KINDS: Record<string, string> = { compra: 'Compra', venta: 'Venta', gasto: 'Gasto', deposito_perdido: 'Depósito perdido', fabricacion: 'Fabricación (unidades)' };
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
      setMsg(replaces ? 'Asiento corregido (el original queda anulado).' : 'Asiento registrado.');
      setReplaces(null);
      l.reload();
    } catch (e: any) { setMsg(e.message); }
  };
  const edit = (e: any) => {
    setReplaces(e);
    setF({ kind: e.kind, itemId: e.item_id ?? '', itemName: e.item_name ?? '', quantity: String(e.quantity), unitPriceGold: Q.of(BigInt(e.unit_price_copper), 10000n).toDecimal(4), occurredAt: String(e.occurred_at).slice(0, 10), note: e.note ?? '' });
  };
  const voidIt = async (id: string) => { if (confirm('¿Anular este asiento?')) { await api(`/api/ledger/${id}/void`, { method: 'POST' }); l.reload(); } };

  return (
    <div>
      <h1>Registro de resultados reales</h1>
      <p className="muted small">El beneficio realizado solo existe con compras, ventas y gastos efectivos. Las unidades fabricadas sin vender se muestran como pendientes, no como beneficio.</p>
      {l.loading ? <Loading /> : l.error ? <ErrorBox error={l.error} /> : (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Resumen {profileId ? 'del perfil' : '(todos los perfiles)'}</h2>
          <dl className="kv">
            <dt>Ventas</dt><dd>{m(l.data.summary.sales)}</dd>
            <dt>Compras, gastos y depósitos perdidos</dt><dd>{m(l.data.summary.costs)}</dd>
            <dt>Beneficio realizado</dt><dd><strong>{m(l.data.summary.realized)}</strong></dd>
            <dt>Pendiente de venta</dt><dd>{l.data.summary.pendingToSell.length ? l.data.summary.pendingToSell.map((p: any) => `${p.name ?? p.itemId}: ${p.pending}`).join(', ') : 'nada'}</dd>
          </dl>
        </section>
      )}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{replaces ? 'Corregir asiento' : 'Nuevo asiento'}</h2>
        <div className="row">
          <label className="field">Tipo<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field">ID del objeto<input type="number" value={f.itemId} onChange={(e) => setF({ ...f, itemId: e.target.value })} /></label>
          <label className="field">Nombre / variante<input type="text" value={f.itemName} onChange={(e) => setF({ ...f, itemName: e.target.value })} /></label>
          <label className="field">Cantidad<input type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></label>
          <GoldInput label="Precio unitario (oro)" value={f.unitPriceGold} onChange={(v) => setF({ ...f, unitPriceGold: v })} placeholder="0" />
          <label className="field">Fecha<input type="date" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} /></label>
          <label className="field">Nota<input type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={submit}>{replaces ? 'Guardar corrección' : 'Registrar'}</button>
          {replaces && <button onClick={() => setReplaces(null)}>Cancelar corrección</button>}
        </div>
        {msg && <p role="status" className="small">{msg}</p>}
      </section>
      {l.data && (
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Objeto</th><th className="num">Cantidad</th><th className="num">Precio unit.</th><th className="num">Total</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {l.data.entries.map((e: any) => (
                <tr key={e.id} style={{ opacity: e.voided ? 0.55 : 1 }}>
                  <td data-label="Fecha">{dt(e.occurred_at)}</td>
                  <td data-label="Tipo">{KINDS[e.kind]}</td>
                  <td data-label="Objeto">{e.item_name ?? e.item_id ?? '—'}</td>
                  <td data-label="Cantidad" className="num">{e.quantity}</td>
                  <td data-label="Precio" className="num">{m(e.unit_price_copper)}</td>
                  <td data-label="Total" className="num">{m((BigInt(e.unit_price_copper) * BigInt(e.quantity)).toString())}</td>
                  <td data-label="Estado">{e.voided ? 'Anulado' : e.replaces_id ? 'Corrección' : 'Vigente'}</td>
                  <td>{!e.voided && <><button className="link" onClick={() => edit(e)}>Corregir</button> · <button className="link danger" onClick={() => voidIt(e.id)}>Anular</button></>}</td>
                </tr>
              ))}
              {!l.data.entries.length && <tr><td colSpan={8} className="empty">Sin asientos.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
