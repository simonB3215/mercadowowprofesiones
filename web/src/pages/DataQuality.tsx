import React from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, dt, age, PageHead } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';import { t } from '../i18n.js';


export function DataQuality() {
  const { ctx, ctxQuery, meta } = useApp();
  const st = useAsync(() => api(`/api/market/status?${ctxQuery}`), [ctxQuery]);
  const cov = useAsync(() => api(`/api/coverage?version=${ctx.version}`), [ctx.version]);
  return (
    <div>
      <PageHead title={t('Calidad de datos')}>{t('Para comprobar de qué fecha son los precios y si al catálogo le falta algo. Si un precio te parece raro, mira aquí su antigüedad. No hace falta para usar la web.')}</PageHead>
      <MarketStatus />
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t('Archivos de precios (TSM)')}</h2>
        {st.loading ? <Loading /> : st.error ? <ErrorBox error={st.error} /> : (
          <div className="table-wrap">
            <table className="responsive">
              <thead><tr><th>{t('Archivo')}</th><th>{t('Ámbito')}</th><th>{t('Escaneo de origen')}</th><th>{t('Última sincronización')}</th><th className="num">{t('Filas')}</th><th>{t('Vigencia')}</th><th>{t('Último intento')}</th></tr></thead>
              <tbody>
                {st.data.files.map((f: any) => (
                  <tr key={f.kind}>
                    <td data-label={t('Archivo')}>{t(f.label)}</td>
                    <td data-label={t('Ámbito')}>{f.scope}</td>
                    <td data-label={t('Escaneo')}>{f.active ? `${dt(f.active.sourceTime)} (${age(f.sourceAgeHours)})` : '—'}</td>
                    <td data-label={t('Sincronización')}>{f.active ? dt(f.active.fetchedAt) : '—'}</td>
                    <td data-label={t('Filas')} className="num">{f.active?.rows ?? '—'}</td>
                    <td data-label={t('Vigencia')}>{f.active ? t(f.stale ? 'Desactualizado (máx. {h} h)' : 'Vigente (máx. {h} h)', { h: f.maxAgeHours }) : t('Sin datos válidos')}</td>
                    <td data-label={t('Último intento')} className="small">{f.lastAttempt ? `${f.lastAttempt.status} · ${dt(f.lastAttempt.at)}${f.lastAttempt.error ? ` · ${f.lastAttempt.error}` : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">{t('Las estadísticas regionales son de toda la región; solo «Casa de subastas» es específica del modo de juego y la facción. WoW Forever no tiene archivo de commodities.')}</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t('Cobertura del catálogo (Blizzard)')}</h2>
        {!meta?.blizzardConfigured && <div className="alert warn"><p>{t('Credenciales de Blizzard no configuradas en el servidor: el catálogo de WoW Forever no se puede sincronizar.')}</p></div>}
        {cov.loading ? <Loading /> : cov.error ? <ErrorBox error={cov.error} /> : (
          <>
            <p className="small">{t('Última sincronización:')}{' '}{cov.data.lastRun ? `${cov.data.lastRun.status} · ${dt(cov.data.lastRun.finished_at ?? cov.data.lastRun.started_at)}${cov.data.lastRun.error ? ` · ${cov.data.lastRun.error}` : ''}` : t('nunca')}{' '}{t('· Objetos:')}{' '}{cov.data.items?.total ?? 0} ({cov.data.items?.errors ?? 0}{' '}{t('con error)')}</p>
            <div className="table-wrap">
              <table className="responsive">
                <thead><tr><th>{t('Profesión')}</th><th>{t('Expansión')}</th><th className="num">{t('Recetas')}</th><th className="num">{t('Completas')}</th><th className="num">{t('Error de descarga')}</th><th className="num">{t('Rendimiento variable')}</th><th className="num">{t('Sin objeto')}</th><th className="num">{t('Sin ingredientes')}</th></tr></thead>
                <tbody>
                  {cov.data.rows.map((r: any, i: number) => (
                    <tr key={i}>
                      <td data-label={t('Profesión')}>{r.profession}</td><td data-label={t('Expansión')}>{r.expansion}</td>
                      <td data-label={t('Recetas')} className="num">{r.total}</td><td data-label={t('Completas')} className="num">{r.complete}</td>
                      <td data-label={t('Error')} className="num">{r.with_errors}</td><td data-label={t('Variable')} className="num">{r.variable_yield}</td>
                      <td data-label={t('Sin objeto')} className="num">{r.no_item}</td><td data-label={t('Sin ingredientes')} className="num">{r.no_reagents}</td>
                    </tr>
                  ))}
                  {!cov.data.rows.length && <tr><td colSpan={8} className="empty">{t('Sin catálogo para esta versión.')}</td></tr>}
                </tbody>
              </table>
            </div>
            {cov.data.errors.length > 0 && (
              <details style={{ marginTop: 8 }}><summary>{t('Motivos de recetas incompletas')}</summary>
                <ul className="small">{cov.data.errors.map((e: any, i: number) => <li key={i}>{e.n} × {e.reason}</li>)}</ul>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}
