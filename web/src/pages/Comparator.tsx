import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, STATUS_LABEL, STATUS_HELP, Loading, ErrorBox, Empty, Delta, PageHead, hashQuery, setHashQuery, age, hoursSince, type Status, Money } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';
import { ItemLabel, WowIcon, QUALITY_ES } from '../icons.js';
import { SupplyText } from '../PriceHistory.js';
import { HowToLearn } from '../RouteTools.js';
import { MagnifyingGlass, CheckCircle, MinusCircle, WarningCircle, CaretLeft, CaretRight, CaretDown, Hourglass, DownloadSimple, X, Question, TrendDown, Prohibit, Storefront, SlidersHorizontal, Fire, ArrowRight, Hammer, ShoppingCart } from '@phosphor-icons/react';
import { FavButton, FavoriteAlerts, useFavorites } from '../favorites.js';
import { downloadCsv, goldCell, numCell, toCsv } from '../csv.js';
import { toQ } from '../lib.js';
import { cooldownLabel } from '../../../src/engine/cooldown.js';
import { t, locale } from '../i18n.js';
import { VerdictBadge, NoSales } from '../verdict.js';

const SORTS: Array<[string, string]> = [
  ['soldPerDay', 'Ventas al día (región)'], ['profitUnit', 'Ganancia por unidad'], ['profitHour', 'Ganancia por hora'], ['profitBatch', 'Ganancia por lote'],
  ['margin', 'Margen (%)'], ['roi', 'ROI'], ['saleRate', 'Tasa de venta (región)'], ['cost', 'Costo por unidad'],
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
    <div className="kpis status-filter" role="group" aria-label={t('Filtrar por estado')}>
      {shown.map(([k, I, tone]) => (
        <button type="button" key={k} className={`kpi${active === k ? ' on' : ''}`} aria-pressed={active === k} title={t(STATUS_HELP[k])} onClick={() => onPick(active === k ? '' : k)}>
          <span className={`kpi-icon ${tone}`} aria-hidden="true"><I size={20} weight="bold" /></span>
          <span><span className="kpi-value">{(counts?.[k] ?? 0).toLocaleString(locale())}</span><span className="kpi-label">{t(STATUS_LABEL[k])}</span></span>
        </button>
      ))}
    </div>
  );
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString(locale(), { maximumFractionDigits: 1 }));
const learnShort = (l: any) => (!l ? '' : l.availability === 'inicial' ? t('se conoce al empezar') : l.availability === 'instructor' ? t('instructor') : t('hay que conseguir la receta'));

/** Lo que se ve al abrir una fila: nivel, dónde se aprende, materiales (comprar o fabricar) y las cuentas. */
function RecipeQuick({ id }: { id: number }) {
  const { ctxQuery, profileId } = useApp();
  const d = useAsync(() => api<any>(`/api/recipes/${id}?${ctxQuery}${profileId ? `&profileId=${profileId}` : ''}`), [id, ctxQuery, profileId]);
  if (d.loading && !d.data) return <Loading rows={2} />;
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  const e = d.data.evaluation;
  const l = d.data.learn;
  const src = new Map<number, any>((d.data.sourcing ?? []).map((s: any) => [s.itemId, s.node]));
  return (
    <div className="cmp-quick">
      <div className="cmp-quick-grid">
        <div>
          <div className="cmp-quick-h">{t('Nivel requerido')}</div>
          <div className="cmp-quick-big">{l ? l.learnedAt : '—'}</div>
          <div className="small muted">{e.profession}</div>
        </div>
        <div>
          <div className="cmp-quick-h">{t('Dónde se aprende')}</div>
          <div>{l ? <HowToLearn r={l} /> : <span className="muted">{t('No se pudo enlazar con los datos de Wowhead: revisa la ficha de la receta.')}</span>}</div>
        </div>
        <div>
          <div className="cmp-quick-h">{t('Cuentas por unidad')}</div>
          <div className="small">{t('Costo')}{' '}<Money v={e.cost.unit} />{' · '}{t('Se vende por')}{' '}<Money v={e.sellPrice.copper} /></div>
          <div className="small">{t('Ganancia')}{' '}<Delta v={e.profit.profitUnit} />{e.demand?.saleRate != null && <>{' · '}{t('se vende el {p} de lo publicado', { p: `${Math.round(e.demand.saleRate * 100)} %` })}</>}</div>
        </div>
      </div>
      <div className="cmp-quick-h" style={{ marginTop: 12 }}>{t('Materiales por fabricación')}</div>
      {!e.reagents.length ? <p className="small muted">{t('Sin materiales en el catálogo.')}</p> : (
        <ul className="cmp-mats">
          {e.reagents.map((r: any) => {
            const n = src.get(r.itemId);
            return (
              <li key={r.itemId}>
                <span className="mono">{r.quantity ?? '?'} ×</span>
                <ItemLabel id={r.itemId} px={18} name={r.name ?? t('Objeto {id}', { id: r.itemId })} />
                <span className="small muted"><Money v={r.price.copper} />{' '}{t('c/u')}</span>
                {n?.choice === 'fabricar'
                  ? <span className="badge b-info" title={t('Sale más barato fabricarlo con otra receta que comprarlo')}><Hammer size={12} weight="bold" aria-hidden="true" />{t('mejor fabricarlo')}</span>
                  : n?.choice === 'comprar'
                    ? <span className="badge b-neutral" title={t('Se compra en la casa de subastas')}><ShoppingCart size={12} weight="bold" aria-hidden="true" />{t('comprar en subasta')}</span>
                    : <span className="badge b-warn">{t('sin precio')}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <a className="icon-inline small" href={`#/receta/${id}`}>{t('Ver todo el detalle')}<ArrowRight size={14} aria-hidden="true" /></a>
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
    sort: init.get('sort') ?? 'soldPerDay',
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
  const [open, setOpen] = useState<number | null>(null);

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
  // Filtros de «Más opciones» (el buscador y la profesión están siempre a la vista).
  const moreFilters = [f.expansion, f.status, f.quality].filter(Boolean).length + [f.onlyKnown, f.hideUnsellable, f.onlyFav].filter(Boolean).length;
  const activeFilters = moreFilters + [search.trim(), f.professionId].filter(Boolean).length;
  const resetFilters = () => { setSearch(''); setF((x) => ({ ...x, search: '', professionId: '', expansion: '', status: '', quality: '', onlyKnown: false, hideUnsellable: false, onlyFav: false, page: 1 })); };
  const set = (k: string, v: any) => { setOpen(null); setF((x) => ({ ...x, [k]: v, page: k === 'page' ? v : 1 })); };
  const total = data.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const recipesInCatalog = meta?.catalog?.recipes?.[ctx.version] ?? 0;
  const items: any[] = data.data?.items ?? [];
  const vc = data.data?.verdicts;
  const bySales = f.sort === 'soldPerDay' && f.dir === 'desc' && f.page === 1;
  // Las más vendidas que dejan al menos 1 plata por unidad (con menos, «deja oro» no dice nada útil).
  const copper = (v: any) => (v ? Number(v.n) / Number(v.d) : 0);
  const bestSellers = bySales ? items.filter((i) => (i.verdict === 'si' || i.verdict === 'poco') && copper(i.profitUnit) >= 100).slice(0, 3) : [];
  const [exporting, setExporting] = useState<string | null>(null);
  /** Descarga la lista entera con los filtros y el orden actuales (todas las páginas). */
  const exportCsv = async () => {
    setExporting('…');
    try {
      const all = await api(`/api/opportunities?${ctxQuery}&${q.toString()}${profileId ? `&profileId=${profileId}` : ''}${favQuery}&export=1&pageSize=5000`);
      const rows = (all.items as any[]).map((i) => [
        i.name, i.profession, i.output?.name ?? '', i.learn ? String(i.learn.learnedAt) : '', goldCell(toQ(i.costUnit)), goldCell(toQ(i.sellPrice)), i.sellScope ?? '',
        goldCell(toQ(i.profitUnit)), goldCell(toQ(i.profitHour)), numCell(toQ(i.marginPct)), i.roiUndefined ? '' : numCell(toQ(i.roiPct)),
        numCell(i.demand?.soldPerDay ?? null), numCell(i.demand?.saleRate ?? null, 3), i.sellSupply?.quantity != null ? String(i.sellSupply.quantity) : '',
        i.sellCheck ? t(i.sellCheck.kind === 'atipico' ? 'Precio atípico' : 'Sin confirmar') : '', t(STATUS_LABEL[i.status as Status] ?? i.status), t(i.reasons?.[0] ?? ''),
        `https://mercadowowprofesiones.vercel.app/#/receta/${i.recipeId}`,
      ]);
      const csv = toCsv(['Receta', 'Profesión', 'Objeto', 'Nivel requerido', 'Costo/unid. (oro)', 'Precio venta (oro)', 'Origen del precio', 'Ganancia/unid. (oro)', 'Ganancia/hora (oro)', 'Margen %', 'ROI %',
        'Ventas/día (región)', 'Tasa de venta', 'En venta', 'Aviso de precio', 'Estado', 'Motivo', 'Enlace'].map((h) => t(h)), rows);
      downloadCsv(`comparador-${ctx.realm ?? ctx.region}-${new Date().toLocaleDateString('sv-SE')}.csv`, csv);
      setExporting(null);
    } catch (e) { setExporting((e as Error).message); }
  };

  return (
    <div>
      <PageHead title={t('Comparador de recetas')}>{t('Las recetas que más se venden en la región y si aún sale a cuenta fabricarlas para vender. Pulsa una fila para ver el nivel que pide, dónde se aprende y qué materiales necesita.')}</PageHead>
      <MarketStatus compact />
      {meta && !meta.error && recipesInCatalog === 0 && (
        <div className="alert warn" role="note">
          <WarningCircle size={20} weight="bold" aria-hidden="true" />
          <div>
            <p><strong>{t('El catálogo de recetas de WoW Forever está vacío.')}</strong></p>
            <p>{meta?.blizzardConfigured
              ? t('Las credenciales de Blizzard están configuradas. Ejecuta «npm run sync:catalog -- us» desde el proyecto para descargar profesiones, recetas y objetos.')
              : t('Faltan las credenciales de la API de Blizzard (BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET). Sin catálogo verificable no se muestran recetas reales.')}
            </p>
          </div>
        </div>
      )}
      <div className="row cmp-simple">
        <label className="field" style={{ flex: '2 1 220px' }}>{t('Buscar por nombre')}<span className="input-icon">
            <MagnifyingGlass size={16} aria-hidden="true" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Receta u objeto')} />
          </span>
        </label>
        <label className="field">{t('Profesión')}<select value={f.professionId} onChange={(e) => set('professionId', e.target.value)}>
            <option value="">{t('Todas')}</option>
            {(profs.data?.professions ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.recipes})</option>)}
          </select>
        </label>
      </div>

      <details className="card cmp-more">
        <summary className="icon-inline"><SlidersHorizontal size={18} aria-hidden="true" />{' '}{t('Más opciones')}{moreFilters > 0 && <span className="badge b-info">{moreFilters}{' '}{t('activo')}{moreFilters > 1 ? 's' : ''}</span>}</summary>
        <div className="row">
          <label className="field">{t('Ordenar por')}<select value={f.sort} onChange={(e) => set('sort', e.target.value)}>
              {SORTS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
            </select>
          </label>
          <label className="field">{t('Estado')}<select value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">{t('Todos')}</option>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
            </select>
          </label>
          <label className="field">{t('Calidad del objeto')}<select value={f.quality} onChange={(e) => set('quality', e.target.value)}>
              <option value="">{t('Todas')}</option>
              {[...Object.keys(QUALITY_ES), 'DESCONOCIDA'].map((x) => <option key={x} value={x} className={`opt-q-${x.toLowerCase()}`}>{QUALITY_ES[x] ?? t('Desconocida')}</option>)}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="check"><input type="checkbox" checked={f.onlyKnown} onChange={(e) => set('onlyKnown', e.target.checked)} disabled={!profileId} />{' '}{t('Solo recetas conocidas')}{!profileId && t(' (elige un perfil manual arriba)')}</label>
          <label className="check"><input type="checkbox" checked={f.hideUnsellable} onChange={(e) => set('hideUnsellable', e.target.checked)} />{' '}{t('Ocultar resultados no vendibles')}</label>
          <label className="check"><input type="checkbox" checked={f.onlyFav} onChange={(e) => set('onlyFav', e.target.checked)} />{' '}{t('Solo favoritas (')}{favs.ids.length})</label>
          {activeFilters > 0 && (
            <button type="button" className="link cmp-reset" onClick={resetFilters}><X size={14} aria-hidden="true" />{t('Quitar filtros (')}{activeFilters})</button>
          )}
        </div>
        {data.data && <StatusFilter counts={data.data.counts} active={f.status} onPick={(v) => set('status', v)} />}
        {data.data && (
          <div className="cmp-toolbar">
            <button type="button" onClick={exportCsv} disabled={exporting === '…' || total === 0}>
              <DownloadSimple size={16} aria-hidden="true" />{exporting === '…' ? t('Preparando…') : t('Exportar CSV ({n})', { n: total })}
            </button>
            {exporting && exporting !== '…' && <span className="small lv-error" role="alert">{t('No se pudo exportar:')}{' '}{exporting}</span>}
          </div>
        )}
        <FavoriteAlerts />
      </details>

      {data.data && vc && total > 0 && (
        <section className="card" aria-label={t('En resumen')}>
          <h2 className="icon-inline" style={{ marginTop: 0 }}><Fire size={20} aria-hidden="true" />{t('En resumen')}</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
            <li>
              {t('De {total}, conviene fabricar para vender {si} y ganan poco {poco}; {no} pierden oro con los precios de hoy.', {
                total: (vc.si + vc.poco + vc.dudoso + vc.no + vc.sin_datos).toLocaleString(locale()), si: vc.si, poco: vc.poco, no: vc.no,
              })}
            </li>
            {bestSellers.length > 0 && (
              <li>
                {t('Las más vendidas que dejan oro:')}{' '}
                {bestSellers.map((i, n) => (
                  <React.Fragment key={i.recipeId}>{n > 0 && ', '}<a href={`#/receta/${i.recipeId}`}>{i.name}</a> (<Money v={i.profitUnit} />, {t('{n} al día', { n: num(i.demand?.soldPerDay) })})</React.Fragment>
                ))}
              </li>
            )}
            {!profileId && <li className="muted">{t('Sin perfil manual no se comprueba si tu personaje conoce cada receta.')}</li>}
          </ul>
        </section>
      )}

      {data.loading && <Loading label={t('Calculando oportunidades…')} rows={data.data ? 0 : 6} />}
      {data.error && <ErrorBox error={data.error} onRetry={data.reload} />}
      {data.data && !data.loading && total === 0 && (
        <Empty icon={MagnifyingGlass}>{t('No hay recetas que coincidan con los filtros')}{recipesInCatalog === 0 ? t(' (el catálogo está vacío)') : ''}.</Empty>
      )}
      {data.data && total > 0 && (
        <>
          <p className="small muted" aria-live="polite">
            {total.toLocaleString(locale())} {total === 1 ? t('receta') : t('recetas')}{f.status ? ` ${t('con estado «{s}»', { s: t(STATUS_LABEL[f.status as Status]) })}` : ''}.
          </p>
          <div className="table-wrap" style={{ opacity: data.loading ? 0.55 : 1, transition: 'opacity 150ms' }} aria-busy={data.loading}>
            <table className="responsive cmp-table">
              <caption className="sr-only">{t('Recetas con ventas, ganancia y si conviene fabricarlas')}</caption>
              <thead>
                <tr>
                  <th>{t('Receta')}</th>
                  <th className="num" title={t('Unidades vendidas al día en toda la región (TradeSkillMaster)')}>{t('Ventas/día')}</th>
                  <th className="num">{t('Ganancia')}</th>
                  <th>{t('¿Conviene?')}</th>
                  <th><span className="sr-only">{t('Detalle')}</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i: any) => {
                  const isOpen = open === i.recipeId;
                  const toggle = () => setOpen(isOpen ? null : i.recipeId);
                  return (
                    <React.Fragment key={i.recipeId}>
                      <tr className={`cmp-row${isOpen ? ' open' : ''}`} onClick={(ev) => { if (!(ev.target as HTMLElement).closest('a,button')) toggle(); }}>
                        <td data-label={t('Receta')} className="cell-main">
                          <span className="cmp-name"><FavButton id={i.recipeId} name={i.name} />
                          <ItemLabel id={i.output?.itemId} quality={i.output?.quality} href={`#/receta/${i.recipeId}`} name={i.name}
                            sub={<span className="cmp-sub">
                              <WowIcon kind="profession" id={i.professionId} px={14} />{i.profession}
                              {i.learn && <> · {t('nivel {n}', { n: i.learn.learnedAt })} · {learnShort(i.learn)}</>}
                            </span>} /></span>
                          {i.cooldown > 0 && (
                            <span className="badge b-info cmp-cooldown" title={t('Tiempo de reutilización (Wowhead): no se puede fabricar seguida. La ganancia es por fabricación.')}>
                              <Hourglass size={12} weight="bold" aria-hidden="true" />{' '}{t('1 cada')}{' '}{cooldownLabel(i.cooldown)}
                            </span>
                          )}
                        </td>
                        <td data-label={t('Ventas/día')} className="num">
                          {i.demand?.soldPerDay != null ? <strong>{num(i.demand.soldPerDay)}</strong> : <NoSales why={i.noSales} />}
                        </td>
                        <td data-label={t('Ganancia')} className="num">
                          <Delta v={i.profitUnit} />
                          {i.sellSupply && <div className="small"><SupplyText s={i.sellSupply} /></div>}
                        </td>
                        <td data-label={t('¿Conviene?')}>
                          <VerdictBadge v={i.verdict} />
                          {i.verdict !== 'si' && i.reasons?.[0] && <div className="small muted">{i.reasons[0]}</div>}
                          {i.freshness?.stale && <span className="badge b-warn">{t('Desactualizado')}</span>}
                        </td>
                        <td className="cmp-toggle-cell">
                          <button type="button" className="cmp-toggle" aria-expanded={isOpen} onClick={toggle}>
                            <span>{isOpen ? t('Cerrar') : t('Ver materiales y nivel')}</span>
                            <CaretDown size={14} weight="bold" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="cmp-detail">
                          <td colSpan={5}><RecipeQuick id={i.recipeId} /></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">{t('Ventas/día son de toda la región (TradeSkillMaster), no solo de tu reino. La ganancia es por unidad, ya restada la comisión. Precios de hace')}{' '}{items[0]?.sourceTime ? age(hoursSince(items[0].sourceTime)) : '—'}.</p>
        </>
      )}
      {data.data && total > 50 && (
        <nav className="pager" aria-label={t('Paginación')}>
          <button onClick={() => set('page', f.page - 1)} disabled={f.page <= 1}><CaretLeft size={16} aria-hidden="true" />{t('Anterior')}</button>
          <span className="small">{t('Página')}{' '}{f.page}{' '}{t('de')}{' '}{pages}</span>
          <button onClick={() => set('page', f.page + 1)} disabled={f.page >= pages}>{t('Siguiente')}<CaretRight size={16} aria-hidden="true" /></button>
        </nav>
      )}
    </div>
  );
}
