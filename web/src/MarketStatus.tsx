import React, { useState } from 'react';
import { useApp, api, useAsync, age, dt, hoursSince } from './lib.js';
import { ArrowsClockwise, Storefront, Globe, WarningCircle, CheckCircle } from '@phosphor-icons/react';

/** Una comprobación de hace menos de 2 h cuenta como reciente: si la fuente sigue vieja, es la fuente la que no publica. */
const RECENT_CHECK_H = 2;

/** Resultado de una sincronización en palabras sencillas (sin claves internas). */
function describeResult(label: string, v: any): string {
  if (!v) return `${label}: sin respuesta`;
  if (v.status === 'ok') return `${label}: actualizado (${(v.rowsValid ?? 0).toLocaleString('es-ES')} precios)`;
  if (v.status === 'omitido') return `${label}: ya estaba al día`;
  return `${label}: no se pudo actualizar${v.error ? ` (${v.error})` : ''}`;
}

export function MarketStatus({ compact = false }: { compact?: boolean }) {
  const { ctx, ctxQuery, reloadMeta } = useApp();
  const st = useAsync(() => api(`/api/market/status?${ctxQuery}`), [ctxQuery]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sync = async (force = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api('/api/sync/prices', { method: 'POST', body: { ...ctx, force } });
      const labels: Record<string, string> = Object.fromEntries((r.status?.files ?? []).map((f: any) => [f.kind, f.label]));
      const entries = Object.entries(r.results) as Array<[string, any]>;
      setMsg({
        ok: entries.every(([, v]) => v?.status === 'ok' || v?.status === 'omitido'),
        text: entries.map(([k, v]) => describeResult(labels[k] ?? k, v)).join(' · '),
      });
      st.reload();
      reloadMeta();
      window.dispatchEvent(new Event('market-updated'));
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };
  if (st.loading && !st.data) return <p className="small muted" role="status"><span className="spinner" aria-hidden="true" /> Comprobando datos de mercado…</p>;
  if (st.error) return <div className="alert bad small" role="alert"><WarningCircle size={18} aria-hidden="true" /><div>Mercado: {st.error}</div></div>;
  const files: any[] = st.data?.files ?? [];
  const none = files.every((f) => !f.active);
  const failed = files.filter((f) => f.lastAttempt && f.lastAttempt.status !== 'ok');
  const staleHouse = files.find((f) => f.kind === 'realm_items' && f.stale);

  return (
    <section className={`market-status${compact ? '' : ' card'}`} aria-label="Estado de los datos de mercado">
      <div className="market-status-head">
        <ul className="market-files">
          {files.map((f) => {
            const I = f.kind === 'region_items' ? Globe : Storefront;
            const checkedH = hoursSince(f.lastAttempt?.at);
            // La fuente no ha publicado nada nuevo aunque la comprobamos hace poco.
            const sourceIsOld = f.active && f.stale && checkedH !== null && checkedH < RECENT_CHECK_H && f.lastAttempt?.status === 'ok';
            return (
              <li key={f.kind}>
                <I size={18} aria-hidden="true" />
                <div>
                  <div className="market-file-title">
                    <strong>{f.label}</strong>
                    {f.active
                      ? <span className={`badge ${f.stale ? 'b-warn' : 'b-ok'}`}>{f.stale ? 'Desactualizado' : 'Vigente'}</span>
                      : <span className="badge b-neutral">Sin datos</span>}
                  </div>
                  {f.active && (
                    <div className="small muted">
                      Datos de hace {age(f.sourceAgeHours)}
                      {checkedH !== null && <> · comprobado hace {age(checkedH)}</>}
                    </div>
                  )}
                  {sourceIsOld && (
                    <div className="small muted">
                      {f.kind === 'region_items' ? 'TradeSkillMaster' : 'La fuente'} aún no ha publicado datos más nuevos; se vuelve a comprobar automáticamente.
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <button className="primary" onClick={() => sync(false)} disabled={busy} aria-busy={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <ArrowsClockwise size={18} weight="bold" aria-hidden="true" />}
          {busy ? 'Actualizando… (unos 15 s)' : 'Actualizar precios'}
        </button>
      </div>
      {none && !busy && (
        <p className="small muted">Todavía no hay precios para esta casa de subastas. Pulsa «Actualizar precios» para descargarlos.</p>
      )}
      {staleHouse && !busy && !msg && hoursSince(staleHouse.lastAttempt?.at) !== null && hoursSince(staleHouse.lastAttempt?.at)! >= RECENT_CHECK_H && (
        <p className="small market-note">
          La actualización automática no ha llegado desde {dt(staleHouse.lastAttempt.at)}. Pulsa «Actualizar precios» para tener los precios de esta hora.
        </p>
      )}
      {failed.length > 0 && (
        <p className="small" style={{ color: 'var(--color-bad)' }}>
          Una actualización falló; se siguen usando los últimos precios válidos. {failed.map((f) => `${f.label}: ${f.lastAttempt.error ?? f.lastAttempt.status} (${dt(f.lastAttempt.at)})`).join(' · ')}
        </p>
      )}
      {msg && (
        <p className={`small market-result ${msg.ok ? 'ok' : 'bad'}`} role="status">
          {msg.ok ? <CheckCircle size={16} weight="bold" aria-hidden="true" /> : <WarningCircle size={16} weight="bold" aria-hidden="true" />}
          {msg.text}
        </p>
      )}
      {!ctx.realm && <p className="small muted">Elige una casa de subastas (modo de juego y facción) arriba: sin ella solo hay estadísticas regionales y los precios de compra y venta quedan vacíos.</p>}
    </section>
  );
}
