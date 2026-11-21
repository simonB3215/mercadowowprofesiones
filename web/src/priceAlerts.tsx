/**
 * Avisos de precio de objetos y materiales: «avísame si la arcanita baja de 40 o» o «si el aceite de piedra sube de 1 o».
 * Generaliza las alertas de las favoritas (que son por ganancia de una receta) a cualquier objeto, con el precio de compra
 * de la casa elegida. Se guardan en este navegador y se comprueban al abrir la web y cada vez que llegan precios nuevos.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, Money, Q, toQ } from './lib.js';
import { ItemLabel } from './icons.js';
import { ItemPicker } from './ItemPicker.js';
import { BellRinging, Bell, Trash, Plus } from '@phosphor-icons/react';
import { t } from './i18n.js';

export interface PriceAlert { itemId: number; name: string; when: 'baja' | 'sube'; gold: string }

const KEY = 'mw-avisos-precio';
const EVENT = 'price-alerts-changed';
const MAX = 100;
export const validGold = (v: string) => /^\d{1,7}(\.\d{1,4})?$/.test(v.trim().replace(',', '.'));

function read(): PriceAlert[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((a) => Number.isInteger(a?.itemId) && (a.when === 'baja' || a.when === 'sube') && typeof a.gold === 'string') : [];
  } catch { return []; }
}
function write(list: PriceAlert[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENT));
}

/** ¿Salta el aviso con este precio (cobre)? Sin precio, nunca. Pura para poder probarla. */
export function alertHit(a: PriceAlert, price: Q | null): boolean {
  if (!price || !validGold(a.gold)) return false;
  const t = Q.parse(a.gold.trim().replace(',', '.')).mul(Q.of(10000));
  return a.when === 'baja' ? price.cmp(t) <= 0 : price.cmp(t) >= 0;
}

export function usePriceAlerts() {
  const [list, setList] = useState<PriceAlert[]>(read);
  useEffect(() => {
    const on = () => setList(read());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  const add = (a: PriceAlert) => { const l = read().filter((x) => !(x.itemId === a.itemId && x.when === a.when)); if (l.length >= MAX) return false; write([...l, a]); return true; };
  const update = (i: number, a: Partial<PriceAlert>) => { const l = read(); if (l[i]) { l[i] = { ...l[i], ...a }; write(l); } };
  const remove = (i: number) => { const l = read(); l.splice(i, 1); write(l); };
  return { list, add, update, remove };
}

/** Precios actuales de los objetos con aviso, recargados cuando llegan precios nuevos. */
function useAlertPrices(list: PriceAlert[]) {
  const { ctxQuery } = useApp();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('market-updated', on);
    return () => window.removeEventListener('market-updated', on);
  }, []);
  const ids = [...new Set(list.map((a) => a.itemId))].sort((a, b) => a - b).join(',');
  const d = useAsync(() => (ids ? api<any>(`/api/prices?${ctxQuery}&ids=${ids}`) : Promise.resolve(null)), [ctxQuery, ids, tick]);
  const prices = useMemo(() => new Map<number, any>((d.data?.items ?? []).map((i: any) => [i.itemId, i])), [d.data]);
  return { prices, loading: d.loading };
}

/** Botón «Avisarme del precio» en la página de un objeto: añade un aviso con el precio actual como punto de partida. */
export function PriceAlertButton({ itemId, name, price }: { itemId: number; name: string; price?: Q | null }) {
  const { list, add } = usePriceAlerts();
  const has = list.some((a) => a.itemId === itemId);
  const start = price ? price.div(10000).toDecimal(2) : '';
  return has
    ? <a className="small icon-inline" href="#/materiales"><BellRinging size={16} weight="fill" aria-hidden="true" />{t('Tienes un aviso de precio (verlo)')}</a>
    : <button type="button" onClick={() => { if (!add({ itemId, name, when: 'baja', gold: start })) alert(t('Como mucho {n} avisos.', { n: MAX })); }}><Bell size={16} aria-hidden="true" />{t('Avisarme del precio')}</button>;
}

/** Avisos que saltan ahora (para el inicio). No muestra nada si no hay ninguno. */
export function PriceAlertHits() {
  const { list } = usePriceAlerts();
  const { prices } = useAlertPrices(list);
  const hits = list.filter((a) => alertHit(a, toQ(prices.get(a.itemId)?.price)));
  if (!hits.length) return null;
  return (
    <section className="card fav-panel fav-hit" aria-live="polite">
      <h2 className="icon-inline fav-h"><BellRinging size={18} weight="fill" aria-hidden="true" />{hits.length === 1 ? t('1 aviso de precio') : t('{n} avisos de precio', { n: hits.length })}</h2>
      <ul className="fav-hits">
        {hits.map((a) => (
          <li key={`${a.itemId}-${a.when}`}><a href={`#/materiales/${a.itemId}`}>{prices.get(a.itemId)?.name ?? a.name}</a>{t(': está a')}{' '}<Money v={prices.get(a.itemId)?.price} /> ({a.when === 'baja' ? t('bajó de') : t('subió de')} {a.gold} o)</li>
        ))}
      </ul>
      <a className="small" href="#/materiales">{t('Ver tus avisos')}</a>
    </section>
  );
}

/** Lista completa de avisos: añadir con el buscador, cambiar el umbral y borrar. */
export function PriceAlertsPanel() {
  const { list, add, update, remove } = usePriceAlerts();
  const { prices, loading } = useAlertPrices(list);
  const [pick, setPick] = useState<{ id: number; name: string } | null>(null);
  const [when, setWhen] = useState<'baja' | 'sube'>('baja');
  const [gold, setGold] = useState('');
  const hits = list.filter((a) => alertHit(a, toQ(prices.get(a.itemId)?.price))).length;
  const ok = pick && validGold(gold);
  return (
    <details className="card fav-panel" open={hits > 0 || undefined}>
      <summary className="icon-inline fav-h">
        <Bell size={18} aria-hidden="true" />{t('Avisos de precio (')}{list.length})
        {hits > 0 && <span className="badge b-ok fav-badge"><BellRinging size={12} weight="fill" aria-hidden="true" />{hits}{' '}{t('activo')}{hits > 1 ? 's' : ''}</span>}
      </summary>
      <p className="small muted">{t('Te avisa cuando el precio de compra de un objeto en tu casa de subastas baja o sube del importe que elijas. Se comprueba al abrir la web y con cada actualización de precios. Se guardan solo en este navegador.')}</p>
      <form className="row pa-add" onSubmit={(e) => { e.preventDefault(); if (!ok) return; if (add({ itemId: pick!.id, name: pick!.name, when, gold: gold.trim().replace(',', '.') })) setGold(''); else alert(t('Como mucho {n} avisos.', { n: MAX })); }}>
        <ItemPicker label={t('Objeto')} value={pick} onPick={setPick} />
        <label className="field">{t('Avisar si')}<select value={when} onChange={(e) => setWhen(e.target.value as 'baja' | 'sube')}>
            <option value="baja">{t('baja de')}</option>
            <option value="sube">{t('sube de')}</option>
          </select>
        </label>
        <label className="field">{t('Oro')}<input type="text" inputMode="decimal" value={gold} onChange={(e) => setGold(e.target.value)} placeholder={t('p. ej. 40')} aria-invalid={gold !== '' && !validGold(gold)} />
        </label>
        <button type="submit" disabled={!ok}><Plus size={16} aria-hidden="true" />{t('Añadir aviso')}</button>
      </form>
      {list.length > 0 && (
        <div className="table-wrap">
          <table className="fav-table">
            <thead><tr><th>{t('Objeto')}</th><th className="num">{t('Precio ahora')}</th><th>{t('Avisar si')}</th><th>{t('Oro')}</th><th><span className="sr-only">{t('Quitar')}</span></th></tr></thead>
            <tbody>
              {list.map((a, i) => {
                const p = prices.get(a.itemId);
                const hit = alertHit(a, toQ(p?.price));
                return (
                  <tr key={`${a.itemId}-${a.when}`} className={hit ? 'fav-row-hit' : ''}>
                    <td><ItemLabel id={a.itemId} quality={p?.quality} px={22} href={`#/materiales/${a.itemId}`} name={p?.name ?? a.name} /></td>
                    <td className="num">{p ? <Money v={p.price} /> : loading ? '…' : '—'}</td>
                    <td>
                      <select value={a.when} onChange={(e) => update(i, { when: e.target.value as 'baja' | 'sube' })} aria-label={t('Cuándo avisar de {x}', { x: a.name })}>
                        <option value="baja">{t('baja de')}</option>
                        <option value="sube">{t('sube de')}</option>
                      </select>
                    </td>
                    <td>
                      <span className="fav-threshold">
                        {hit ? <BellRinging size={16} weight="fill" className="fav-bell on" aria-label={t('Aviso activo')} /> : <Bell size={16} className="fav-bell" aria-hidden="true" />}
                        <input type="text" inputMode="decimal" defaultValue={a.gold} aria-invalid={!validGold(a.gold)} aria-label={t('Oro para el aviso de {x}', { x: a.name })}
                          onBlur={(e) => update(i, { gold: e.target.value.trim().replace(',', '.') })} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                      </span>
                      {!validGold(a.gold) && <div className="small lv-error">{t('Oro con hasta 4 decimales')}</div>}
                    </td>
                    <td><button type="button" className="link danger" onClick={() => remove(i)} aria-label={t('Quitar el aviso de {x}', { x: a.name })}><Trash size={14} aria-hidden="true" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
