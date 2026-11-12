import React, { useState } from 'react';
import { useApp, api, useAsync, age, dt } from './lib.js';
import { ArrowsClockwise, Storefront, Globe, WarningCircle } from '@phosphor-icons/react';

export function MarketStatus({ compact = false }: { compact?: boolean }) {
  const { ctx, ctxQuery, reloadMeta } = useApp();
  const st = useAsync(() => api(`/api/market/status?${ctxQuery}`), [ctxQuery]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sync = async (force = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api('/api/sync/prices', { method: 'POST', body: { ...ctx, force } });
      const parts = Object.entries(r.results).map(([k, v]: any) => `${k}: ${v.status}${v.error ? ` (${v.error})` : v.reason ? ` (${v.reason})` : ''}`);
      setMsg(parts.join(' · '));
      st.reload();
      reloadMeta();
      window.dispatchEvent(new Event('market-updated'));
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (st.loading && !st.data) return <p className="small muted" role="status"><span className="spinner" aria-hidden="true" /> Comprobando datos de mercado…</p>;
  if (st.error) return <div className="alert bad small" role="alert"><WarningCircle size={18} aria-hidden="true" /><div>Mercado: {st.error}</div></div>;
  const files: any[] = st.data?.files ?? [];
  const none = files.every((f) => !f.active);
  return (
    <section className={compact ? '' : 'card'} aria-label="Estado de los datos de mercado">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row small" style={{ alignItems: 'center', gap: '8px 18px' }}>
          {files.map((f) => {
            const I = f.kind === 'region_items' ? Globe : Storefront;
            return (
              <span key={f.kind} title={f.lastAttempt?.error ?? ''} className="icon-inline">
                <I size={18} aria-hidden="true" />
                <strong>{f.label}:</strong>
                {f.active ? (
                  <span className={`badge ${f.stale ? 'b-warn' : 'b-ok'}`}>{f.stale ? 'Desactualizado' : 'Vigente'} · escaneo hace {age(f.sourceAgeHours)}</span>
                ) : (
                  <span className="badge b-neutral">Sin datos</span>
                )}
                {f.lastAttempt && f.lastAttempt.status !== 'ok' && <span className="badge b-bad">Último intento: {f.lastAttempt.status}</span>}
              </span>
            );
          })}
        </div>
        <button className="primary" onClick={() => sync(false)} disabled={busy} aria-busy={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <ArrowsClockwise size={18} weight="bold" aria-hidden="true" />}
          {busy ? 'Actualizando…' : 'Actualizar precios'}
        </button>
      </div>
      {none && !busy && (
        <p className="small muted" style={{ marginTop: 6 }}>
          Todavía no hay precios para esta casa de subastas. Pulsa «Actualizar precios» para descargarlos.
        </p>
      )}
      {files.some((f) => f.lastAttempt?.status === 'failed' || f.lastAttempt?.status === 'rejected') && (
        <p className="small" style={{ color: 'var(--color-bad)' }}>
          Una sincronización falló; se conserva el último lote válido. {files.filter((f) => f.lastAttempt?.error).map((f) => `${f.label}: ${f.lastAttempt.error} (${dt(f.lastAttempt.at)})`).join(' · ')}
        </p>
      )}
      {msg && <p className="small muted" role="status">{msg}</p>}
      {!ctx.realm && <p className="small muted">Elige una casa de subastas (modo de juego y facción) arriba: sin ella solo hay estadísticas regionales y los precios de compra y venta quedan vacíos.</p>}
    </section>
  );
}
