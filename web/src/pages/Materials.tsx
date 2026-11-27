import React, { useEffect, useState } from 'react';
import { api, useApp, useAsync, money, Loading, ErrorBox, StatusBadge, GoldInput, PageHead, toQ, formatMoney, Q, Money, priceSource } from '../lib.js';
import { ItemLabel, WowIcon } from '../icons.js';
import { PriceHistory, SupplyText } from '../PriceHistory.js';
import { PriceAlertButton, PriceAlertsPanel } from '../priceAlerts.js';
import { CraftingCard } from '../Crafting.js';
import { ArrowLeft, MagnifyingGlass, ArrowUp, ArrowDown, MinusCircle } from '@phosphor-icons/react';
import { t, locale } from '../i18n.js';
import { useListFilters } from '../ListFilters.js';

function GoldPerHour({ netPerUnit }: { netPerUnit: Q | null }) {
  const [units, setUnits] = useState('');
  const [minutes, setMinutes] = useState('');
  let result: string | null = null;
  try {
    if (netPerUnit && units && minutes) {
      const u = Q.parse(units);
      const m = Q.parse(minutes);
      if (m.sign() > 0 && u.sign() >= 0) result = formatMoney(netPerUnit.mul(u).div(m).mul(60));
    }
  } catch { result = null; }
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>{t('Oro por hora (con tus datos)')}</h2>
      <p className="small muted">{t('Solo se calcula con el tiempo y el rendimiento que indiques; no hay una fuente validada de tasas de recolección.')}</p>
      <div className="row">
        <GoldInput label={t('Unidades obtenidas')} value={units} onChange={setUnits} placeholder={t('p. ej. 120')} />
        <GoldInput label={t('Minutos empleados')} value={minutes} onChange={setMinutes} placeholder={t('p. ej. 30')} />
      </div>
      <p>{t('Resultado:')}{' '}<strong>{result ?? '—'}</strong>{' '}{t('/hora')}{' '}<span className="small muted">{t('(procedencia: entrada del usuario × valor neto de venta)')}</span></p>
    </section>
  );
}

function MaterialDetail({ itemId }: { itemId: number }) {
  const { ctxQuery } = useApp();
  const d = useAsync(() => api(`/api/materials/${itemId}?${ctxQuery}`), [itemId, ctxQuery]);
  if (d.loading) return <Loading rows={4} />;
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  const x = d.data;
  return (
    <>
      <p><a className="icon-inline" href="#/materiales"><ArrowLeft size={16} aria-hidden="true" />{t('Todos los materiales')}</a></p>
      <div className="card title-with-icon"><WowIcon id={itemId} px={56} /><div><h1 style={{ margin: 0 }}>{x.name ?? t('Objeto {id}', { id: itemId })}</h1><p className="small muted" style={{ margin: 0 }}>{t('¿Te conviene más venderlo tal cual o usarlo para fabricar algo?')}</p></div><div style={{ marginLeft: 'auto' }}><PriceAlertButton itemId={itemId} name={x.name ?? t('Objeto {id}', { id: itemId })} price={toQ(x.price.copper)} /></div></div>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t('Vender el material')}</h2>
        <dl className="kv">
          <dt>{t('Precio utilizado')}</dt><dd><Money v={x.price.copper} /> <span className="small muted">{priceSource(x.price.field, x.price.scope)}</span>{x.price.supply && <div className="small"><SupplyText s={x.price.supply} /></div>}</dd>
          <dt>{t('Cobras por unidad al venderlo')}</dt><dd><strong><Money v={x.sellNet} /></strong> <span className="small muted">{t('(menos la comisión del')}{' '}{Math.round(Number(x.commission) * 100)} %)</span></dd>
        </dl>
      </section>
      <CraftingCard itemId={itemId} />
      <PriceHistory itemId={itemId} />
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t('Usarlo para fabricar')}</h2>
        <p className="small muted">{t('Valor por unidad del material = (ingreso neto de la receta − costo del resto de materiales) / cantidad usada. Mismos supuestos de precio que la venta directa.')}</p>
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>{t('Receta')}</th><th>{t('Profesión')}</th><th className="num">{t('Cantidad')}</th><th className="num">{t('Valor por unidad del material')}</th><th>{t('Comparación')}</th><th>{t('Estado')}</th></tr></thead>
            <tbody>
              {x.alternatives.map((a: any) => {
                const v = toQ(a.valuePerUnit);
                const s = toQ(x.sellNet);
                return (
                  <tr key={a.recipeId}>
                    <td data-label={t('Receta')} className="cell-main"><a href={`#/receta/${a.recipeId}`}>{a.name}</a></td>
                    <td data-label={t('Profesión')}>{a.profession}</td>
                    <td data-label={t('Cantidad')} className="num">{a.quantity ?? '—'}</td>
                    <td data-label={t('Valor/unidad')} className="num">{formatMoney(v)}</td>
                    <td data-label={t('Comparación')}>{v && s ? (v.cmp(s) > 0
                      ? <span className="delta pos"><ArrowUp size={14} weight="bold" aria-hidden="true" />{t('Mejor que vender')}</span>
                      : <span className="delta neg"><ArrowDown size={14} weight="bold" aria-hidden="true" />{t('Peor que vender')}</span>)
                      : <span className="delta none"><MinusCircle size={14} aria-hidden="true" />{t('Sin datos comparables')}</span>}</td>
                    <td data-label={t('Estado')}><StatusBadge s={a.status} /></td>
                  </tr>
                );
              })}
              {!x.alternatives.length && <tr><td colSpan={6} className="empty">{t('Ninguna receta del catálogo usa este material.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <GoldPerHour netPerUnit={toQ(x.sellNet)} />
    </>
  );
}

const PAGE = 100;

export function Materials({ itemId }: { itemId: number | null }) {
  const { ctx } = useApp();
  const list = useAsync(() => api<any>(`/api/materials?version=${ctx.version}`), [ctx.version]);
  const all: any[] = list.data?.materials ?? [];
  const filters = useListFilters(all, {
    path: '/materiales',
    name: (m) => m.name, searchExtra: (m) => String(m.item_id),
    searchLabel: 'Buscar material', searchPlaceholder: 'Nombre del material',
    quality: (m) => m.quality,
    defaultSort: 'uses',
    sorts: [
      { key: 'uses', label: 'Recetas que lo usan', get: (m) => m.uses },
      { key: 'name', label: 'Nombre', get: (m) => m.name },
    ],
    checks: [
      { key: 'fabricable', label: 'Solo los que se pueden fabricar', test: (m) => Boolean(m.craftable) },
      { key: 'nofabricable', label: 'Solo los que no se fabrican (recolección, vendedor, botín)', test: (m) => !m.craftable },
    ],
  });
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [filters.list]);
  if (itemId) return <MaterialDetail itemId={itemId} />;
  const rows = filters.list;
  return (
    <div>
      <PageHead title={t('Materiales')}>{t('¿Tienes materiales (por ejemplo, de recolectar) y no sabes qué hacer con ellos? Pulsa uno para ver si conviene venderlo o usarlo en una receta.')}</PageHead>
      <PriceAlertsPanel />
      {filters.ui}
      {list.loading && !list.data ? <Loading rows={6} /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : (
        <>
          <p className="small muted" aria-live="polite">{t('{n} de {total} materiales', { n: rows.length.toLocaleString(locale()), total: all.length.toLocaleString(locale()) })}</p>
          <div className="table-wrap">
            <table className="responsive">
              <thead><tr><th>{t('Material')}</th><th className="num">{t('Recetas que lo usan')}</th></tr></thead>
              <tbody>
                {rows.slice(0, shown).map((m: any) => (
                  <tr key={m.item_id}><td data-label={t('Material')} className="cell-main"><ItemLabel id={m.item_id} quality={m.quality} href={`#/materiales/${m.item_id}`} name={m.name} sub={m.craftable ? t('Se puede fabricar') : undefined} /></td><td data-label={t('Recetas')} className="num">{m.uses}</td></tr>
                ))}
                {!rows.length && <tr><td colSpan={2} className="empty">{all.length ? t('Ningún material cumple los filtros.') : t('Sin materiales en el catálogo.')}</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length > shown && <p><button type="button" onClick={() => setShown(shown + PAGE)}>{t('Mostrar {n} más', { n: Math.min(PAGE, rows.length - shown) })}</button></p>}
        </>
      )}
    </div>
  );
}
