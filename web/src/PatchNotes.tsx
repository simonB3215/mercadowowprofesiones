import React from 'react';
import { api, useAsync, dt } from './lib.js';
import { Scroll, ArrowSquareOut, Translate, ArrowUp, ArrowDown, ArrowsDownUp, Warning, ArrowRight } from '@phosphor-icons/react';

/** Google Translate con el texto de un cambio (y su contexto y notas), del inglés al español. Solo texto público de Blizzard. */
export const translateUrl = (c: { text: string; notes: string[]; context?: string | null }) =>
  `https://translate.google.com/?sl=en&tl=es&op=translate&text=${encodeURIComponent([c.context, c.text, ...c.notes].filter(Boolean).join('\n\n').slice(0, 4500))}`;

const EFFECT: Record<string, { label: string; cls: string; icon: typeof ArrowUp }> = {
  mejora: { label: 'Mejora', cls: 'b-ok', icon: ArrowUp },
  empeora: { label: 'Empeora', cls: 'b-bad', icon: ArrowDown },
  mixto: { label: 'Mixto', cls: 'b-warn', icon: ArrowsDownUp },
};

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Notas del parche del juego (hotfixes oficiales de Blizzard) de los últimos días, para la página de inicio. */
export function PatchNotes({ days = 3 }: { days?: number }) {
  const d = useAsync(() => api<any>(`/api/patch-notes?days=${days}`), [days]);
  const data = d.data;
  return (
    <section className="card pn" aria-labelledby="pn-title">
      <div className="pn-head">
        <h2 id="pn-title" className="icon-inline"><Scroll size={22} aria-hidden="true" />Notas del parche del juego</h2>
        <a href="#/cambios" className="small icon-inline">Buffs y nerfs por clase y raza<ArrowRight size={14} aria-hidden="true" /></a>
      </div>
      <p className="small muted">
        Últimos hotfixes de WoW Forever publicados por Blizzard, en inglés (como los publica Blizzard). Usa «Traducir» para verlos en español.
        {data?.source && <> · <a href={data.source.url} target="_blank" rel="noreferrer" className="icon-inline">hilo oficial<ArrowSquareOut size={12} aria-hidden="true" /></a>{data.source.fetchedAt && <> · leído {dt(data.source.fetchedAt)}</>}</>}
      </p>
      {d.loading && <p className="small muted">Leyendo el foro de Blizzard…</p>}
      {d.error && <p className="small pn-err"><Warning size={14} aria-hidden="true" />No se pudieron cargar las notas del parche. <button type="button" className="link-button" onClick={d.reload}>Reintentar</button></p>}
      {data?.source?.error && <p className="small pn-err"><Warning size={14} aria-hidden="true" />{data.source.stale ? 'No se pudo actualizar desde el foro; se muestra la última copia.' : `No se pudo leer el foro: ${data.source.error}`}</p>}
      {(data?.days ?? []).map((day: any, i: number) => (
        <details key={day.date} className="pn-day" open={i === 0}>
          <summary><time dateTime={day.date}>{longDate(day.date)}</time> <span className="muted small">· {day.total} cambios</span></summary>
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
                      {' '}<a className="small pn-tr" href={translateUrl(it)} target="_blank" rel="noreferrer" title="Abrir en Google Translate (inglés → español)"><Translate size={12} aria-hidden="true" />Traducir</a>
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
