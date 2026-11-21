/**
 * «Qué hago hoy» (inicio): en una sola tarjeta, lo que ya está repartido por la web.
 * - Las 3 recetas con más ganancia por unidad que la web da como «Buena opción» en tu casa de subastas.
 * - La transmutación (y demás recetas con espera) que más oro da al día y si ya está disponible.
 * - Las favoritas cuya ganancia cambió desde la última vez (se compara con una foto guardada en este navegador
 *   que se renueva una vez al día, para que el cambio se vea durante el día).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, Money, Delta, toQ, Q } from './lib.js';
import { ItemLabel } from './icons.js';
import { useFavorites } from './favorites.js';
import { useDone, slotOf } from './pages/Transmutations.js';
import { cooldownLabel } from '../../src/engine/cooldown.js';
import { Sun, ChartBar, Flask, Star, ArrowRight, Timer, CheckCircle, TrendUp, TrendDown } from '@phosphor-icons/react';
import { t, locale } from './i18n.js';

const SNAP_KEY = 'mw-favoritas-foto';
const DAY = 20 * 3600_000;
type Snap = { at: number; ctx: string; profit: Record<string, string | null> };

function readSnap(): Snap | null {
  try { const v = JSON.parse(localStorage.getItem(SNAP_KEY) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
function writeSnap(s: Snap) { try { localStorage.setItem(SNAP_KEY, JSON.stringify(s)); } catch { /* sin almacenamiento */ } }

/** Cambios de ganancia por unidad frente a la foto anterior (como mucho 3, los mayores). Pura para poder probarla. */
export function favoriteChanges(items: any[], snap: Snap | null, ctx: string) {
  if (!snap || snap.ctx !== ctx) return [];
  const out: Array<{ item: any; before: any; after: any; diff: any }> = [];
  for (const i of items) {
    const raw = snap.profit[String(i.recipeId)];
    const before = raw ? toQ(JSON.parse(raw)) : null;
    const after = toQ(i.profitUnit);
    if (!before || !after || i.sellCheck) continue;
    const diff = after.sub(before);
    // Se ignoran los cambios de menos de 1 plata o del 5 %: son ruido del mercado.
    const big = diff.mul(diff.sign()).cmp(before.mul(before.sign()).mul(5).div(100)) >= 0 && diff.mul(diff.sign()).cmp(Q.of(100)) >= 0;
    if (big) out.push({ item: i, before, after, diff });
  }
  return out.sort((a, b) => b.diff.mul(b.diff.sign()).cmp(a.diff.mul(a.diff.sign()))).slice(0, 3);
}

export function Today() {
  const { ctxQuery, profileId } = useApp();
  const pq = profileId ? `&profileId=${profileId}` : '';
  const best = useAsync(() => api<any>(`/api/opportunities?${ctxQuery}${pq}&status=candidato&hideUnsellable=1&sort=profitUnit&pageSize=20`), [ctxQuery, profileId]);
  const tm = useAsync(() => api<any>(`/api/transmutations?${ctxQuery}${pq}`), [ctxQuery, profileId]);
  const { done } = useDone();
  const favs = useFavorites();
  const idsKey = [...favs.ids].sort((a, b) => a - b).join(',');
  const fav = useAsync(() => (idsKey ? api<any>(`/api/opportunities?${ctxQuery}&ids=${idsKey}&pageSize=200`) : Promise.resolve(null)), [ctxQuery, idsKey]);
  const [snap] = useState(readSnap);
  const now = Date.now();

  const changes = useMemo(() => favoriteChanges(fav.data?.items ?? [], snap, ctxQuery), [fav.data, snap, ctxQuery]);
  // Foto nueva una vez al día (o al cambiar de casa): así el cambio de hoy se sigue viendo hasta mañana.
  useEffect(() => {
    if (!fav.data?.items) return;
    if (snap && snap.ctx === ctxQuery && now - snap.at < DAY) return;
    writeSnap({ at: Date.now(), ctx: ctxQuery, profit: Object.fromEntries(fav.data.items.map((i: any) => [String(i.recipeId), i.profitUnit ? JSON.stringify(i.profitUnit) : null])) });
  }, [fav.data]);

  // Las que tienen espera ya salen en la columna de transmutación: aquí, las que se pueden repetir.
  const top: any[] = (best.data?.items ?? []).filter((i: any) => !(i.cooldown > 0)).slice(0, 3);
  const plan: any[] = tm.data?.plan ?? [];
  return (
    <section className="card today" aria-labelledby="today-title">
      <h2 id="today-title" className="icon-inline"><Sun size={22} aria-hidden="true" />{t('Qué hago hoy')}</h2>
      <div className="today-grid">
        <div className="today-col">
          <h3 className="icon-inline"><ChartBar size={18} aria-hidden="true" />{t('Las 3 que más dejan')}</h3>
          {best.loading && !best.data && <p className="small muted">{t('Calculando…')}</p>}
          {best.error && <p className="small lv-error">{t('No se pudo calcular.')}</p>}
          {best.data && !top.length && <p className="small muted">{t('Ahora mismo ninguna receta es «Buena opción» en tu casa.')}</p>}
          <ol className="today-list">
            {top.map((i) => (
              <li key={i.recipeId}>
                <ItemLabel id={i.output?.itemId} quality={i.output?.quality} px={24} href={`#/receta/${i.recipeId}`} name={i.name}
                  sub={<><Delta v={i.profitUnit} tag={false} />{' '}{t('por unidad')}{i.demand?.soldPerDay != null ? ` · ${t('{n} ventas/día', { n: Number(i.demand.soldPerDay).toLocaleString(locale(), { maximumFractionDigits: 1 }) })}` : ''}</>} />
              </li>
            ))}
          </ol>
          <a className="small icon-inline" href="#/?status=candidato">{t('Ver todas en el comparador')}<ArrowRight size={14} aria-hidden="true" /></a>
        </div>

        <div className="today-col">
          <h3 className="icon-inline"><Flask size={18} aria-hidden="true" />{t('Transmutación')}</h3>
          {tm.loading && !tm.data && <p className="small muted">{t('Calculando…')}</p>}
          {tm.data && !plan.length && <p className="small muted">{t('Ninguna receta con espera da oro hoy.')}</p>}
          <ul className="today-list">
            {plan.map((p) => {
              const d = done[slotOf(p)];
              const until = d ? d.at + d.cd * 1000 : 0;
              return (
                <li key={p.recipeId}>
                  <ItemLabel id={p.output?.itemId} quality={p.output?.quality} px={24} href="#/transmutaciones" name={p.name}
                    sub={<><Delta v={p.goldPerDay} tag={false} />{' '}{t('al día · 1 cada')}{' '}{cooldownLabel(p.cooldown)}</>} />
                  {until > now
                    ? <span className="small today-wait icon-inline"><Timer size={14} aria-hidden="true" />{t('Hasta el')}{' '}{new Date(until).toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    : <span className="small today-ok icon-inline"><CheckCircle size={14} aria-hidden="true" />{t('Disponible')}</span>}
                </li>
              );
            })}
          </ul>
          <a className="small icon-inline" href="#/transmutaciones">{t('Ir a Transmutaciones')}<ArrowRight size={14} aria-hidden="true" /></a>
        </div>

        <div className="today-col">
          <h3 className="icon-inline"><Star size={18} aria-hidden="true" />{t('Tus favoritas')}</h3>
          {!favs.ids.length && <p className="small muted">{t('Marca recetas con la estrella en el comparador y aquí verás si su ganancia cambia.')}</p>}
          {favs.ids.length > 0 && fav.data && !changes.length && (
            <p className="small muted">{snap && snap.ctx === ctxQuery ? t('Sin cambios importantes desde la última vez.') : t('Guardado su precio de hoy: mañana verás qué ha cambiado.')}</p>
          )}
          <ul className="today-list">
            {changes.map((c) => (
              <li key={c.item.recipeId}>
                <ItemLabel id={c.item.output?.itemId} quality={c.item.output?.quality} px={24} href={`#/receta/${c.item.recipeId}`} name={c.item.name}
                  sub={<span className="icon-inline">{c.diff.sign() > 0 ? <TrendUp size={14} className="gc-up" aria-hidden="true" /> : <TrendDown size={14} className="gc-down" aria-hidden="true" />}
                    <Money v={c.before.toJSON()} /> → <Money v={c.after.toJSON()} />{' '}{t('por unidad')}</span>} />
              </li>
            ))}
          </ul>
          {favs.ids.length > 0 && <a className="small icon-inline" href="#/?onlyFav=1">{t('Ver tus favoritas')}<ArrowRight size={14} aria-hidden="true" /></a>}
        </div>
      </div>
    </section>
  );
}
