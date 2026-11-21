/**
 * Recetas favoritas y alertas por umbral de ganancia. Se guardan en este navegador (no hay cuentas de usuario para el
 * comparador): una alerta salta cuando, con los precios actuales, la ganancia por unidad llega al umbral que elijas.
 * Se comprueba al abrir la web y cada vez que llegan precios nuevos con la página abierta.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, Money, PctShort, Delta, Q, toQ, StatusBadge } from './lib.js';
import { ItemLabel } from './icons.js';
import { Star, BellRinging, Bell, Trash } from '@phosphor-icons/react';
import { t } from './i18n.js';

export interface Favorite { name: string; /** Ganancia mínima por unidad en oro; vacío = sin alerta. */ threshold: string }
type Favs = Record<string, Favorite>;

const KEY = 'favRecipes';
const EVENT = 'favorites-changed';
const MAX = 200;
const validGold = (v: string) => /^-?\d{1,7}(\.\d{1,4})?$/.test(v.trim());

function read(): Favs {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function write(f: Favs) {
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Favoritas compartidas entre componentes y pestañas. */
export function useFavorites() {
  const [favs, setFavs] = useState<Favs>(read);
  useEffect(() => {
    const on = () => setFavs(read());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  const toggle = (id: number, name: string) => {
    const f = read();
    if (f[id]) delete f[id];
    else { if (Object.keys(f).length >= MAX) return false; f[id] = { name, threshold: '' }; }
    write(f); return true;
  };
  const setThreshold = (id: number, threshold: string) => { const f = read(); if (f[id]) { f[id] = { ...f[id], threshold }; write(f); } };
  const remove = (id: number) => { const f = read(); delete f[id]; write(f); };
  return { favs, ids: Object.keys(favs).map(Number), toggle, setThreshold, remove };
}

/** Estrella para marcar o quitar una receta de favoritas. */
export function FavButton({ id, name, withLabel = false }: { id: number; name: string; withLabel?: boolean }) {
  const { favs, toggle } = useFavorites();
  const on = Boolean(favs[id]);
  const label = on ? `Quitar ${name} de favoritas` : t('Añadir {x} a favoritas', { x: name });
  return (
    <button type="button" className={`fav-btn${on ? ' on' : ''}${withLabel ? ' with-label' : ''}`} aria-pressed={on} aria-label={withLabel ? undefined : label} title={label}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!toggle(id, name)) alert(t('Como mucho {n} favoritas.', { n: MAX })); }}>
      <Star size={withLabel ? 18 : 16} weight={on ? 'fill' : 'regular'} aria-hidden="true" />
      {withLabel && (on ? t('En favoritas') : t('Añadir a favoritas'))}
    </button>
  );
}

const umbral = (t: string) => (t.trim() && validGold(t) ? Q.parse(t.trim()).mul(Q.of(10000)) : null);

/** Favoritas con sus cifras actuales y su umbral de alerta. `compact` muestra solo las alertas activas (inicio). */
export function FavoriteAlerts({ compact = false }: { compact?: boolean }) {
  const { ctxQuery } = useApp();
  const { favs, ids, setThreshold, remove } = useFavorites();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('market-updated', on);
    return () => window.removeEventListener('market-updated', on);
  }, []);
  const idsKey = [...ids].sort((a, b) => a - b).join(',');
  const data = useAsync(
    () => (idsKey ? api(`/api/opportunities?${ctxQuery}&ids=${idsKey}&pageSize=200`) : Promise.resolve(null)),
    [ctxQuery, idsKey, tick],
  );
  const items: any[] = data.data?.items ?? [];
  const hits = useMemo(() => items.filter((i) => {
    const t = umbral(favs[i.recipeId]?.threshold ?? '');
    const p = toQ(i.profitUnit);
    return t && p && !i.sellCheck && p.cmp(t) >= 0;
  }), [items, favs]);

  if (!ids.length) {
    return compact ? null : (
      <section className="card fav-panel">
        <h2 className="icon-inline fav-h"><Star size={18} aria-hidden="true" />{t('Favoritas y alertas')}</h2>
        <p className="small muted">{t('Marca recetas con la estrella')}{' '}<Star size={14} aria-hidden="true" />{' '}{t('para seguirlas aquí y recibir una alerta cuando su ganancia llegue al umbral que elijas.')}</p>
      </section>
    );
  }
  if (compact) {
    if (!hits.length) return null;
    return (
      <section className="card fav-panel fav-hit" aria-live="polite">
        <h2 className="icon-inline fav-h"><BellRinging size={18} weight="fill" aria-hidden="true" />{hits.length === 1 ? t('1 favorita llega a tu umbral') : t('{n} favoritas llegan a tu umbral', { n: hits.length })}</h2>
        <ul className="fav-hits">
          {hits.map((i) => (
            <li key={i.recipeId}><a href={`#/receta/${i.recipeId}`}>{i.name}</a>{t(': gana')}{' '}<Money v={i.profitUnit} />{' '}{t('por unidad (umbral')}{' '}{favs[i.recipeId].threshold} o)</li>
          ))}
        </ul>
        <a className="small" href="#/?onlyFav=1">{t('Ver tus favoritas en el comparador')}</a>
      </section>
    );
  }
  return (
    <details className="card fav-panel" open={hits.length > 0 || undefined}>
      <summary className="icon-inline fav-h">
        <Star size={18} weight="fill" aria-hidden="true" />{t('Favoritas (')}{ids.length})
        {hits.length > 0 && <span className="badge b-ok fav-badge"><BellRinging size={12} weight="fill" aria-hidden="true" />{hits.length}{' '}{t('alerta')}{hits.length > 1 ? 's' : ''}</span>}
      </summary>
      <p className="small muted">{t('Escribe la ganancia mínima por unidad (en oro) para recibir una alerta. Se comprueba al abrir la web y con cada actualización de precios. Las favoritas se guardan solo en este navegador. Un precio atípico no dispara alertas.')}</p>
      {data.loading && !data.data && <p className="small muted">{t('Cargando…')}</p>}
      <div className="table-wrap">
        <table className="fav-table">
          <thead><tr><th>{t('Receta')}</th><th className="num">{t('Ganancia/unid.')}</th><th className="num">{t('Margen')}</th><th>{t('Estado')}</th><th>{t('Alerta desde (oro)')}</th><th><span className="sr-only">{t('Quitar')}</span></th></tr></thead>
          <tbody>
            {ids.map((id) => {
              const i = items.find((x) => x.recipeId === id);
              const f = favs[id];
              const hit = hits.includes(i);
              const bad = f.threshold.trim() !== '' && !validGold(f.threshold);
              return (
                <tr key={id} className={hit ? 'fav-row-hit' : ''}>
                  <td>{i ? <ItemLabel id={i.output?.itemId} quality={i.output?.quality} px={22} href={`#/receta/${id}`} name={i.name} /> : <a href={`#/receta/${id}`}>{f.name}</a>}</td>
                  <td className="num">{i ? <Delta v={i.profitUnit} /> : '—'}{i?.sellCheck && <div><span className="badge b-warn">{t('Precio atípico')}</span></div>}</td>
                  <td className="num">{i?.marginPct ? <PctShort v={i.marginPct} /> : '—'}</td>
                  <td>{i ? <StatusBadge s={i.status} /> : <span className="small muted">{t('sin datos')}</span>}</td>
                  <td>
                    <span className="fav-threshold">
                      {hit ? <BellRinging size={16} weight="fill" className="fav-bell on" aria-label={t('Alerta activa')} /> : <Bell size={16} className="fav-bell" aria-hidden="true" />}
                      <input type="text" inputMode="decimal" placeholder={t('sin alerta')} defaultValue={f.threshold} aria-invalid={bad}
                        aria-label={t('Ganancia mínima por unidad en oro para {x}', { x: f.name })} onBlur={(e) => setThreshold(id, e.target.value.trim())}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    </span>
                    {bad && <div className="small lv-error">{t('Oro con hasta 4 decimales')}</div>}
                  </td>
                  <td><button type="button" className="link danger" onClick={() => remove(id)} aria-label={`Quitar ${f.name} de favoritas`}><Trash size={14} aria-hidden="true" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
