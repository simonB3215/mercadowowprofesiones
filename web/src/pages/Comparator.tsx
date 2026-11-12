import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, money, PctShort, StatusBadge, STATUS_LABEL, Loading, ErrorBox, DemoBanner, hashQuery, setHashQuery, age, hoursSince, type Status } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';

const SORTS: Array<[string, string]> = [['profitUnit', 'Ganancia por unidad'], ['profitBatch', 'Ganancia por lote'], ['roi', 'ROI'], ['cost', 'Costo por unidad']];

export function Comparator() {
  const { ctx, ctxQuery, profileId, meta } = useApp();
  const init = hashQuery();
  const [f, setF] = useState({
    search: init.get('search') ?? '',
    professionId: init.get('professionId') ?? '',
    expansion: init.get('expansion') ?? '',
    status: init.get('status') ?? '',
    quality: init.get('quality') ?? '',
    sort: init.get('sort') ?? 'profitUnit',
    dir: init.get('dir') ?? 'desc',
    onlyKnown: init.get('onlyKnown') === '1',
    hideUnsellable: init.get('hideUnsellable') === '1',
    page: Number(init.get('page') ?? 1),
  });
  const [search, setSearch] = useState(f.search);
  useEffect(() => {
    const t = setTimeout(() => setF((x) => (x.search === search ? x : { ...x, search, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [search]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('market-updated', on);
    return () => window.removeEventListener('market-updated', on);
  }, []);

  const q = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v === '' || v === false || (k === 'page' && v === 1)) continue;
      p.set(k, v === true ? '1' : String(v));
    }
    return p;
  }, [f]);
  useEffect(() => setHashQuery('/', q), [q]);

  const profs = useAsync(() => api(`/api/professions?version=${ctx.version}`), [ctx.version]);
  const data = useAsync(
    () => api(`/api/opportunities?${ctxQuery}&${q.toString()}${profileId ? `&profileId=${profileId}` : ''}&pageSize=50`),
    [ctxQuery, q.toString(), profileId, tick],
  );
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v, page: k === 'page' ? v : 1 }));
  const sortBy = (k: string) => setF((x) => ({ ...x, sort: k, dir: x.sort === k && x.dir === 'desc' ? 'asc' : 'desc', page: 1 }));
  const total = data.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const recipesInCatalog = meta?.catalog?.recipes?.[ctx.version] ?? 0;

  const th = (k: string, label: string) => (
    <th className="num" aria-sort={f.sort === k ? (f.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="sort" onClick={() => sortBy(k)}>{label}{f.sort === k ? (f.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
    </th>
  );

  return (
    <div>
      <DemoBanner />
      <h1>Comparador de recetas</h1>
      <p className="muted small">Costo de fabricación frente a ingreso neto de venta. Los valores ausentes se muestran como «—» y nunca se tratan como cero.</p>
      <MarketStatus />
      {ctx.version !== 'demo' && recipesInCatalog === 0 && (
        <div className="alert warn" role="note">
          <p><strong>El catálogo de recetas de Retail está vacío.</strong></p>
          <p>{meta?.blizzardConfigured
            ? 'Las credenciales de Blizzard están configuradas. Ejecuta «npm run sync:catalog -- us» desde el proyecto para descargar profesiones, recetas y objetos.'
            : 'Faltan las credenciales de la API de Blizzard (BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET). Sin catálogo verificable no se muestran recetas reales.'}
          </p>
          <p>Mientras tanto puedes probar la aplicación con la versión <strong>«DEMO — datos ficticios»</strong> del selector.</p>
        </div>
      )}
      <section className="card" aria-label="Filtros">
        <div className="row">
          <label className="field" style={{ flex: '2 1 220px' }}>Buscar por nombre
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Receta u objeto" />
          </label>
          <label className="field">Profesión
            <select value={f.professionId} onChange={(e) => set('professionId', e.target.value)}>
              <option value="">Todas</option>
              {(profs.data?.professions ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.recipes})</option>)}
            </select>
          </label>
          <label className="field">Expansión
            <select value={f.expansion} onChange={(e) => set('expansion', e.target.value)}>
              <option value="">Todas</option>
              {(profs.data?.expansions ?? []).map((x: any) => <option key={x.expansion} value={x.expansion}>{x.expansion}</option>)}
            </select>
          </label>
          <label className="field">Estado
            <select value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Todos</option>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="field">Calidad del objeto
            <select value={f.quality} onChange={(e) => set('quality', e.target.value)}>
              <option value="">Todas</option>
              {['POOR', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'DESCONOCIDA'].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="field">Ordenar por
            <select value={f.sort} onChange={(e) => set('sort', e.target.value)}>
              {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="check"><input type="checkbox" checked={f.onlyKnown} onChange={(e) => set('onlyKnown', e.target.checked)} disabled={!profileId} /> Solo recetas conocidas{!profileId && ' (requiere perfil)'}</label>
          <label className="check"><input type="checkbox" checked={f.hideUnsellable} onChange={(e) => set('hideUnsellable', e.target.checked)} /> Ocultar resultados no vendibles</label>
        </div>
      </section>

      {data.data && (
        <p className="small muted" aria-live="polite">
          {total} receta(s).{' '}
          {Object.entries(data.data.counts as Record<Status, number>).map(([k, n]) => `${STATUS_LABEL[k as Status]}: ${n}`).join(' · ')}
          {!profileId && ' · Viabilidad del personaje sin confirmar.'}
        </p>
      )}
      {data.loading && <Loading label="Calculando oportunidades…" />}
      {data.error && <ErrorBox error={data.error} onRetry={data.reload} />}
      {data.data && !data.loading && total === 0 && (
        <div className="empty card">No hay recetas que coincidan con los filtros{recipesInCatalog === 0 && ctx.version !== 'demo' ? ' (el catálogo está vacío)' : ''}.</div>
      )}
      {data.data && total > 0 && (
        <div className="table-wrap" style={{ opacity: data.loading ? 0.5 : 1 }}>
          <table className="responsive">
            <caption className="skip">Recetas con costo, precio, ganancia y estado</caption>
            <thead>
              <tr>
                <th>Receta / objeto</th>
                <th>Profesión</th>
                <th className="num">Unid./lote</th>
                {th('cost', 'Costo/unid.')}
                <th className="num">Precio venta</th>
                {th('profitUnit', 'Ganancia/unid.')}
                {th('profitBatch', 'Ganancia/lote')}
                {th('roi', 'ROI')}
                <th className="num">Demanda regional</th>
                <th>Antigüedad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((i: any) => (
                <tr key={i.recipeId}>
                  <td data-label="Receta">
                    <a href={`#/receta/${i.recipeId}`}>{i.name}</a>
                    {i.output?.name && i.output.name !== i.name && <div className="small muted">{i.output.name}{i.output.quality ? ` · ${i.output.quality}` : ''}</div>}
                  </td>
                  <td data-label="Profesión">{i.profession}<div className="small muted">{i.expansion}</div></td>
                  <td data-label="Unid./lote" className="num">{i.unitsPerRun ?? (i.yieldRange[0] !== null ? `${i.yieldRange[0]}–${i.yieldRange[1]}` : '—')}</td>
                  <td data-label="Costo/unid." className="num">{money(i.costUnit)}</td>
                  <td data-label="Precio venta" className="num">{money(i.sellPrice)}<div className="small muted">{i.sellScope}</div></td>
                  <td data-label="Ganancia/unid." className="num">{money(i.profitUnit)}</td>
                  <td data-label="Ganancia/lote" className="num">{money(i.profitBatch)}</td>
                  <td data-label="ROI" className="num">{i.roiUndefined ? 'no definido' : <PctShort v={i.roiPct} />}</td>
                  <td data-label="Demanda regional" className="num">
                    {i.demand ? <>tasa {i.demand.saleRate ?? '—'}<div className="small muted">{i.demand.soldPerDay ?? '—'} /día (región)</div></> : '—'}
                  </td>
                  <td data-label="Antigüedad" className="small">{i.sourceTime ? age(hoursSince(i.sourceTime)) : '—'}{i.freshness.stale && <div><span className="badge b-warn">Desactualizado</span></div>}</td>
                  <td data-label="Estado"><StatusBadge s={i.status} /><div className="small muted">{i.reasons[0]}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.data && total > 50 && (
        <nav className="pager" aria-label="Paginación">
          <button onClick={() => set('page', f.page - 1)} disabled={f.page <= 1}>Anterior</button>
          <span className="small">Página {f.page} de {pages}</span>
          <button onClick={() => set('page', f.page + 1)} disabled={f.page >= pages}>Siguiente</button>
        </nav>
      )}
    </div>
  );
}
