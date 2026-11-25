import React, { useMemo, useState } from 'react';
import { api, useApp, useAsync, Money, Delta, Loading, ErrorBox, Empty, PageHead, StatusBadge } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';
import { ItemLabel } from '../icons.js';
import { SupplyText } from '../PriceHistory.js';
import { BeerBottle, Info, Fire } from '@phosphor-icons/react';
import { t, locale } from '../i18n.js';
import { VERDICT, VerdictBadge, NoSales, type Verdict } from '../verdict.js';

type Kind = 'todas' | 'pociones' | 'elixires' | 'frascos';

const KINDS: Array<[Kind, string]> = [['todas', 'Todas'], ['pociones', 'Pociones'], ['elixires', 'Elíxires'], ['frascos', 'Frascos']];
const KIND_ONE: Record<string, string> = { pociones: 'Poción', elixires: 'Elíxir', frascos: 'Frasco' };

const pct = (r: number | null | undefined) => (r === null || r === undefined ? '—' : `${Math.round(r * 100)} %`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString(locale(), { maximumFractionDigits: 1 }));

export function PotionsPage() {
  const { ctxQuery, profileId } = useApp();
  const [kind, setKind] = useState<Kind>('todas');
  const [verdict, setVerdict] = useState<Verdict | ''>('');
  const d = useAsync(() => api<any>(`/api/potions?${ctxQuery}&kind=${kind}${profileId ? `&profileId=${profileId}` : ''}`), [ctxQuery, profileId, kind]);
  const all: any[] = d.data?.items ?? [];
  const list = useMemo(() => (verdict ? all.filter((i) => i.verdict === verdict) : all), [all, verdict]);
  // Las más vendidas que además convienen: lo primero que quiere saber quien entra aquí.
  const bestSellers = useMemo(() => all.filter((i) => i.verdict === 'si' || i.verdict === 'poco').slice(0, 3), [all]);
  // Las que más oro dejan por unidad entre las que ganan algo y se venden al menos una al día.
  const mostProfit = useMemo(() => all
    .filter((i) => (i.verdict === 'si' || i.verdict === 'poco') && (i.demand?.soldPerDay ?? 0) >= 1 && i.profitUnit)
    .sort((a, b) => Number(b.profitUnit.n) / Number(b.profitUnit.d) - Number(a.profitUnit.n) / Number(a.profitUnit.d))
    .slice(0, 3), [all]);
  const top = all[0];

  return (
    <div>
      <PageHead title={t('Pociones')} icon={<BeerBottle size={26} aria-hidden="true" />}>
        {t('Las pociones, elíxires y frascos de Alquimia que más se venden en la región, y si con los precios de hoy aún sale a cuenta fabricarlos para venderlos.')}
      </PageHead>
      <MarketStatus compact />
      <div className="lv-tabs" role="tablist" aria-label={t('Tipo')}>
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setVerdict(''); }}>{t(label)}</button>
        ))}
      </div>
      {d.loading && !d.data ? <Loading rows={8} /> : d.error ? <ErrorBox error={d.error} /> : !all.length ? (
        <Empty icon={BeerBottle}>{t('No hay recetas de este tipo en el catálogo.')}</Empty>
      ) : (
        <>
          <section className="card" aria-label={t('En resumen')}>
            <h2 className="icon-inline" style={{ marginTop: 0 }}><Fire size={20} aria-hidden="true" />{t('En resumen')}</h2>
            <ul className="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
              {top && (
                <li>
                  {t('La más vendida es')}{' '}<a href={`#/receta/${top.recipeId}`}><strong>{top.name}</strong></a>{' '}
                  ({t('{n} al día', { n: num(top.demand?.soldPerDay) })}): <VerdictBadge v={top.verdict} />
                </li>
              )}
              <li>
                {t('De {total}, conviene fabricar para vender {si} y ganan poco {poco}; {no} pierden oro con los precios de hoy.', {
                  total: all.length, si: d.data.counts.si, poco: d.data.counts.poco, no: d.data.counts.no,
                })}
              </li>
              {bestSellers.length > 0 && (
                <li>
                  {t('Las más vendidas que dejan oro:')}{' '}
                  {bestSellers.map((i, n) => (
                    <React.Fragment key={i.recipeId}>{n > 0 && ', '}<a href={`#/receta/${i.recipeId}`}>{i.name}</a> (<Money v={i.profitUnit} />)</React.Fragment>
                  ))}
                </li>
              )}
              {mostProfit.length > 0 && (
                <li>
                  {t('Las que más oro dejan por unidad (y se venden al menos 1 al día):')}{' '}
                  {mostProfit.map((i, n) => (
                    <React.Fragment key={i.recipeId}>{n > 0 && ', '}<a href={`#/receta/${i.recipeId}`}>{i.name}</a> (<Money v={i.profitUnit} />, {t('{n} al día', { n: num(i.demand?.soldPerDay) })})</React.Fragment>
                  ))}
                </li>
              )}
            </ul>
          </section>
          <div className="kpis status-filter" role="group" aria-label={t('Filtrar por veredicto')}>
            {VERDICT.filter(([k]) => (d.data.counts[k] ?? 0) > 0 || verdict === k).map(([k, label, help, I, tone]) => (
              <button type="button" key={k} className={`kpi${verdict === k ? ' on' : ''}`} aria-pressed={verdict === k} title={t(help)} onClick={() => setVerdict(verdict === k ? '' : k)}>
                <span className={`kpi-icon ${tone}`} aria-hidden="true"><I size={20} weight="bold" /></span>
                <span><span className="kpi-value">{(d.data.counts[k] ?? 0).toLocaleString(locale())}</span><span className="kpi-label">{t(label)}</span></span>
              </button>
            ))}
          </div>
          {!list.length ? <Empty icon={BeerBottle}>{t('Ninguna receta cumple los filtros.')}</Empty> : (
            <div className="table-wrap">
              <table className="responsive">
                <caption className="sr-only">{t('Pociones ordenadas por ventas al día en la región')}</caption>
                <thead>
                  <tr>
                    <th className="num">#</th><th>{t('Receta')}</th>
                    <th className="num" title={t('Unidades vendidas al día en toda la región (TradeSkillMaster)')}>{t('Ventas/día')}</th>
                    <th className="num" title={t('De cada 100 que se publican, cuántas llegan a venderse')}>{t('Se compra')}</th>
                    <th className="num">{t('Costo')}</th><th className="num">{t('Se vende por')}</th><th className="num">{t('Ganancia')}</th>
                    <th>{t('¿Conviene?')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.recipeId}>
                      <td data-label="#" className="num muted">{all.indexOf(i) + 1}</td>
                      <td data-label={t('Receta')} className="cell-main">
                        <ItemLabel id={i.output?.itemId} quality={i.output?.quality} href={`#/receta/${i.recipeId}`} name={i.name}
                          sub={<>{t(KIND_ONE[i.kind] ?? '')}{i.unitsPerRun > 1 ? ` · ${t('{n} por fabricación', { n: i.unitsPerRun })}` : ''}{i.character === 'conoce' ? t(' · la conoces') : ''}</>} />
                      </td>
                      <td data-label={t('Ventas/día')} className="num">{i.demand?.soldPerDay != null ? <strong>{num(i.demand.soldPerDay)}</strong> : <NoSales why={i.noSales} />}</td>
                      <td data-label={t('Se compra')} className="num">{pct(i.demand?.saleRate)}</td>
                      <td data-label={t('Costo')} className="num"><Money v={i.costUnit} /></td>
                      <td data-label={t('Se vende por')} className="num"><Money v={i.sellPrice} />{i.sellSupply && <div className="small"><SupplyText s={i.sellSupply} /></div>}</td>
                      <td data-label={t('Ganancia')} className="num"><Delta v={i.profitUnit} /></td>
                      <td data-label={t('¿Conviene?')}>
                        <VerdictBadge v={i.verdict} />
                        {i.verdict !== 'si' && i.verdict !== 'no' && <div style={{ marginTop: 4 }}><StatusBadge s={i.status} /></div>}
                        {i.verdict !== 'si' && i.reasons?.[0] && <div className="small muted">{i.reasons[0]}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted icon-inline" style={{ alignItems: 'flex-start', marginTop: 12 }}>
            <Info size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
            <span>{t('Ventas/día y «Se compra» son de toda la región (TradeSkillMaster), no solo de tu reino. Costo, precio y ganancia son por unidad con los precios de la casa de subastas elegida, ya restada la comisión. Son estimaciones: los precios cambian.')}</span>
          </p>
        </>
      )}
    </div>
  );
}
