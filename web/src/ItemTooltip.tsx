/**
 * Ventana con la descripción de un objeto al pasar el ratón por encima (como el tooltip del juego).
 * Una sola ventana para toda la web: los iconos y nombres de objeto la abren con `itemTipProps` (itemTip.ts).
 * Ratón: aparece al pasar por encima (con un pequeño retraso). Teclado: al enfocar el nombre. Toque: al tocar el icono.
 * La descripción se pide una vez por objeto y casa, y se guarda en memoria.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, useApp, Money } from './lib.js';
import { SupplyText } from './PriceHistory.js';
import { setItemTipListener, type TipAnchor as Anchor } from './itemTip.js';

const cache = new Map<string, Promise<any>>();
const tone: Record<string, string> = { green: 'it-green', gold: 'it-gold', muted: 'it-muted', red: 'it-red' };

/** Se monta una vez (en la aplicación). */
export function ItemTipHost() {
  const { ctxQuery } = useApp();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setItemTipListener(setAnchor);
    const close = () => setAnchor(null);
    // Al tocar fuera de la ventana (móvil), se cierra; el toque que la abre llega después (pointerup).
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    window.addEventListener('pointerdown', onDown);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    return () => {
      setItemTipListener(null);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
    };
  }, []);

  useEffect(() => {
    if (!anchor) return;
    let alive = true;
    setData(null); setError(false);
    const k = `${anchor.id}|${ctxQuery}`;
    if (!cache.has(k)) cache.set(k, api(`/api/items/${anchor.id}/tooltip?${ctxQuery}`).catch((e) => { cache.delete(k); throw e; }));
    cache.get(k)!.then((d) => alive && setData(d), () => alive && setError(true));
    return () => { alive = false; };
  }, [anchor?.id, anchor?.rect.top, anchor?.rect.left, ctxQuery]);

  // Junto al elemento: a la derecha si cabe, si no a la izquierda; sin salirse de la pantalla.
  useLayoutEffect(() => {
    if (!anchor || !box.current) return;
    const b = box.current.getBoundingClientRect();
    const r = anchor.rect;
    const m = 8;
    let left = r.right + m;
    let top = r.top;
    if (left + b.width > innerWidth - m) left = r.left - b.width - m;
    if (left < m) { // no cabe a ningún lado (móvil): debajo, ajustada al ancho
      left = Math.max(m, Math.min(innerWidth - b.width - m, r.left));
      top = r.bottom + m;
    }
    if (top + b.height > innerHeight - m) top = Math.max(m, innerHeight - b.height - m);
    setPos({ left, top });
  }, [anchor, data, error]);

  if (!anchor) return null;
  const q = data?.quality ? `q-${String(data.quality).toLowerCase()}` : '';
  return (
    <div ref={box} className="item-tip" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}>
      {error ? <p className="it-muted">No se pudo cargar la descripción.</p> : !data ? <p className="it-muted">Cargando…</p> : (
        <>
          <p className={`it-name ${q}`}>{data.name ?? `Objeto ${data.itemId}`}</p>
          {data.lines.map((l: any, i: number) => (
            <p key={i} className={`${tone[l.tone] ?? ''}${l.right ? ' it-row' : ''}`}><span>{l.text}</span>{l.right && <span>{l.right}</span>}</p>
          ))}
          {data.partial && <p className="it-muted">El catálogo no tiene más detalles de este objeto.</p>}
          {data.vendorSell && <p className="it-sell">Se vende al vendedor por <Money v={{ n: data.vendorSell, d: '1' }} /></p>}
          {data.market && (
            <p className="it-market">
              {data.market.price ? <>En tu casa de subastas: <Money v={data.market.price} /></> : 'Sin precio en tu casa de subastas'}
              {data.market.supply && <><br /><SupplyText s={data.market.supply} /></>}
            </p>
          )}
        </>
      )}
    </div>
  );
}
