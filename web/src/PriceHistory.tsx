import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, useApp, useAsync, Q, formatMoney, CoinText } from './lib.js';
import { ChartLine, TrendUp, TrendDown, MinusCircle } from '@phosphor-icons/react';

interface Day { day: string; marketValue: string | null; minBuyout: string | null; quantity: number | null; samples: number }

const money = (v: string | null) => (v === null ? '—' : formatMoney(Q.of(BigInt(v))));
const gold = (v: string | null) => (v === null ? null : Number(BigInt(v)) / 10000);
const DAY_MS = 86400000;
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Unidades en venta y publicaciones de la foto actual (solo casas cargadas desde Blizzard). */
export function SupplyText({ s }: { s: { quantity: number | null; auctions: number | null } | null | undefined }) {
  if (!s || (s.quantity === null && s.auctions === null)) return null;
  const q = s.quantity !== null ? `${s.quantity.toLocaleString('es-ES')} en venta` : null;
  const a = s.auctions !== null ? `${s.auctions.toLocaleString('es-ES')} ${s.auctions === 1 ? 'publicación' : 'publicaciones'}` : null;
  return <span className={s.auctions === 1 ? 'supply supply-thin' : 'supply'} title="Oferta en la casa de subastas en la última carga">{[q, a].filter(Boolean).join(' · ')}</span>;
}

/**
 * Historial diario propio del valor de mercado en la casa elegida. Una sola serie (sin leyenda: el título la nombra),
 * línea de 2 px, rejilla discreta, cruz y ficha al pasar el ratón o con las flechas del teclado, y la tabla equivalente.
 */
export function PriceHistory({ itemId, title = 'Historial de precio' }: { itemId: number; title?: string }) {
  const { ctxQuery, ctx } = useApp();
  const [days, setDays] = useState(30);
  const h = useAsync(() => api<{ history: Day[] }>(`/api/items/${itemId}/history?${ctxQuery}&days=${days}`), [itemId, ctxQuery, days]);
  const rows = h.data?.history ?? [];
  const pts = rows.filter((r) => r.marketValue !== null);

  return (
    <section className="card ph" aria-labelledby={`ph-${itemId}`}>
      <div className="ph-head">
        <h2 id={`ph-${itemId}`} className="icon-inline"><ChartLine size={18} aria-hidden="true" />{title}</h2>
        <div className="ph-range" role="group" aria-label="Periodo">
          {[7, 14, 30, 60].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d} días</button>
          ))}
        </div>
      </div>
      {!ctx.realm ? <p className="muted small">Elige una casa de subastas arriba para ver su historial.</p>
        : h.loading && !h.data ? <p className="muted small">Cargando historial…</p>
        : h.error ? <p className="muted small">No se pudo cargar el historial: {h.error}</p>
        : pts.length < 2 ? (
          <p className="muted small">
            {pts.length === 0 ? 'Aún no hay historial de este objeto en esta casa.' : `Solo hay un día con datos (${fmtDay(pts[0].day)}: ${money(pts[0].marketValue)}).`}
            {' '}Se guarda una muestra cada vez que se cargan los precios; con dos días o más se dibuja la evolución.
          </p>
        ) : <Chart rows={pts} />}
    </section>
  );
}

function Chart({ rows }: { rows: Day[] }) {
  const uid = useId();
  const [sel, setSel] = useState<number | null>(null);
  // El dibujo usa el ancho real del contenedor (1 unidad = 1 px): el texto del eje no se encoge en el móvil.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 170 : 210, L = 56, R = 12, T = 12, B = 26;
  const geo = useMemo(() => {
    const t0 = Date.parse(rows[0].day), t1 = Date.parse(rows[rows.length - 1].day);
    const vals = rows.map((r) => gold(r.marketValue)!);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { lo = lo * 0.9; hi = hi * 1.1 || 1; }
    const pad = (hi - lo) * 0.12;
    lo = Math.max(0, lo - pad); hi += pad;
    const x = (d: string) => L + ((Date.parse(d) - t0) / Math.max(DAY_MS, t1 - t0)) * (W - L - R);
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
    const path = rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.day).toFixed(1)},${y(gold(r.marketValue)!).toFixed(1)}`).join(' ');
    return { x, y, ticks, path };
  }, [rows, W, H]);

  const first = gold(rows[0].marketValue)!, last = gold(rows[rows.length - 1].marketValue)!;
  const change = first > 0 ? ((last - first) / first) * 100 : null;
  const vals = rows.map((r) => BigInt(r.marketValue!));
  const minV = vals.reduce((a, b) => (b < a ? b : a)), maxV = vals.reduce((a, b) => (b > a ? b : a));
  const cur = sel !== null ? rows[sel] : null;
  const TrendI = change === null || Math.abs(change) < 0.5 ? MinusCircle : change > 0 ? TrendUp : TrendDown;
  // Etiqueta del eje en la moneda mayor que tenga sentido (o, p o c), con un decimal si hace falta para distinguir marcas.
  const gTick = (v: number) => {
    const c = v * 10000;
    const [n, u] = c >= 10000 ? [c / 10000, 'o'] : c >= 100 ? [c / 100, 'p'] : [c, 'c'];
    return `${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '').replace('.', ',')} ${u}`;
  };

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    rows.forEach((d, i) => { if (Math.abs(geo.x(d.day) - px) < Math.abs(geo.x(rows[best].day) - px)) best = i; });
    setSel(best);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setSel((s) => Math.min(rows.length - 1, Math.max(0, (s ?? rows.length - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') setSel(null);
  };

  return (
    <>
      <dl className="ph-stats">
        <div><dt>Último día</dt><dd><CoinText text={money(rows[rows.length - 1].marketValue)} /></dd></div>
        <div><dt>Cambio en el periodo</dt><dd className={`delta ${change === null || Math.abs(change) < 0.5 ? 'zero' : change > 0 ? 'pos' : 'neg'}`}>
          <TrendI size={14} weight="bold" aria-hidden="true" />{change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1).replace('.', ',')} %`}</dd></div>
        <div><dt>Mínimo · máximo</dt><dd><CoinText text={formatMoney(Q.of(minV))} /> · <CoinText text={formatMoney(Q.of(maxV))} /></dd></div>
      </dl>
      <div className="ph-plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0} aria-describedby={`${uid}-hint`}
          aria-label={`Valor de mercado diario: ${rows.length} días, de ${money(rows[0].marketValue)} a ${money(rows[rows.length - 1].marketValue)}`}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)} onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setSel(null); }} onKeyDown={onKey} onBlur={() => setSel(null)}>
          {geo.ticks.map((t, i) => (
            <g key={i}>
              <line className="ph-grid" x1={L} x2={W - R} y1={geo.y(t)} y2={geo.y(t)} />
              <text className="ph-axis" x={L - 8} y={geo.y(t) + 4} textAnchor="end">{gTick(t)}</text>
            </g>
          ))}
          <text className="ph-axis" x={L} y={H - 6}>{fmtDay(rows[0].day)}</text>
          <text className="ph-axis" x={W - R} y={H - 6} textAnchor="end">{fmtDay(rows[rows.length - 1].day)}</text>
          <path className="ph-line" d={geo.path} />
          <circle className="ph-dot" cx={geo.x(rows[rows.length - 1].day)} cy={geo.y(last)} r={4} />
          {cur && (
            <g>
              <line className="ph-cross" x1={geo.x(cur.day)} x2={geo.x(cur.day)} y1={T} y2={H - B} />
              <circle className="ph-dot ph-dot-sel" cx={geo.x(cur.day)} cy={geo.y(gold(cur.marketValue)!)} r={5} />
            </g>
          )}
        </svg>
        {cur && (
          <div className="ph-tip" role="status" style={{ left: `${Math.min(82, Math.max(18, (geo.x(cur.day) / W) * 100))}%` }}>
            <strong>{fmtDay(cur.day)}</strong>
            <span>Valor de mercado: <CoinText text={money(cur.marketValue)} /></span>
            <span>Más barato del día: <CoinText text={money(cur.minBuyout)} /></span>
            {cur.quantity !== null && <span>{cur.quantity.toLocaleString('es-ES')} en venta (media)</span>}
            <span className="muted">{cur.samples} {cur.samples === 1 ? 'muestra' : 'muestras'}</span>
          </div>
        )}
      </div>
      <p id={`${uid}-hint`} className="small muted">Media diaria del valor de mercado de esta casa. Pasa el ratón o usa las flechas ← → sobre el gráfico.</p>
      <details className="ph-table">
        <summary>Ver como tabla</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Día</th><th className="num">Valor de mercado</th><th className="num">Más barato</th><th className="num">En venta</th></tr></thead>
            <tbody>{[...rows].reverse().map((r) => (
              <tr key={r.day}><td>{fmtDay(r.day)}</td><td className="num"><CoinText text={money(r.marketValue)} /></td><td className="num"><CoinText text={money(r.minBuyout)} /></td><td className="num">{r.quantity?.toLocaleString('es-ES') ?? '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}
