import React, { useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, GoldInput, formatMoney, Q, dt, PageHead } from '../lib.js';
import { ItemPicker } from '../ItemPicker.js';

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
      setMsg(replaces ? 'Anotación corregida (la original queda anulada).' : 'Anotado.');
      setReplaces(null);
      l.reload();
    } catch (e: any) { setMsg(e.message); }
  };
  const edit = (e: any) => {
    setReplaces(e);
    setF({ kind: e.kind, itemId: e.item_id ?? '', itemName: e.item_name ?? '', quantity: String(e.quantity), unitPriceGold: Q.of(BigInt(e.unit_price_copper), 10000n).toDecimal(4), occurredAt: String(e.occurred_at).slice(0, 10), note: e.note ?? '' });
  };
  const voidIt = async (id: string) => { if (confirm('¿Anular esta anotación? Dejará de contar en el balance.')) { await api(`/api/ledger/${id}/void`, { method: 'POST' }); l.reload(); } };

  return (
    <div>
      <PageHead title="Registro real">
        Anota lo que compras, fabricas y vendes de verdad para saber cuánto oro has ganado realmente (las cifras del comparador son estimaciones).
        Lo fabricado y aún sin vender aparece como «pendiente de venta», no como ganancia.
      </PageHead>
      {l.loading ? <Loading /> : l.error ? <ErrorBox error={l.error} /> : (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Tu balance {profileId ? 'con este perfil' : '(todos los perfiles)'}</h2>
          <dl className="kv">
            <dt>Ventas</dt><dd>{m(l.data.summary.sales)}</dd>
            <dt>Compras, gastos y depósitos perdidos</dt><dd>{m(l.data.summary.costs)}</dd>
            <dt>Ganancia real</dt><dd><strong>{m(l.data.summary.realized)}</strong></dd>
            <dt>Pendiente de venta</dt><dd>{l.data.summary.pendingToSell.length ? l.data.summary.pendingToSell.map((p: any) => `${p.name ?? p.itemId}: ${p.pending}`).join(', ') : 'nada'}</dd>
          </dl>
        </section>
      )}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{replaces ? 'Corregir una anotación' : 'Anotar una compra, venta o gasto'}</h2>
        <div className="row">
          <label className="field">Tipo<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <ItemPicker label="Objeto" value={f.itemId ? { id: Number(f.itemId), name: f.itemName || `Objeto ${f.itemId}` } : null}
            onPick={(v) => setF({ ...f, itemId: v ? String(v.id) : '', itemName: v ? v.name : '' })} />
          <label className="field">Cantidad<input type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></label>
          <GoldInput label="Precio por unidad (oro)" value={f.unitPriceGold} onChange={(v) => setF({ ...f, unitPriceGold: v })} placeholder="0" />
          <label className="field">Fecha<input type="date" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} /></label>
          <label className="field">Nota (opcional)<input type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={submit}>{replaces ? 'Guardar corrección' : 'Anotar'}</button>
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
