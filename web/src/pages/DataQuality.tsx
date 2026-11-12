import React from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, DemoBanner, dt, age } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';

export function DataQuality() {
  const { ctx, ctxQuery, meta } = useApp();
  const st = useAsync(() => api(`/api/market/status?${ctxQuery}`), [ctxQuery]);
  const cov = useAsync(() => api(`/api/coverage?version=${ctx.version}`), [ctx.version]);
  return (
    <div>
      <DemoBanner />
      <h1>Calidad de datos</h1>
      <p className="muted small">«Todas las profesiones» no oculta lagunas: aquí se ve la cobertura real, los errores y la antigüedad de cada fuente.</p>
      <MarketStatus />
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Archivos de precios (TSM)</h2>
        {st.loading ? <Loading /> : st.error ? <ErrorBox error={st.error} /> : (
          <div className="table-wrap">
            <table className="responsive">
              <thead><tr><th>Archivo</th><th>Ámbito</th><th>Escaneo de origen</th><th>Última sincronización</th><th className="num">Filas</th><th>Vigencia</th><th>Último intento</th></tr></thead>
              <tbody>
                {st.data.files.map((f: any) => (
                  <tr key={f.kind}>
                    <td data-label="Archivo">{f.label}</td>
                    <td data-label="Ámbito">{f.scope}</td>
                    <td data-label="Escaneo">{f.active ? `${dt(f.active.sourceTime)} (${age(f.sourceAgeHours)})` : '—'}</td>
                    <td data-label="Sincronización">{f.active ? dt(f.active.fetchedAt) : '—'}</td>
                    <td data-label="Filas" className="num">{f.active?.rows ?? '—'}</td>
                    <td data-label="Vigencia">{f.active ? (f.stale ? `Desactualizado (máx. ${f.maxAgeHours} h)` : `Vigente (máx. ${f.maxAgeHours} h)`) : 'Sin datos válidos'}</td>
                    <td data-label="Último intento" className="small">{f.lastAttempt ? `${f.lastAttempt.status} · ${dt(f.lastAttempt.at)}${f.lastAttempt.error ? ` · ${f.lastAttempt.error}` : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">Los commodities y las estadísticas regionales son de toda la región; solo «Objetos del reino» es específico del reino.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Cobertura del catálogo (Blizzard)</h2>
        {!meta?.blizzardConfigured && ctx.version !== 'demo' && <div className="alert warn"><p>Credenciales de Blizzard no configuradas en el servidor: el catálogo de Retail no se puede sincronizar.</p></div>}
        {cov.loading ? <Loading /> : cov.error ? <ErrorBox error={cov.error} /> : (
          <>
            <p className="small">Última sincronización: {cov.data.lastRun ? `${cov.data.lastRun.status} · ${dt(cov.data.lastRun.finished_at ?? cov.data.lastRun.started_at)}${cov.data.lastRun.error ? ` · ${cov.data.lastRun.error}` : ''}` : 'nunca'} · Objetos: {cov.data.items?.total ?? 0} ({cov.data.items?.errors ?? 0} con error)</p>
            <div className="table-wrap">
              <table className="responsive">
                <thead><tr><th>Profesión</th><th>Expansión</th><th className="num">Recetas</th><th className="num">Completas</th><th className="num">Error de descarga</th><th className="num">Rendimiento variable</th><th className="num">Sin objeto</th><th className="num">Sin ingredientes</th></tr></thead>
                <tbody>
                  {cov.data.rows.map((r: any, i: number) => (
                    <tr key={i}>
                      <td data-label="Profesión">{r.profession}</td><td data-label="Expansión">{r.expansion}</td>
                      <td data-label="Recetas" className="num">{r.total}</td><td data-label="Completas" className="num">{r.complete}</td>
                      <td data-label="Error" className="num">{r.with_errors}</td><td data-label="Variable" className="num">{r.variable_yield}</td>
                      <td data-label="Sin objeto" className="num">{r.no_item}</td><td data-label="Sin ingredientes" className="num">{r.no_reagents}</td>
                    </tr>
                  ))}
                  {!cov.data.rows.length && <tr><td colSpan={8} className="empty">Sin catálogo para esta versión.</td></tr>}
                </tbody>
              </table>
            </div>
            {cov.data.errors.length > 0 && (
              <details style={{ marginTop: 8 }}><summary>Motivos de recetas incompletas</summary>
                <ul className="small">{cov.data.errors.map((e: any, i: number) => <li key={i}>{e.n} × {e.reason}</li>)}</ul>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}
