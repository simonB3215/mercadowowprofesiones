import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, money, PctShort, StatusBadge, STATUS_LABEL, STATUS_HELP, Loading, ErrorBox, Empty, Delta, PageHead, hashQuery, setHashQuery, age, hoursSince, type Status, Money } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';
import { ItemLabel, WowIcon, QUALITY_ES } from '../icons.js';
import { SupplyText } from '../PriceHistory.js';
import { MagnifyingGlass, CaretUp, CaretDown, CaretUpDown, Funnel, CheckCircle, MinusCircle, Scroll, WarningCircle, CaretLeft, CaretRight, Hourglass, DownloadSimple, X, Question, TrendDown, Prohibit, Storefront } from '@phosphor-icons/react';
import { FavButton, FavoriteAlerts, useFavorites } from '../favorites.js';
import { downloadCsv, goldCell, numCell, toCsv } from '../csv.js';
import { toQ } from '../lib.js';
import { cooldownLabel } from '../../../src/engine/cooldown.js';

const SORTS: Array<[string, string]> = [
  ['profitUnit', 'Ganancia por unidad'], ['profitHour', 'Ganancia por hora'], ['profitBatch', 'Ganancia por lote'], ['margin', 'Margen (%)'], ['roi', 'ROI'],
  ['soldPerDay', 'Ventas al día (región)'], ['saleRate', 'Tasa de venta (región)'], ['cost', 'Costo por unidad'],
];

/** Recuento por estado con recuentos reales del servidor. Cada tarjeta filtra la tabla por ese estado (y otra pulsación lo quita). */
const STATUS_ORDER: Array<[Status, typeof CheckCircle, string]> = [
  ['candidato', CheckCircle, 'ok'], ['demanda_incierta', Question, 'info'], ['margen_insuficiente', WarningCircle, 'warn'],
  ['no_rentable', TrendDown, 'bad'], ['datos_insuficientes', MinusCircle, 'neutral'], ['no_vendible', Storefront, 'neutral'], ['no_fabricable', Prohibit, 'neutral'],
];
function StatusFilter({ counts, active, onPick }: { counts: Record<string, number>; active: string; onPick: (s: string) => void }) {
  const shown = STATUS_ORDER.filter(([k]) => (counts?.[k] ?? 0) > 0 || active === k);
  if (!shown.length) return null;
  return (
    <div className="kpis status-filter" role="group" aria-label="Filtrar por estado">
      {shown.map(([k, I, tone]) => (
        <button type="button" key={k} className={`kpi${active === k ? ' on' : ''}`} aria-pressed={active === k} title={STATUS_HELP[k]} onClick={() => onPick(active === k ? '' : k)}>
          <span className={`kpi-icon ${tone}`} aria-hidden="true"><I size={20} weight="bold" /></span>
          <span><span className="kpi-value">{(counts?.[k] ?? 0).toLocaleString('es-ES')}</span><span className="kpi-label">{STATUS_LABEL[k]}</span></span>
        </button>
      ))}
    </div>
  );
}

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
    onlyFav: init.get('onlyFav') === '1',
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

  const favs = useFavorites();
  const favKey = [...favs.ids].sort((a, b) => a - b).join(',');
  // «Solo favoritas» filtra en el servidor por ids; sin favoritas no hay nada que mostrar.
  const favQuery = f.onlyFav ? `&ids=${favKey}` : '';
  const profs = useAsync(() => api(`/api/professions?version=${ctx.version}`), [ctx.version]);
  const data = useAsync(
    () => api(`/api/opportunities?${ctxQuery}&${q.toString()}${profileId ? `&profileId=${profileId}` : ''}${favQuery}&pageSize=50`),
    [ctxQuery, q.toString(), profileId, tick, favQuery],
  );
  const activeFilters = [search.trim(), f.professionId, f.expansion, f.status, f.quality].filter(Boolean).length + [f.onlyKnown, f.hideUnsellable, f.onlyFav].filter(Boolean).length;
  // En el móvil los filtros empiezan plegados para que los resultados se vean antes.
  const [filtersOpen, setFiltersOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 700);
  const resetFilters = () => { setSearch(''); setF((x) => ({ ...x, search: '', professionId: '', expansion: '', status: '', quality: '', onlyKnown: false, hideUnsellable: false, onlyFav: false, page: 1 })); };
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v, page: k === 'page' ? v : 1 }));
  const sortBy = (k: string) => setF((x) => ({ ...x, sort: k, dir: x.sort === k && x.dir === 'desc' ? 'asc' : 'desc', page: 1 }));
  const total = data.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const recipesInCatalog = meta?.catalog?.recipes?.[ctx.version] ?? 0;
  const [exporting, setExporting] = useState<string | null>(null);
  /** Descarga la lista entera con los filtros y el orden actuales (todas las páginas). */
  const exportCsv = async () => {
    setExporting('…');
    try {
      const all = await api(`/api/opportunities?${ctxQuery}&${q.toString()}${profileId ? `&profileId=${profileId}` : ''}${favQuery}&export=1&pageSize=5000`);
      const rows = (all.items as any[]).map((i) => [
        i.name, i.profession, i.output?.name ?? '', goldCell(toQ(i.costUnit)), goldCell(toQ(i.sellPrice)), i.sellScope ?? '',
        goldCell(toQ(i.profitUnit)), goldCell(toQ(i.profitHour)), numCell(toQ(i.marginPct)), i.roiUndefined ? '' : numCell(toQ(i.roiPct)),
        numCell(i.demand?.soldPerDay ?? null), numCell(i.demand?.saleRate ?? null, 3), i.sellSupply?.quantity != null ? String(i.sellSupply.quantity) : '',
        i.sellCheck ? (i.sellCheck.kind === 'atipico' ? 'Precio atípico' : 'Sin confirmar') : '', STATUS_LABEL[i.status as Status] ?? i.status, i.reasons?.[0] ?? '',
        `https://mercadowowprofesiones.vercel.app/#/receta/${i.recipeId}`,
      ]);
      const csv = toCsv(['Receta', 'Profesión', 'Objeto', 'Costo/unid. (oro)', 'Precio venta (oro)', 'Origen del precio', 'Ganancia/unid. (oro)', 'Ganancia/hora (oro)', 'Margen %', 'ROI %',
        'Ventas/día (región)', 'Tasa de venta', 'En venta', 'Aviso de precio', 'Estado', 'Motivo', 'Enlace'], rows);
      downloadCsv(`comparador-${ctx.realm ?? ctx.region}-${new Date().toLocaleDateString('sv-SE')}.csv`, csv);
      setExporting(null);
    } catch (e) { setExporting((e as Error).message); }
  };

  const th = (k: string, label: string) => (
    <th className="num" aria-sort={f.sort === k ? (f.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="sort" onClick={() => sortBy(k)}>
        {label}
        {f.sort === k
          ? (f.dir === 'asc' ? <CaretUp size={12} weight="bold" aria-hidden="true" /> : <CaretDown size={12} weight="bold" aria-hidden="true" />)
          : <CaretUpDown size={12} aria-hidden="true" />}
      </button>
    </th>
  );

  return (
    <div>
      <PageHead title="Comparador de recetas">
        Qué recetas dan más oro: lo que cuestan los materiales frente a lo que cobras al venderla en tu casa de subastas (ya descontada la comisión).
        Pulsa una receta para ver el detalle. «—» significa que falta el precio.
      </PageHead>
      <MarketStatus />
      {meta && !meta.error && recipesInCatalog === 0 && (
        <div className="alert warn" role="note">
          <WarningCircle size={20} weight="bold" aria-hidden="true" />
          <div>
            <p><strong>El catálogo de recetas de WoW Forever está vacío.</strong></p>
            <p>{meta?.blizzardConfigured
              ? 'Las credenciales de Blizzard están configuradas. Ejecuta «npm run sync:catalog -- us» desde el proyecto para descargar profesiones, recetas y objetos.'
              : 'Faltan las credenciales de la API de Blizzard (BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET). Sin catálogo verificable no se muestran recetas reales.'}
            </p>
          </div>
        </div>
      )}
      <details className="card cmp-filters" open={filtersOpen} onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="icon-inline"><Funnel size={18} aria-hidden="true" /> Filtros{activeFilters > 0 && <span className="badge b-info">{activeFilters} activo{activeFilters > 1 ? "s" : ""}</span>}</summary>
        <div className="row">
          <label className="field" style={{ flex: '2 1 220px' }}>Buscar por nombre
            <span className="input-icon">
              <MagnifyingGlass size={16} aria-hidden="true" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Receta u objeto" />
            </span>
          </label>
          <label className="field">Profesión
            <select value={f.professionId} onChange={(e) => set('professionId', e.target.value)}>
              <option value="">Todas</option>
              {(profs.data?.professions ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.recipes})</option>)}
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
              {[...Object.keys(QUALITY_ES), 'DESCONOCIDA'].map((x) => <option key={x} value={x} className={`opt-q-${x.toLowerCase()}`}>{QUALITY_ES[x] ?? 'Desconocida'}</option>)}
            </select>
          </label>
          <label className="field">Ordenar por
            <select value={f.sort} onChange={(e) => set('sort', e.target.value)}>
              {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="check"><input type="checkbox" checked={f.onlyKnown} onChange={(e) => set('onlyKnown', e.target.checked)} disabled={!profileId} /> Solo recetas conocidas{!profileId && ' (elige un perfil manual arriba)'}</label>
          <label className="check"><input type="checkbox" checked={f.hideUnsellable} onChange={(e) => set('hideUnsellable', e.target.checked)} /> Ocultar resultados no vendibles</label>
          <label className="check"><input type="checkbox" checked={f.onlyFav} onChange={(e) => set('onlyFav', e.target.checked)} /> Solo favoritas ({favs.ids.length})</label>
          {activeFilters > 0 && (
            <button type="button" className="link cmp-reset" onClick={resetFilters}><X size={14} aria-hidden="true" />Quitar filtros ({activeFilters})</button>
          )}
        </div>
      </details>

      <FavoriteAlerts />
      {data.data && (
        <div className="cmp-toolbar">
          <button type="button" onClick={exportCsv} disabled={exporting === '…' || total === 0}>
            <DownloadSimple size={16} aria-hidden="true" />{exporting === '…' ? 'Preparando…' : `Exportar CSV (${total})`}
          </button>
          {exporting && exporting !== '…' && <span className="small lv-error" role="alert">No se pudo exportar: {exporting}</span>}
        </div>
      )}
      {data.data && (
        <>
          <StatusFilter counts={data.data.counts} active={f.status} onPick={(v) => set('status', v)} />
          <p className="small muted" aria-live="polite">
            {total.toLocaleString('es-ES')} {total === 1 ? 'receta' : 'recetas'}{f.status ? ` con estado «${STATUS_LABEL[f.status as Status]}»` : ''}.
            {!profileId && ' Sin perfil manual no se comprueba si tu personaje conoce cada receta.'}
          </p>
          <details className="cmp-help small">
            <summary>Cómo leer la tabla</summary>
            <ul>
              <li><strong>Costo/unid.</strong>: lo que cuestan los materiales para fabricar una unidad, con los precios actuales.</li>
              <li><strong>Precio venta</strong>: precio al que se vende el objeto y cuántas unidades hay publicadas. Si solo hay una publicación, el precio es poco fiable.</li>
              <li><strong>Ganancia est./unid.</strong>: lo que te queda por unidad tras pagar materiales y la comisión de la subasta. ROI = ganancia ÷ costo.</li>
              <li><strong>Por hora</strong>: lo que ganarías en una hora fabricando sin parar, según el tiempo de lanzamiento de Wowhead. No cuenta comprar, viajar ni vender, ni si se vende todo; las recetas con espera no la tienen.</li>
              <li><strong>Ventas</strong>: unidades que se venden al día en toda la región (dato de TradeSkillMaster). Pocas ventas = puede tardar en venderse.</li>
              <li><strong>Estado</strong>: el veredicto. Pulsa las tarjetas de arriba para ver solo un estado; pasa el ratón por encima para leer qué significa.</li>
            </ul>
          </details>
        </>
      )}
      {data.loading && <Loading label="Calculando oportunidades…" rows={data.data ? 0 : 6} />}
      {data.error && <ErrorBox error={data.error} onRetry={data.reload} />}
      {data.data && !data.loading && total === 0 && (
        <Empty icon={MagnifyingGlass}>No hay recetas que coincidan con los filtros{recipesInCatalog === 0 ? ' (el catálogo está vacío)' : ''}.</Empty>
      )}
      {data.data && total > 0 && (
        <div className="table-wrap" style={{ opacity: data.loading ? 0.55 : 1, transition: 'opacity 150ms' }} aria-busy={data.loading}>
          <table className="responsive cards-lg">
            <caption className="sr-only">Recetas con costo, precio, ganancia estimada y estado</caption>
            <thead>
              {/* 6 columnas: los datos relacionados van juntos para que la tabla quepa sin desplazarse hacia el lado.
                  El orden por lote o ROI sigue disponible en «Ordenar por». */}
              <tr>
                <th>Receta</th>
                {th('cost', 'Costo/unid.')}
                <th className="num">Precio venta</th>
                {th('profitUnit', 'Ganancia est./unid.')}
                <th className="num">Ventas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((i: any) => {
                const units = i.unitsPerRun ?? (i.yieldRange[0] !== null ? `${i.yieldRange[0]}–${i.yieldRange[1]}` : null);
                return (
                  <tr key={i.recipeId}>
                    <td data-label="Receta" className="cell-main">
                      <span className="cmp-name"><FavButton id={i.recipeId} name={i.name} />
                      <ItemLabel id={i.output?.itemId} quality={i.output?.quality} href={`#/receta/${i.recipeId}`} name={i.name}
                        sub={<span className="cmp-sub">
                          <WowIcon kind="profession" id={i.professionId} px={14} />{i.profession}
                          {i.output?.name && i.output.name !== i.name && <> · {i.output.name}</>}
                        </span>} /></span>
                      {i.cooldown > 0 && (
                        <span className="badge b-info cmp-cooldown" title="Tiempo de reutilización (Wowhead): no se puede fabricar seguida. La ganancia es por fabricación.">
                          <Hourglass size={12} weight="bold" aria-hidden="true" /> 1 cada {cooldownLabel(i.cooldown)}
                        </span>
                      )}
                    </td>
                    <td data-label="Costo/unid." className="num">
                      <Money v={i.costUnit} />
                      {units !== null && units !== 1 && <div className="small muted">{units} por fabricación</div>}
                    </td>
                    <td data-label="Precio venta" className="num">
                      <Money v={i.sellPrice} /><div className="small muted">{i.sellScope}</div>
                      {i.sellSupply && <div className="small"><SupplyText s={i.sellSupply} /></div>}
                      {i.sellCheck && (
                        <span className="badge b-warn" title={i.sellCheck.kind === 'atipico' ? 'Muy por encima del valor regional de TSM' : 'Sin precio regional para confirmarlo'}>
                          {i.sellCheck.kind === 'atipico' ? 'Precio atípico' : 'Sin confirmar'}
                        </span>
                      )}
                    </td>
                    <td data-label="Ganancia est./unid." className="num">
                      <Delta v={i.profitUnit} />
                      <div className="small muted">ROI {i.roiUndefined ? 'no definido' : <PctShort v={i.roiPct} />}</div>
                      {units !== null && units !== 1 && <div className="small muted">Lote: <Money v={i.profitBatch} /></div>}
                      {i.profitHour && <div className="small cmp-hour" title={`Fabricando sin parar: ${i.castSeconds} s por fabricación (Wowhead), sin contar compras ni viajes`}><Money v={i.profitHour} /> por hora</div>}
                    </td>
                    <td data-label="Ventas" className="num">
                      {i.demand?.soldPerDay != null
                        ? <><strong>{i.demand.soldPerDay}</strong><div className="small muted">al día en la región</div></>
                        : <span className="small muted">sin datos de ventas</span>}
                      <div className="small muted">Precio de hace {i.sourceTime ? age(hoursSince(i.sourceTime)) : '—'}</div>
                      {i.freshness.stale && <span className="badge b-warn">Desactualizado</span>}
                    </td>
                    <td data-label="Estado" className="cmp-status">
                      <StatusBadge s={i.status} />
                      <div className="cmp-margin">Margen {i.marginPct ? <PctShort v={i.marginPct} /> : '—'}</div>
                      <div className="small muted">{i.reasons[0]}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data.data && total > 50 && (
        <nav className="pager" aria-label="Paginación">
          <button onClick={() => set('page', f.page - 1)} disabled={f.page <= 1}><CaretLeft size={16} aria-hidden="true" />Anterior</button>
          <span className="small">Página {f.page} de {pages}</span>
          <button onClick={() => set('page', f.page + 1)} disabled={f.page >= pages}>Siguiente<CaretRight size={16} aria-hidden="true" /></button>
        </nav>
      )}
    </div>
  );
}
