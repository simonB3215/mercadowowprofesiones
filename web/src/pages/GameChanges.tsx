import React, { useMemo, useState } from 'react';
import { api, useAsync, Loading, ErrorBox, Empty, PageHead, hashQuery, setHashQuery, dt } from '../lib.js';
import { Scroll, ArrowUp, ArrowDown, ArrowsDownUp, Wrench, Swap, Info, ArrowSquareOut, Warning, Translate, type Icon } from '@phosphor-icons/react';

type Effect = 'mejora' | 'empeora' | 'mixto' | 'correccion' | 'cambio';
const EFFECT: Record<Effect, { label: string; cls: string; icon: Icon; help: string }> = {
  mejora: { label: 'Mejora', cls: 'b-ok', icon: ArrowUp, help: 'Buff: la clase o raza sale ganando' },
  empeora: { label: 'Empeora', cls: 'b-bad', icon: ArrowDown, help: 'Nerf: la clase o raza sale perdiendo' },
  mixto: { label: 'Mixto', cls: 'b-warn', icon: ArrowsDownUp, help: 'Mejora una cosa y empeora otra' },
  correccion: { label: 'Corrección', cls: 'b-info', icon: Wrench, help: 'Arregla un fallo' },
  cambio: { label: 'Cambio', cls: '', icon: Swap, help: 'Cambia cómo funciona, sin dirección clara' },
};
const SOURCE: Record<string, string> = { hotfix: 'Hotfix', beta: 'Beta' };
const PAGE = 150;

/** Google Translate con el texto del cambio (y su contexto y notas), del inglés al español. Solo texto público de Blizzard. */
const translateUrl = (c: any) =>
  `https://translate.google.com/?sl=en&tl=es&op=translate&text=${encodeURIComponent([c.context, c.text, ...c.notes].filter(Boolean).join('\n\n').slice(0, 4500))}`;

const longDate =(d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** «Cambios del juego»: buffs y nerfs de clases y razas sacados de los hilos oficiales de Blizzard. */
export function GameChanges() {
  const d = useAsync(() => api<any>('/api/game-changes'), []);
  const init = hashQuery();
  const [who, setWho] = useState(init.get('quien') ?? '');
  const [effect, setEffect] = useState(init.get('efecto') ?? '');
  const [source, setSource] = useState(init.get('origen') ?? '');
  const [q, setQ] = useState(init.get('q') ?? '');
  const [limit, setLimit] = useState(PAGE);

  const update = (k: string, v: string, set: (v: string) => void) => {
    set(v);
    setLimit(PAGE);
    const h = hashQuery();
    if (v) h.set(k, v); else h.delete(k);
    setHashQuery('/cambios', h);
  };

  const data = d.data;
  const all: any[] = data?.changes ?? [];
  const classEs: Record<string, string> = Object.fromEntries((data?.classes ?? []).map((c: any) => [c.en, c.es]));
  const raceEs: Record<string, string> = Object.fromEntries((data?.races ?? []).map((c: any) => [c.en, c.es]));
  const specEs: Record<string, string> = data?.specs ?? {};

  const matchesWho = (c: any) => {
    if (!who) return true;
    const [k, v] = who.split(':');
    if (k === 'clase') return v === '*' ? c.kind === 'clase' && !c.className : c.className === v;
    if (k === 'raza') return v === '*' ? c.kind === 'raza' : c.race === v;
    return true;
  };
  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () => all.filter((c) => matchesWho(c) && (!effect || c.effect === effect) && (!source || c.source === source)
      && (!needle || `${c.text} ${c.notes.join(' ')} ${c.context ?? ''} ${c.path.join(' ')}`.toLowerCase().includes(needle))),
    [all, who, effect, source, needle],
  );

  /** Balance por clase o raza: cuántas mejoras y empeoramientos tiene cada una (con el resto de filtros). */
  const balance = useMemo(() => {
    const rows = new Map<string, { key: string; label: string; mejora: number; empeora: number; mixto: number; total: number }>();
    for (const c of all) {
      if ((source && c.source !== source) || (needle && !`${c.text} ${c.notes.join(' ')}`.toLowerCase().includes(needle))) continue;
      const keys = [c.className ? [`clase:${c.className}`, classEs[c.className] ?? c.className] : null, c.race ? [`raza:${c.race}`, raceEs[c.race] ?? c.race] : null].filter(Boolean) as string[][];
      for (const [key, label] of keys) {
        const r = rows.get(key) ?? { key, label, mejora: 0, empeora: 0, mixto: 0, total: 0 };
        r.total++;
        if (c.effect === 'mejora' || c.effect === 'empeora' || c.effect === 'mixto') r[c.effect as 'mejora']++;
        rows.set(key, r);
      }
    }
    return [...rows.values()].sort((a, b) => (a.key.startsWith('clase') === b.key.startsWith('clase') ? a.label.localeCompare(b.label, 'es') : a.key.startsWith('clase') ? -1 : 1));
  }, [all, source, needle, classEs, raceEs]);

  const shown = list.slice(0, limit);
  const days = [...new Set(shown.map((c) => c.date))];
  const whoLabel = (c: any) => {
    const parts: string[] = [];
    if (c.className) parts.push(classEs[c.className] ?? c.className);
    else if (c.kind === 'clase') parts.push('Todas las clases');
    if (c.spec) parts.push(specEs[c.spec] ?? c.spec);
    if (c.race) parts.push(raceEs[c.race] ?? c.race);
    else if (c.kind === 'raza') parts.push('Razas');
    return parts.join(' · ');
  };

  return (
    <div>
      <PageHead title="Cambios del juego" icon={<Scroll size={26} aria-hidden="true" />}>
        Mejoras (buffs), empeoramientos (nerfs) y correcciones de cada clase y raza de WoW Forever, sacados de los hilos oficiales de Blizzard.
      </PageHead>

      {d.loading && <Loading label="Leyendo los foros de Blizzard…" rows={4} />}
      {d.error && <ErrorBox error={d.error} onRetry={d.reload} />}
      {data && (
        <>
          <div className="card gc-sources">
            <p className="small icon-inline"><Info size={16} aria-hidden="true" />{data.note}</p>
            <ul className="small">
              {data.sources.map((s: any) => (
                <li key={s.topicId}>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.label}<ArrowSquareOut size={12} aria-hidden="true" /></a>
                  {' — '}{s.changes} cambios de clase o raza{s.fetchedAt && <span className="muted"> · leído {dt(s.fetchedAt)}</span>}
                  {s.error && <span className="gc-err"><Warning size={14} aria-hidden="true" />{s.stale ? 'No se pudo actualizar; se muestra la última copia.' : `No se pudo leer: ${s.error}`}</span>}
                </li>
              ))}
            </ul>
          </div>

          <form className="card row gc-filters" onSubmit={(e) => e.preventDefault()} role="search">
            <label className="field">
              Clase o raza
              <select value={who} onChange={(e) => update('quien', e.target.value, setWho)}>
                <option value="">Todas</option>
                <optgroup label="Clases">
                  <option value="clase:*">Todas las clases (general)</option>
                  {(data.classes as any[]).map((c) => <option key={c.en} value={`clase:${c.en}`}>{c.es}</option>)}
                </optgroup>
                <optgroup label="Razas">
                  <option value="raza:*">Todas las razas</option>
                  {(data.races as any[]).map((c) => <option key={c.en} value={`raza:${c.en}`}>{c.es}</option>)}
                </optgroup>
              </select>
            </label>
            <label className="field">
              Efecto
              <select value={effect} onChange={(e) => update('efecto', e.target.value, setEffect)}>
                <option value="">Todos</option>
                {(Object.keys(EFFECT) as Effect[]).map((k) => <option key={k} value={k}>{EFFECT[k].label}</option>)}
              </select>
            </label>
            <label className="field">
              Origen
              <select value={source} onChange={(e) => update('origen', e.target.value, setSource)}>
                <option value="">Todo</option>
                <option value="hotfix">Hotfixes (desde el lanzamiento)</option>
                <option value="beta">Beta (antes del lanzamiento)</option>
              </select>
            </label>
            <label className="field gc-search">
              Buscar (en inglés)
              <input type="search" value={q} placeholder="p. ej. Windfury, cooldown" onChange={(e) => update('q', e.target.value, setQ)} />
            </label>
          </form>

          {balance.length > 0 && (
            <details className="card gc-balance" open={!who}>
              <summary>Balance por clase y raza</summary>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Clase o raza</th><th className="num">Mejoras</th><th className="num">Empeora</th><th className="num">Mixtos</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {balance.map((r) => (
                      <tr key={r.key}>
                        <td><button type="button" className="link-button" onClick={() => update('quien', r.key, setWho)}>{r.label}</button></td>
                        <td className="num gc-up">{r.mejora}</td><td className="num gc-down">{r.empeora}</td><td className="num">{r.mixto}</td><td className="num">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <p className="small muted" aria-live="polite">{list.length} cambios{list.length !== all.length && ` de ${all.length}`}</p>
          {!list.length && <Empty>No hay cambios con estos filtros.</Empty>}
          <ol className="cl-days">
            {days.map((day) => (
              <li key={day} className="cl-day">
                <h2 className="cl-date"><time dateTime={day}>{longDate(day)}</time></h2>
                <ul className="gc-list">
                  {shown.filter((c) => c.date === day).map((c) => {
                    const e = EFFECT[c.effect as Effect];
                    return (
                      <li key={c.id} className="card gc-item">
                        <div className="gc-head">
                          <span className={`badge ${e.cls}`} title={e.help}><e.icon size={13} weight="bold" aria-hidden="true" />{e.label}</span>
                          <strong>{whoLabel(c)}</strong>
                          <span className="muted small">{SOURCE[c.source]}</span>
                          <a className="small gc-link" href={translateUrl(c)} target="_blank" rel="noreferrer" title="Abrir este cambio en Google Translate (inglés → español)"><Translate size={13} aria-hidden="true" />Traducir</a>
                          <a className="small gc-link-plain" href={c.url} target="_blank" rel="noreferrer">Original<ArrowSquareOut size={12} aria-hidden="true" /></a>
                        </div>
                        {c.context && <p className="small muted gc-context">{c.context}</p>}
                        <p className="gc-text" lang="en">{c.text}</p>
                        {c.notes.map((n: string, i: number) => <p key={i} className="small muted gc-note" lang="en">{n}</p>)}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
          {list.length > limit && (
            <button type="button" className="gc-more" onClick={() => setLimit(limit + PAGE)}>Mostrar más ({list.length - limit} restantes)</button>
          )}
        </>
      )}
    </div>
  );
}
