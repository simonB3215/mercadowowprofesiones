import React from 'react';
import { api, useAsync, dt } from './lib.js';
import { Scroll, ArrowSquareOut, Translate, ArrowUp, ArrowDown, ArrowsDownUp, Warning, ArrowRight } from '@phosphor-icons/react';
import { t, locale, isEn } from './i18n.js';

/** Google Translate con el texto de un cambio (y su contexto y notas), del inglés al español. Solo texto público de Blizzard. */
export const translateUrl = (c: { text: string; notes: string[]; context?: string | null }) =>
  `https://translate.google.com/?sl=en&tl=es&op=translate&text=${encodeURIComponent([c.context, c.text, ...c.notes].filter(Boolean).join('\n\n').slice(0, 4500))}`;

const EFFECT: Record<string, { label: string; cls: string; icon: typeof ArrowUp }> = {
  mejora: { label: 'Mejora', cls: 'b-ok', icon: ArrowUp },
  empeora: { label: 'Empeora', cls: 'b-bad', icon: ArrowDown },
  mixto: { label: 'Mixto', cls: 'b-warn', icon: ArrowsDownUp },
};

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const MAX_HIGHLIGHTS = 5;

/** Resumen del último hotfix para la página de inicio: notas por sección y los buffs y nerfs de clases y razas. */
export function PatchNotesSummary() {
  const d = useAsync(() => api<any>('/api/patch-notes?days=1'), []);
  const day = d.data?.days?.[0];
  const highlights: any[] = day ? day.sections.flatMap((s: any) => s.items).filter((it: any) => it.effect && EFFECT[it.effect]) : [];
  return (
    <section className="card pn pn-compact" aria-labelledby="pn-title">
      <div className="pn-head">
        <h2 id="pn-title" className="icon-inline"><Scroll size={22} aria-hidden="true" />{t('Notas del parche del juego')}</h2>
        {day && <span className="small muted">{t('Último hotfix:')}{' '}<time dateTime={day.date}>{longDate(day.date)}</time> · {day.total}{' '}{t('cambios')}</span>}
      </div>
      {d.loading && <p className="small muted">{t('Leyendo el foro de Blizzard…')}</p>}
      {(d.error || (d.data && !day)) && <p className="small pn-err"><Warning size={14} aria-hidden="true" />{t('No se pudieron cargar las notas del parche.')}</p>}
      {day && (
        <>
          <ul className="pn-chips" aria-label={t('Cambios por sección')}>
            {day.sections.map((s: any) => <li key={s.name}>{s.nameEs} <strong>{s.items.length}</strong></li>)}
          </ul>
          {highlights.length === 0 && <p className="small muted">{t('Este hotfix no trae buffs ni nerfs de clases o razas.')}</p>}
          {highlights.length > 0 && (
            <ul className="pn-highlights">
              {highlights.slice(0, MAX_HIGHLIGHTS).map((it: any, k: number) => {
                const e = EFFECT[it.effect];
                return (
                  <li key={k}>
                    <span className={`badge ${e.cls}`}><e.icon size={12} weight="bold" aria-hidden="true" />{e.label}</span>
                    {it.pathEs.length > 0 && <span className="pn-path">{it.pathEs.join(' › ')}</span>}
                    <span className="pn-clamp" lang="en" title={it.text}>{it.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <a className="pn-more icon-inline" href="#/cambios?vista=notas">{t('Ver todas las notas')}{highlights.length > MAX_HIGHLIGHTS ? ` ${t('({n} buffs y nerfs más)', { n: highlights.length - MAX_HIGHLIGHTS })}` : ''}<ArrowRight size={14} weight="bold" aria-hidden="true" />
          </a>
        </>
      )}
    </section>
  );
}

/** Notas del parche del juego (hotfixes oficiales de Blizzard) de los últimos días, completas. */
export function PatchNotes({ days = 3 }: { days?: number }) {
  const d = useAsync(() => api<any>(`/api/patch-notes?days=${days}`), [days]);
  const data = d.data;
  return (
    <section className="card pn" aria-labelledby="pn-title-full">
      <div className="pn-head">
        <h2 id="pn-title-full" className="icon-inline"><Scroll size={22} aria-hidden="true" />{t('Notas del parche del juego')}</h2>
      </div>
      <p className="small muted">{t('Últimos hotfixes de WoW Forever publicados por Blizzard, en inglés (como los publica Blizzard). Usa «Traducir» para verlos en español.')}{data?.source && <> · <a href={data.source.url} target="_blank" rel="noreferrer" className="icon-inline">{t('hilo oficial')}<ArrowSquareOut size={12} aria-hidden="true" /></a>{data.source.fetchedAt && <>{' '}{t('· leído')}{' '}{dt(data.source.fetchedAt)}</>}</>}
      </p>
      {d.loading && <p className="small muted">{t('Leyendo el foro de Blizzard…')}</p>}
      {d.error && <p className="small pn-err"><Warning size={14} aria-hidden="true" />{t('No se pudieron cargar las notas del parche.')}{' '}<button type="button" className="link-button" onClick={d.reload}>{t('Reintentar')}</button></p>}
      {data?.source?.error && <p className="small pn-err"><Warning size={14} aria-hidden="true" />{data.source.stale ? t('No se pudo actualizar desde el foro; se muestra la última copia.') : t('No se pudo leer el foro: {e}', { e: data.source.error })}</p>}
      {(data?.days ?? []).map((day: any, i: number) => (
        <details key={day.date} className="pn-day" open={i === 0}>
          <summary><time dateTime={day.date}>{longDate(day.date)}</time> <span className="muted small">· {day.total}{' '}{t('cambios')}</span></summary>
          {day.sections.map((s: any) => (
            <div key={s.name} className="pn-section">
              <h3>{s.nameEs}</h3>
              <ul>
                {s.items.map((it: any, k: number) => {
                  const e = it.effect ? EFFECT[it.effect] : null;
                  return (
                    <li key={k}>
                      {it.pathEs.length > 0 && <span className="pn-path">{it.pathEs.join(' › ')}</span>}
                      {e && <span className={`badge ${e.cls}`}><e.icon size={12} weight="bold" aria-hidden="true" />{e.label}</span>}
                      {it.context && <span className="muted"> {it.context} — </span>}
                      <span lang="en"> {it.text}</span>
                      {!isEn() && <>{' '}<a className="small pn-tr" href={translateUrl(it)} target="_blank" rel="noreferrer" title={t('Abrir en Google Translate (inglés → español)')}><Translate size={12} aria-hidden="true" />{t('Traducir')}</a></>}
                      {it.notes.map((n: string, j: number) => <p key={j} className="small muted pn-note" lang="en">{n}</p>)}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </details>
      ))}
    </section>
  );
}
