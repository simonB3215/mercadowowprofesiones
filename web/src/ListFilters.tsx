/**
 * Filtros de lista comunes (los mismos que el Comparador): buscar por nombre, profesión, estado, calidad, orden y casillas
 * (favoritas, conocidas, vendibles…). Filtra en el navegador la lista que ya trajo la página y guarda la elección en la
 * dirección (#/pagina?search=…) para que sobreviva a recargar o compartir el enlace.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { hashQuery, setHashQuery } from './lib.js';
import { QUALITY_ES } from './icons.js';
import { MagnifyingGlass, SlidersHorizontal, X, ArrowDown, ArrowUp } from '@phosphor-icons/react';
import { t, locale } from './i18n.js';

export interface SortOpt<T> { key: string; label: string; get: (r: T) => number | string | null | undefined }
export interface CheckOpt<T> { key: string; label: string; test: (r: T) => boolean; disabled?: boolean; hint?: string }
export interface FilterSpec<T> {
  /** Ruta de la página para guardar los filtros en la dirección (p. ej. «/pociones»); sin ruta no se guardan. */
  path?: string;
  name: (r: T) => string | null | undefined;
  searchLabel?: string;
  searchPlaceholder?: string;
  /** Texto extra donde también busca (p. ej. el id del objeto). */
  searchExtra?: (r: T) => string;
  profession?: (r: T) => { id: string | number; name: string } | null | undefined;
  professionLabel?: string;
  status?: { label: string; get: (r: T) => string | null | undefined; options: Array<[string, string]> };
  quality?: (r: T) => string | null | undefined;
  sorts?: SortOpt<T>[];
  /** Orden inicial; «» = el que trae el servidor. */
  defaultSort?: string;
  checks?: CheckOpt<T>[];
  /** Cambia cuando cambia algo de fuera que usan las casillas (favoritas, perfil…), para volver a filtrar. */
  depsKey?: string;
}

/** Minúsculas y sin tildes: «mana» encuentra «Poción de maná». */
const fold = (s: string) => s.toLocaleLowerCase(locale()).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const num = (v: unknown) => (typeof v === 'number' ? v : v && typeof v === 'object' && 'n' in (v as any) ? Number((v as any).n) / Number((v as any).d) : null);
/** Convierte importes racionales ({n, d}) y números a número para ordenar; null si no hay dato. */
export const sortNum = (v: unknown): number | null => { const n = num(v); return n === null || Number.isNaN(n) ? null : n; };

export function useListFilters<T>(rows: T[], specIn: FilterSpec<T>, extraActive = 0, onReset?: () => void) {
  // La página crea el objeto en cada render: se lee desde una referencia para que la lista filtrada solo cambie
  // cuando cambian las filas o los filtros (si no, «Mostrar más» se reiniciaría en cada render).
  const specRef = useRef(specIn);
  specRef.current = specIn;
  const spec = specIn;
  const init = spec.path ? hashQuery() : new URLSearchParams();
  const [f, setF] = useState(() => ({
    search: init.get('search') ?? '',
    prof: init.get('prof') ?? '',
    status: init.get('status') ?? '',
    quality: init.get('quality') ?? '',
    sort: init.get('sort') ?? spec.defaultSort ?? '',
    dir: init.get('dir') === 'asc' ? 'asc' : 'desc',
    checks: new Set((init.get('checks') ?? '').split(',').filter(Boolean)),
  }));
  const [search, setSearch] = useState(f.search);
  useEffect(() => { const id = setTimeout(() => setF((x) => (x.search === search ? x : { ...x, search })), 250); return () => clearTimeout(id); }, [search]);

  useEffect(() => {
    if (!spec.path) return;
    // Solo en la lista: en la ficha de un objeto (#/ruta/123) no se toca la dirección.
    const route = location.hash.slice(1).split('?')[0];
    if (route !== spec.path) return;
    const p = hashQuery();
    const put = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
    put('search', f.search); put('prof', f.prof); put('status', f.status); put('quality', f.quality);
    put('sort', f.sort === (spec.defaultSort ?? '') ? '' : f.sort); put('dir', f.dir === 'asc' ? 'asc' : '');
    put('checks', [...f.checks].sort().join(','));
    setHashQuery(spec.path, p);
  }, [f, spec.path]);

  const professions = useMemo(() => {
    if (!spec.profession) return [];
    const m = new Map<string, { id: string; name: string; n: number }>();
    for (const r of rows) {
      const p = spec.profession(r);
      if (!p) continue;
      const k = String(p.id);
      const e = m.get(k) ?? { id: k, name: p.name, n: 0 };
      e.n++; m.set(k, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, locale()));
  }, [rows]);

  const qualities = useMemo(() => {
    if (!spec.quality) return [];
    const seen = new Set(rows.map((r) => spec.quality!(r) ?? 'DESCONOCIDA'));
    return [...Object.keys(QUALITY_ES), 'DESCONOCIDA'].filter((q) => seen.has(q));
  }, [rows]);

  const list = useMemo(() => {
    const spec = specRef.current;
    const s = fold(f.search.trim());
    const checks = (spec.checks ?? []).filter((c) => f.checks.has(c.key) && !c.disabled);
    let out = rows.filter((r) => {
      if (s) {
        const hay = fold(`${spec.name(r) ?? ''} ${spec.searchExtra?.(r) ?? ''}`);
        if (!hay.includes(s)) return false;
      }
      if (f.prof && String(spec.profession?.(r)?.id ?? '') !== f.prof) return false;
      if (f.status && spec.status?.get(r) !== f.status) return false;
      if (f.quality && (spec.quality?.(r) ?? 'DESCONOCIDA') !== f.quality) return false;
      return checks.every((c) => c.test(r));
    });
    const sort = spec.sorts?.find((x) => x.key === f.sort);
    if (sort) {
      const sign = f.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const va = sort.get(a); const vb = sort.get(b);
        // Sin dato siempre al final, sea cual sea el sentido.
        if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
        if (vb === null || vb === undefined) return -1;
        if (typeof va === 'string' || typeof vb === 'string') return sign * String(va).localeCompare(String(vb), locale());
        return sign * (va - vb);
      });
    }
    return out;
  }, [rows, f, specIn.depsKey]);

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k: string, on: boolean) => setF((x) => { const c = new Set(x.checks); if (on) c.add(k); else c.delete(k); return { ...x, checks: c }; });
  const more = [f.status, f.quality].filter(Boolean).length + [...f.checks].length;
  const active = more + [search.trim(), f.prof].filter(Boolean).length + extraActive;
  const reset = () => {
    setSearch('');
    setF((x) => ({ ...x, search: '', prof: '', status: '', quality: '', checks: new Set() }));
    onReset?.();
  };
  const hasMore = Boolean(spec.sorts?.length || spec.status || spec.quality || spec.checks?.length);

  const ui = (
    <div className="lf">
      <div className="row cmp-simple">
        <label className="field" style={{ flex: '2 1 220px' }}>{t(spec.searchLabel ?? 'Buscar por nombre')}<span className="input-icon">
            <MagnifyingGlass size={16} aria-hidden="true" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t(spec.searchPlaceholder ?? 'Nombre')} />
          </span>
        </label>
        {spec.profession && professions.length > 1 && (
          <label className="field">{t(spec.professionLabel ?? 'Profesión')}<select value={f.prof} onChange={(e) => set('prof', e.target.value)}>
              <option value="">{t('Todas')}</option>
              {professions.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.n})</option>)}
            </select>
          </label>
        )}
      </div>
      {hasMore && (
        <details className="card cmp-more" open={more > 0 || undefined}>
          <summary className="icon-inline"><SlidersHorizontal size={18} aria-hidden="true" />{' '}{t('Más opciones')}{more > 0 && <span className="badge b-info">{more}{' '}{t('activo')}{more > 1 ? 's' : ''}</span>}</summary>
          <div className="row">
            {spec.sorts && spec.sorts.length > 0 && (
              <label className="field">{t('Ordenar por')}<span className="lf-sort">
                  <select value={f.sort} onChange={(e) => set('sort', e.target.value)}>
                    {spec.defaultSort === '' && <option value="">{t('Orden por defecto')}</option>}
                    {spec.sorts.map((s) => <option key={s.key} value={s.key}>{t(s.label)}</option>)}
                  </select>
                  <button type="button" className="lf-dir" disabled={!f.sort} onClick={() => set('dir', f.dir === 'asc' ? 'desc' : 'asc')}
                    title={f.dir === 'asc' ? t('De menor a mayor') : t('De mayor a menor')} aria-label={f.dir === 'asc' ? t('De menor a mayor') : t('De mayor a menor')}>
                    {f.dir === 'asc' ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}
                  </button>
                </span>
              </label>
            )}
            {spec.status && (
              <label className="field">{t(spec.status.label)}<select value={f.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="">{t('Todos')}</option>
                  {spec.status.options.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
                </select>
              </label>
            )}
            {spec.quality && qualities.length > 1 && (
              <label className="field">{t('Calidad del objeto')}<select value={f.quality} onChange={(e) => set('quality', e.target.value)}>
                  <option value="">{t('Todas')}</option>
                  {qualities.map((x) => <option key={x} value={x} className={`opt-q-${x.toLowerCase()}`}>{QUALITY_ES[x] ? t(QUALITY_ES[x]) : t('Desconocida')}</option>)}
                </select>
              </label>
            )}
          </div>
          {(spec.checks?.length || active > 0) && (
            <div className="row" style={{ marginTop: 8 }}>
              {(spec.checks ?? []).map((c) => (
                <label key={c.key} className="check"><input type="checkbox" checked={f.checks.has(c.key) && !c.disabled} disabled={c.disabled} onChange={(e) => toggle(c.key, e.target.checked)} />{' '}{t(c.label)}{c.disabled && c.hint ? t(c.hint) : ''}</label>
              ))}
              {active > 0 && <button type="button" className="link cmp-reset" onClick={reset}><X size={14} aria-hidden="true" />{t('Quitar filtros (')}{active})</button>}
            </div>
          )}
        </details>
      )}
      {!hasMore && active > 0 && <button type="button" className="link cmp-reset" onClick={reset}><X size={14} aria-hidden="true" />{t('Quitar filtros (')}{active})</button>}
    </div>
  );
  return { list, ui, active, reset };
}
