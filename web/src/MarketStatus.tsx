import React, { useState } from 'react';
import { useApp, api, useAsync, age, dt } from './lib.js';

export function MarketStatus({ compact = false }: { compact?: boolean }) {
  const { ctx, ctxQuery, meta, reloadMeta } = useApp();
  const st = useAsync(() => api(`/api/market/status?${ctxQuery}`), [ctxQuery]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sync = async (force = false) => {
    setBusy(true);
    setMsg(null);
    try {
      if (ctx.version === 'demo') await api('/api/demo/seed', { method: 'POST' });
      else {
        const r = await api('/api/sync/prices', { method: 'POST', body: { ...ctx, force } });
        const parts = Object.entries(r.results).map(([k, v]: any) => `${k}: ${v.status}${v.error ? ` (${v.error})` : v.reason ? ` (${v.reason})` : ''}`);
        setMsg(parts.join(' · '));
      }
      st.reload();
      reloadMeta();
      window.dispatchEvent(new Event('market-updated'));
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (st.loading && !st.data) return <p className="small muted"><span className="spinner" /> Comprobando datos de mercado…</p>;
  if (st.error) return <div className="alert bad small">Mercado: {st.error}</div>;
  const files: any[] = st.data?.files ?? [];
  const none = files.every((f) => !f.active);
  return (
    <section className={compact ? '' : 'card'} aria-label="Estado de los datos de mercado">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row small" style={{ alignItems: 'center' }}>
          {files.map((f) => (
            <span key={f.kind} title={f.lastAttempt?.error ?? ''}>
              <strong>{f.label}:</strong>{' '}
              {f.active ? (
                <span className={`badge ${f.stale ? 'b-warn' : 'b-ok'}`}>{f.stale ? 'Desactualizado' : 'Vigente'} · escaneo hace {age(f.sourceAgeHours)}</span>
              ) : (
                <span className="badge b-neutral">Sin datos</span>
              )}
              {f.lastAttempt && f.lastAttempt.status !== 'ok' && <span className="badge b-bad" style={{ marginLeft: 4 }}>Último intento: {f.lastAttempt.status}</span>}
            </span>
          ))}
        </div>
        <span className="row">
          <button className="primary" onClick={() => sync(false)} disabled={busy}>{busy ? 'Actualizando…' : ctx.version === 'demo' ? 'Recargar datos demo' : 'Actualizar precios'}</button>
        </span>
      </div>
      {none && !busy && (
        <p className="small muted" style={{ marginTop: 6 }}>
          {ctx.version === 'demo' ? 'Aún no se han cargado los datos de demostración.' : 'Todavía no hay precios para este mercado. Pulsa «Actualizar precios» para descargarlos de TSM.'}
        </p>
      )}
      {files.some((f) => f.lastAttempt?.status === 'failed' || f.lastAttempt?.status === 'rejected') && (
        <p className="small" style={{ color: 'var(--bad)' }}>
          Una sincronización falló; se conserva el último lote válido. {files.filter((f) => f.lastAttempt?.error).map((f) => `${f.label}: ${f.lastAttempt.error} (${dt(f.lastAttempt.at)})`).join(' · ')}
        </p>
      )}
      {msg && <p className="small muted" role="status">{msg}</p>}
      {!ctx.realm && ctx.version !== 'demo' && <p className="small muted">Sin reino seleccionado: solo hay precios de commodities y estadísticas regionales; el equipo no commodity aparecerá sin precio.</p>}
    </section>
  );
}
