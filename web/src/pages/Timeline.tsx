import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, useApp, useAsync, Q, toQ, formatMoney, Money, CoinText, Loading, ErrorBox, Empty, PageHead } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';
import { ItemLabel } from '../icons.js';
import { t, isEn, locale } from '../i18n.js';
import {
  ChartLineUp, ShoppingCart, Eye, HourglassMedium, TrendDown, MinusCircle, Info, ArrowLeft, MagnifyingGlass, LinkSimple, PencilSimple, Trash, Plus, type Icon,
} from '@phosphor-icons/react';

type Verdict = 'comprar' | 'vigilar' | 'esperar' | 'no_conviene' | 'sin_datos';
interface Reason { text: string; vars?: Record<string, string | number> }

/** Veredicto: etiqueta, explicación, icono y tono (icono + texto + color, nunca solo color). */
const TL_VERDICT: Array<[Verdict, string, string, Icon, string]> = [
  ['comprar', 'Comprar', 'Está barato, ya dejó de bajar, se vende en la región y tiene recorrido hasta su techo o hasta lo que valió en Anniversary.', ShoppingCart, 'ok'],
  ['vigilar', 'Vigilar', 'Tiene buena pinta pero le falta algo (más recorrido, más ventas o más estabilidad). Míralo cada pocos días.', Eye, 'warn'],
  ['esperar', 'Esperar (todavía cae)', 'El precio sigue bajando con fuerza: todavía no es el piso.', HourglassMedium, 'info'],
  ['no_conviene', 'No conviene', 'Con los datos de hoy no se espera que suba lo suficiente para guardarlo.', TrendDown, 'bad'],
  ['sin_datos', 'Sin datos', 'Menos de 7 días de historial o sin precio en esta casa de subastas.', MinusCircle, 'neutral'],
];
const V = Object.fromEntries(TL_VERDICT.map((v) => [v[0], v])) as Record<Verdict, (typeof TL_VERDICT)[number]>;
const BADGE: Record<string, string> = { ok: 'b-ok', warn: 'b-warn', info: 'b-info', bad: 'b-bad', neutral: 'b-neutral' };

export function TimelineVerdict({ v }: { v: Verdict }) {
  const [, label, help, I, tone] = V[v] ?? V.sin_datos;
  return <span className={`badge ${BADGE[tone]}`} title={t(help)}><I size={14} weight="bold" aria-hidden="true" />{t(label)}</span>;
}

/** Motivo del motor en el idioma elegido (los factores llegan con coma decimal). */
function reasonText(r: Reason) {
  const vars = r.vars && isEn() ? Object.fromEntries(Object.entries(r.vars).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/(\d),(\d)/g, '$1.$2') : v])) : r.vars;
  return t(r.text, vars);
}
const ReasonText = ({ r }: { r: Reason }) => <CoinText text={reasonText(r)} />;

const num = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? '—' : n.toLocaleString(locale(), { maximumFractionDigits: d }));
const pctSigned = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.round(Math.abs(x) * 100).toLocaleString(locale())} %`);
const pctAbs = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100).toLocaleString(locale())} %`);
const times = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `×${num(x)}`);
const copper = (v: string | null | undefined) => (v === null || v === undefined ? null : Q.of(BigInt(v)));
const moneyC = (v: string | null | undefined) => formatMoney(copper(v));
const gold = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(BigInt(v)) / 10000);
const qGold = (j: any) => { const q = toQ(j); return q ? q.toNumber() / 10000 : null; };

/** Ancho real del contenedor (1 unidad del SVG = 1 px): el texto del eje no se encoge en el móvil. */
function useWidth(min = 260, def = 640): [React.RefObject<HTMLDivElement>, number] {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(def);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [box, w];
}

/** Etiqueta del eje en la moneda mayor que tenga sentido (o, p o c; g, s, c en inglés). */
function gTick(g: number) {
  const c = g * 10000;
  const en = isEn();
  const [n, u] = c >= 10000 ? [c / 10000, en ? 'g' : 'o'] : c >= 100 ? [c / 100, en ? 's' : 'p'] : [c, 'c'];
  return `${(n >= 100 ? Math.round(n) : Number(n.toFixed(1))).toLocaleString(locale())} ${u}`;
}

export function TimelinePage({ itemId }: { itemId: number | null }) {
  return itemId ? <TimelineDetail itemId={itemId} /> : <TimelineList />;
}

function ForumNotice() {
  return (
    <div className="alert info" role="note">
      <Info size={18} aria-hidden="true" />
      <div><p>{t('Las referencias de Anniversary son citas de jugadores en los foros, no un registro completo de la casa de subastas: tómalas como orden de magnitud. Todo lo de esta página es una estimación, no una garantía de que el precio suba.')}</p></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra de fases: Anniversary y Forever por días desde el lanzamiento
// ---------------------------------------------------------------------------

const MAX_DAY = 180;
interface Phase { economy: string; phase: string; milestone: string; start: string; day: number | null; confirmed: boolean; note: string | null; source: string | null }

function PhaseBar({ phases, foreverDay }: { phases: Phase[]; foreverDay: number }) {
  const [box, W] = useWidth(300, 720);
  const L = W < 480 ? 92 : 120, R = 12, laneH = 30, T = 8, gap = 14, B = 24;
  const H = T + laneH * 2 + gap + B;
  const x = (d: number) => L + (Math.min(MAX_DAY, Math.max(0, d)) / MAX_DAY) * (W - L - R);
  const lanes: Array<[string, string]> = [['anniversary', t('Classic Anniversary')], ['forever', t('WoW Forever')]];
  const ticks = W < 480 ? [0, 60, 120, 180] : [0, 30, 60, 90, 120, 150, 180];
  const phaseNo = (p: string) => Number(p.replace(/\D/g, '')) || 1;
  const lane = (eco: string) => {
    const ps = phases.filter((p) => p.economy === eco && p.day !== null);
    // Un segmento por fase: desde su primer hito hasta el primero de la fase siguiente.
    const starts: Array<{ phase: string; day: number; confirmed: boolean }> = [];
    for (const p of ps) if (!starts.some((s) => s.phase === p.phase)) starts.push({ phase: p.phase, day: p.day!, confirmed: p.confirmed });
    return { ps, segs: starts.map((s, i) => ({ ...s, end: starts[i + 1]?.day ?? MAX_DAY })) };
  };
  const desc = phases.filter((p) => p.day !== null).map((p) => `${t(p.economy === 'forever' ? 'WoW Forever' : 'Classic Anniversary')}, ${t('día {n}', { n: p.day! })}: ${t(p.phase)}, ${t(p.milestone)}${p.confirmed ? '' : ` (${t('sin confirmar')})`}`).join('; ');
  return (
    <section className="card" aria-labelledby="tl-phases-h">
      <h2 id="tl-phases-h" className="icon-inline" style={{ marginTop: 0 }}>{t('Las fases de cada versión, alineadas por días desde el lanzamiento')}</h2>
      <p className="small muted">{t('Forever abre sus primeras raids el día 35; Anniversary lo hizo el día 21. Lo que pasó con los precios en Anniversary tras abrir raids es la pista de lo que puede pasar aquí.')}</p>
      <div className="tl-phasebar" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Fases por días desde el lanzamiento. Hoy es el día {n} de Forever. {d}', { n: foreverDay, d: desc })}>
          {ticks.map((d) => (
            <g key={d}>
              <line className="ph-grid" x1={x(d)} x2={x(d)} y1={T} y2={H - B + 4} />
              <text className="ph-axis" x={x(d)} y={H - 6} textAnchor={d === 0 ? 'start' : d === MAX_DAY ? 'end' : 'middle'}>{d === 0 ? t('día 0') : d}</text>
            </g>
          ))}
          {lanes.map(([eco, label], li) => {
            const y = T + li * (laneH + gap);
            const { ps, segs } = lane(eco);
            return (
              <g key={eco}>
                <text className="tl-lane-label" x={L - 8} y={y + laneH / 2 + 4} textAnchor="end">{label}</text>
                {segs.map((s) => (
                  <g key={s.phase}>
                    <rect className={`tl-seg tl-seg-${Math.min(4, phaseNo(s.phase))}${s.confirmed ? '' : ' tl-seg-unconfirmed'}`} x={x(s.day)} y={y} width={Math.max(2, x(s.end) - x(s.day))} height={laneH} rx={3} />
                    {x(s.end) - x(s.day) > 34 && <text className="tl-seg-label" x={x(s.day) + 6} y={y + laneH / 2 + 4}>{t(s.phase)}{s.confirmed ? '' : ' ?'}</text>}
                  </g>
                ))}
                {ps.filter((p) => p.day! > 0).map((p) => (
                  <g key={p.milestone}>
                    <line className="tl-milestone" x1={x(p.day!)} x2={x(p.day!)} y1={y - 3} y2={y + laneH + 3} />
                    <title>{`${t('día {n}', { n: p.day! })}: ${t(p.milestone)}`}</title>
                  </g>
                ))}
                {eco === 'forever' && (
                  <g>
                    <line className="tl-today" x1={x(foreverDay)} x2={x(foreverDay)} y1={y - 6} y2={y + laneH + 6} />
                    <text className="tl-today-label" x={x(foreverDay) + 4} y={y - 4}>{t('Hoy')}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="tl-milestones small">
        {lanes.map(([eco, label]) => (
          <li key={eco}><strong>{label}:</strong>{' '}
            {phases.filter((p) => p.economy === eco && p.day !== null).map((p, i) => (
              <React.Fragment key={p.milestone}>{i > 0 && ' · '}<span className={p.confirmed ? undefined : 'tl-unconfirmed'}>{t('día {n}', { n: p.day! })} {t(p.milestone)}{p.confirmed ? '' : ` (${t('sin confirmar')})`}</span></React.Fragment>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

const PAGE = 100;

function TimelineList() {
  const { ctxQuery, ctx } = useApp();
  const d = useAsync(() => api<any>(`/api/timeline?${ctxQuery}`), [ctxQuery]);
  const [verdict, setVerdict] = useState<Verdict | ''>('');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [verdict, q, ctxQuery]);
  const all: any[] = d.data?.items ?? [];
  const list = useMemo(() => {
    const s = q.trim().toLocaleLowerCase(locale());
    return all.filter((i) => (!verdict || i.verdict === verdict) && (!s || String(i.name ?? '').toLocaleLowerCase(locale()).includes(s) || String(i.itemId) === s));
  }, [all, verdict, q]);
  const open = (id: number) => { location.hash = `#/linea-de-tiempo/${id}`; };

  return (
    <div>
      <PageHead title={t('Línea de tiempo')} icon={<ChartLineUp size={26} aria-hidden="true" />}>
        {t('Qué materiales conviene comprar baratos hoy para venderlos cuando abran las raids de WoW Forever, comparando lo que pasó con los precios en Classic Anniversary.')}
      </PageHead>
      <MarketStatus compact />
      <ForumNotice />
      {d.loading && !d.data ? <Loading rows={8} /> : d.error ? <ErrorBox error={d.error} onRetry={d.reload} /> : (
        <>
          <PhaseBar phases={d.data.phases} foreverDay={d.data.foreverDay} />
          {!ctx.realm ? <Empty icon={ChartLineUp}>{t('Elige una casa de subastas arriba para ver qué materiales conviene comprar.')}</Empty> : !all.length ? (
            <Empty icon={ChartLineUp}>{t('Aún no hay historial de precios de materiales en esta casa de subastas. Se guarda una muestra cada vez que se cargan los precios.')}</Empty>
          ) : (
            <>
              <div className="kpis status-filter" role="group" aria-label={t('Filtrar por veredicto')}>
                {TL_VERDICT.map(([k, label, help, I, tone]) => (
                  <button type="button" key={k} className={`kpi${verdict === k ? ' on' : ''}`} aria-pressed={verdict === k} title={t(help)} onClick={() => setVerdict(verdict === k ? '' : k)}>
                    <span className={`kpi-icon ${tone}`} aria-hidden="true"><I size={20} weight="bold" /></span>
                    <span><span className="kpi-value">{(d.data.counts[k] ?? 0).toLocaleString(locale())}</span><span className="kpi-label">{t(label)}</span></span>
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginBottom: 12 }}>
                <label className="field tl-search">{t('Buscar material')}
                  <span className="input-icon"><MagnifyingGlass size={16} aria-hidden="true" />
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('p. ej. Loto negro')} />
                  </span>
                </label>
                <p className="small muted" style={{ margin: 0 }} aria-live="polite">{t('{n} de {total} materiales con historial', { n: list.length.toLocaleString(locale()), total: all.length.toLocaleString(locale()) })}</p>
              </div>
              {!list.length ? <Empty icon={ChartLineUp}>{t('Ningún material cumple los filtros.')}</Empty> : (
                <div className="table-wrap">
                  <table className="responsive tl-table">
                    <caption className="sr-only">{t('Materiales ordenados por puntuación para comprar hoy y vender en raids')}</caption>
                    <thead>
                      <tr>
                        <th>{t('Material')}</th>
                        <th className="num">{t('Precio de hoy')}</th>
                        <th className="num" title={t('El más bajo de los últimos 7 días con datos')}>{t('Piso 7 d')}</th>
                        <th className="num" title={t('El más alto desde que hay historial')}>{t('Pico')}</th>
                        <th className="num" title={t('Cuánto bajó desde el pico')}>{t('Caída')}</th>
                        <th className="num" title={t('Media de los 3 últimos días frente a la de los 3 primeros de la semana')}>{t('Tendencia 7 d')}</th>
                        <th className="num" title={t('Unidades vendidas al día en toda la región (TradeSkillMaster)')}>{t('Ventas/día')}</th>
                        <th className="num" title={t('Unidades en venta hoy y su cambio frente a hace una semana')}>{t('En venta')}</th>
                        <th className="num" title={t('Cuántas veces puede subir: el menor entre lo que valió en Anniversary y el techo del vendedor')}>{t('Potencial')}</th>
                        <th className="num" title={t('Precio fijo de un vendedor: no puede pasar de ahí')}>{t('Techo')}</th>
                        <th>{t('Veredicto')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.slice(0, shown).map((i) => (
                        <tr key={i.itemId} className="tl-row" onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) open(i.itemId); }}>
                          <td data-label={t('Material')} className="cell-main">
                            <ItemLabel id={i.itemId} quality={i.quality} href={`#/linea-de-tiempo/${i.itemId}`} name={i.name ?? t('Objeto {id}', { id: i.itemId })}
                              sub={<>{i.uses > 0 ? t('Material de {n} recetas', { n: i.uses }) : t('No es material de recetas')}{i.score !== null ? ` · ${t('puntuación {n}', { n: i.score })}` : ''}</>} />
                          </td>
                          <td data-label={t('Precio de hoy')} className="num"><Money v={i.priceToday} />{i.inflated && <div className="small tl-flag">{t('local inflado')}</div>}</td>
                          <td data-label={t('Piso 7 d')} className="num"><Money v={i.floor7} /></td>
                          <td data-label={t('Pico')} className="num"><Money v={i.peak} /></td>
                          <td data-label={t('Caída')} className="num">{pctAbs(i.dropFromPeak)}</td>
                          <td data-label={t('Tendencia 7 d')} className={`num ${trendClass(i.trend7)}`}>{pctSigned(i.trend7)}</td>
                          <td data-label={t('Ventas/día')} className="num">{i.soldPerDay != null ? num(i.soldPerDay) : <span className="small muted">{t('sin ventas')}</span>}</td>
                          <td data-label={t('En venta')} className="num">{i.supplyToday != null ? num(i.supplyToday, 0) : '—'}{i.supplyTrend != null && <div className="small muted">{pctSigned(i.supplyTrend)}</div>}</td>
                          <td data-label={t('Potencial')} className="num">{times(i.potential)}</td>
                          <td data-label={t('Techo')} className="num">{i.vendorCap ? <Money v={i.vendorCap} /> : '—'}</td>
                          <td data-label={t('Veredicto')}>
                            <TimelineVerdict v={i.verdict} />
                            {i.reasons?.[0] && <div className="small muted tl-reason"><ReasonText r={i.reasons[0]} /></div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {list.length > shown && (
                <p style={{ textAlign: 'center' }}><button type="button" onClick={() => setShown((s) => s + PAGE)}>{t('Mostrar {n} más', { n: Math.min(PAGE, list.length - shown) })}</button></p>
              )}
              <HowItWorks />
            </>
          )}
        </>
      )}
    </div>
  );
}

const trendClass = (x: number | null | undefined) => (x === null || x === undefined ? '' : x < -0.1 ? 'tl-down' : x > 0.1 ? 'tl-up' : '');

function HowItWorks() {
  return (
    <details className="card small">
      <summary>{t('Cómo se calcula')}</summary>
      <ul>
        <li>{t('Precio de hoy: el valor de mercado actual de la casa. Si pasa de 1,6 veces el promedio de venta de la región, se usa el regional y se marca «local inflado».')}</li>
        <li>{t('Puntuación de 0 a 100: cerca del piso de 7 días (+30), precio estable (+20), caída desde el pico (+20), ventas en la región (+15 y +5), menos unidades en venta (+10) y potencial de ×3 o más (+10). Resta si el techo del vendedor deja menos de ×2, si el precio local está inflado, si hay una sola publicación o si es una hierba, mineral o piel común.')}</li>
        <li>{t('Comprar: 70 o más. Vigilar: de 50 a 69. Esperar: menos de 50 y bajando más de un 10 % en 7 días. Sin ventas en la región o por debajo de 1 o, como mucho «Vigilar».')}</li>
        <li>{t('En Forever entran más materiales que en Classic (semillas, Invernadero, Jardín de rocas, Bountiful Harvest), así que las hierbas y minerales comunes tienden a abaratarse. No hay Ficha de WoW y el oro pierde valor rápido: guardar materiales suele rendir más que guardar oro.')}</li>
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Detalle de un material
// ---------------------------------------------------------------------------

function TimelineDetail({ itemId }: { itemId: number }) {
  const { ctxQuery, ctx } = useApp();
  const d = useAsync(() => api<any>(`/api/timeline/items/${itemId}?${ctxQuery}`), [itemId, ctxQuery]);
  const admin = useAsync(() => api<{ required: boolean; authenticated: boolean }>('/api/auth/status'), []);
  const canEdit = Boolean(admin.data && (!admin.data.required || admin.data.authenticated));
  const r = d.data?.result;
  const name = d.data?.name ?? t('Objeto {id}', { id: itemId });

  return (
    <div>
      <p className="small"><a href="#/linea-de-tiempo" className="icon-inline"><ArrowLeft size={16} aria-hidden="true" />{t('Volver a la línea de tiempo')}</a></p>
      {d.loading && !d.data ? <Loading rows={6} /> : d.error ? <ErrorBox error={d.error} onRetry={d.reload} /> : (
        <>
          <PageHead title={<ItemLabel id={itemId} quality={d.data.quality} name={name} px={36} />}>
            {t('¿Comprarlo hoy y venderlo cuando abran las raids? Precio en Forever frente a lo que valió en Classic Anniversary, por días desde el lanzamiento.')}
          </PageHead>
          <MarketStatus compact />
          <ForumNotice />
          <section className="card" aria-labelledby="tl-sum-h">
            <h2 id="tl-sum-h" className="icon-inline" style={{ marginTop: 0, flexWrap: 'wrap' }}>
              <TimelineVerdict v={r.verdict} />
              {r.score !== null && <span className="muted small">{t('puntuación {n} de 100', { n: r.score })}</span>}
            </h2>
            <dl className="ph-stats tl-stats">
              <div><dt>{t('Precio de hoy')}</dt><dd><Money v={r.priceToday} />{r.inflated && <span className="small tl-flag">{t('local inflado')}</span>}</dd></div>
              <div><dt>{t('Piso de 7 días')}</dt><dd><Money v={r.floor7} /></dd></div>
              <div><dt>{t('Pico')}</dt><dd><Money v={r.peak} /></dd></div>
              <div><dt>{t('Caída desde el pico')}</dt><dd>{pctAbs(r.dropFromPeak)}</dd></div>
              <div><dt>{t('Tendencia de 7 días')}</dt><dd className={trendClass(r.trend7)}>{pctSigned(r.trend7)}</dd></div>
              <div><dt>{t('Volatilidad de 7 días')}</dt><dd>{pctAbs(r.volatility7)}</dd></div>
              <div><dt>{t('Ventas/día (región)')}</dt><dd>{r.soldPerDay != null ? num(r.soldPerDay) : t('sin ventas')}</dd></div>
              <div><dt>{t('En venta')}</dt><dd>{r.supplyToday != null ? num(r.supplyToday, 0) : '—'}{r.supplyTrend != null && <span className="small muted">({pctSigned(r.supplyTrend)})</span>}</dd></div>
              <div><dt>{t('Potencial Anniversary')}</dt><dd>{times(r.potentialAnniv)}</dd></div>
              <div><dt>{t('Potencial de techo')}</dt><dd>{times(r.potentialCap)}</dd></div>
              <div><dt>{t('Material de')}</dt><dd>{t('{n} recetas', { n: d.data.uses })}</dd></div>
            </dl>
            {d.data.vendorCap && (
              <p className="small">
                {t('Techo de vendedor:')}{' '}<strong><CoinText text={moneyC(String(d.data.vendorCap.cap))} /></strong>{' '}
                {t('({v}, sin límite de unidades).', { v: d.data.vendorCap.vendor })}{' '}
                {d.data.vendorCap.source && <a href={d.data.vendorCap.source} target="_blank" rel="noopener noreferrer">{t('Fuente')}</a>}
              </p>
            )}
            <h3 className="small" style={{ marginBottom: 4 }}>{t('Motivos')}</h3>
            <ul className="small tl-reasons">{r.reasons.map((x: Reason, i: number) => <li key={i}><ReasonText r={x} /></li>)}</ul>
          </section>
          {!ctx.realm ? <Empty icon={ChartLineUp}>{t('Elige una casa de subastas arriba para ver su historial.')}</Empty> : (
            <CompareChart data={d.data} />
          )}
          <Tiers tiers={d.data.tiers} buy={r.priceToday} commission={d.data.commission} />
          <References data={d.data} canEdit={canEdit} onChange={d.reload} itemId={itemId} itemName={name} />
        </>
      )}
    </div>
  );
}

interface Pt { kind: 'forever' | 'anniversary'; day: number; g: number; lo: number | null; hi: number | null; label: string; sub: string }

/** Forever (línea) frente a Anniversary (puntos con su rango) por días desde el lanzamiento; escala logarítmica. */
function CompareChart({ data }: { data: any }) {
  const uid = useId();
  const [box, W] = useWidth(280, 720);
  const [sel, setSel] = useState<number | null>(null);
  const H = W < 480 ? 220 : 280, L = 58, R = 14, T = 22, B = 28;
  const forever: Pt[] = data.history.filter((h: any) => h.marketValue !== null && h.foreverDay <= MAX_DAY).map((h: any) => ({
    kind: 'forever', day: h.foreverDay, g: gold(h.marketValue)!, lo: null, hi: null, label: t('Forever'), sub: h.day,
  }));
  const anniv: Pt[] = data.references.filter((x: any) => x.economy === 'anniversary' && x.day !== null && x.day <= MAX_DAY).map((x: any) => ({
    kind: 'anniversary', day: x.day, g: gold(x.price)!, lo: gold(x.min), hi: gold(x.max), label: `${t('Anniversary')} · ${x.realm ?? ''}`, sub: x.observedOn,
  }));
  const era = data.references.filter((x: any) => x.economy === 'era');
  const later = data.references.filter((x: any) => x.economy === 'anniversary' && x.day !== null && x.day > MAX_DAY).length;
  const cap = data.vendorCap ? gold(String(data.vendorCap.cap)) : null;
  const pts = [...forever, ...anniv].sort((a, b) => a.day - b.day || (a.kind === 'forever' ? -1 : 1));
  const raidDay = data.phases.find((p: any) => p.economy === 'forever' && p.phase === 'Fase 2')?.day ?? 35;
  const annivPhases = data.phases.filter((p: any) => p.economy === 'anniversary' && p.day !== null);

  const geo = useMemo(() => {
    const vals = [...pts.flatMap((p) => [p.g, p.lo ?? p.g, p.hi ?? p.g]), ...era.map((e: any) => gold(e.price)!), ...(cap ? [cap] : [])].filter((v) => v > 0);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (!Number.isFinite(lo)) { lo = 0.01; hi = 1; }
    lo = lo / 1.5; hi = hi * 1.5;
    const ll = Math.log10(lo), lh = Math.log10(hi);
    const x = (d: number) => L + (d / MAX_DAY) * (W - L - R);
    const y = (g: number) => T + (1 - (Math.log10(Math.max(g, lo)) - ll) / (lh - ll)) * (H - T - B);
    // Marcas 1-2-5 × 10^k dentro del rango; como mucho 6.
    const ticks: number[] = [];
    for (let k = Math.floor(ll) - 1; k <= Math.ceil(lh); k++) for (const m of [1, 2, 5]) { const v = m * 10 ** k; if (v >= lo && v <= hi) ticks.push(v); }
    const step = Math.ceil(ticks.length / 6);
    return { x, y, ticks: ticks.filter((_, i) => i % step === 0), path: forever.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.g).toFixed(1)}`).join(' ') };
  }, [data, W, H]);

  if (!pts.length && !era.length) {
    return <section className="card"><h2 style={{ marginTop: 0 }}>{t('Forever frente a Anniversary')}</h2><p className="muted small">{t('Aún no hay historial de este objeto en esta casa ni referencias de Anniversary.')}</p></section>;
  }
  const cur = sel !== null ? pts[sel] : null;
  const pick = (clientX: number, el: SVGSVGElement) => {
    if (!pts.length) return;
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(geo.x(p.day) - px) < Math.abs(geo.x(pts[best].day) - px)) best = i; });
    setSel(best);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!pts.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setSel((s) => Math.min(pts.length - 1, Math.max(0, (s ?? pts.length - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') setSel(null);
  };
  const tipLeft = cur ? Math.min(80, Math.max(20, (geo.x(cur.day) / W) * 100)) : 50;
  const fmtG = (g: number | null) => (g === null ? '—' : formatMoney(Q.of(BigInt(Math.round(g * 10000)))));

  return (
    <section className="card ph" aria-labelledby={`${uid}-h`}>
      <div className="ph-head"><h2 id={`${uid}-h`} className="icon-inline"><ChartLineUp size={18} aria-hidden="true" />{t('Precio en Forever frente a lo que valió en Anniversary, por días desde el lanzamiento')}</h2></div>
      <ul className="tl-legend small" aria-hidden="true">
        <li><span className="tl-key tl-key-line" />{t('Forever (media diaria de esta casa)')}</li>
        <li><span className="tl-key tl-key-dot" />{t('Anniversary (citas de jugadores; la barra es el rango)')}</li>
        {era.length > 0 && <li><span className="tl-key tl-key-era" />{t('Era (economía madura)')}</li>}
        {cap && <li><span className="tl-key tl-key-cap" />{t('Techo del vendedor')}</li>}
      </ul>
      <div className="ph-plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0} aria-describedby={`${uid}-hint`}
          aria-label={t('{f} días de Forever y {a} referencias de Anniversary en escala logarítmica. Hoy: {p}.', { f: forever.length, a: anniv.length, p: formatMoney(toQ(data.result.priceToday)) })}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)} onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setSel(null); }} onKeyDown={onKey} onBlur={() => setSel(null)}>
          {annivPhases.map((p: any, i: number) => {
            const end = annivPhases.slice(i + 1).find((n: any) => n.phase !== p.phase)?.day ?? MAX_DAY;
            if (annivPhases.findIndex((n: any) => n.phase === p.phase) !== i) return null;
            return (
              <g key={p.phase}>
                <rect className={`tl-band tl-seg-${Math.min(4, Number(p.phase.replace(/\D/g, '')) || 1)}`} x={geo.x(p.day)} y={T} width={Math.max(0, geo.x(Math.min(end, MAX_DAY)) - geo.x(p.day))} height={H - T - B} />
                <text className="ph-axis" x={geo.x(p.day) + 4} y={T - 8}>{W < 480 ? t(p.phase).replace(/^\D+/, 'F') : t(p.phase)}</text>
              </g>
            );
          })}
          {geo.ticks.map((v, i) => (
            <g key={i}>
              <line className="ph-grid" x1={L} x2={W - R} y1={geo.y(v)} y2={geo.y(v)} />
              <text className="ph-axis" x={L - 8} y={geo.y(v) + 4} textAnchor="end">{gTick(v)}</text>
            </g>
          ))}
          {[0, 60, 120, 180].map((dd) => <text key={dd} className="ph-axis" x={geo.x(dd)} y={H - 8} textAnchor={dd === 0 ? 'start' : dd === MAX_DAY ? 'end' : 'middle'}>{dd === 0 ? t('día 0') : dd}</text>)}
          <line className="tl-raid" x1={geo.x(raidDay)} x2={geo.x(raidDay)} y1={T} y2={H - B} />
          <text className="tl-raid-label" x={geo.x(raidDay) + 4} y={H - B - 6}>{t('Raids en Forever')}</text>
          {cap && <line className="tl-cap" x1={L} x2={W - R} y1={geo.y(cap)} y2={geo.y(cap)} />}
          {era.map((e: any) => <line key={e.id} className="tl-era" x1={L} x2={W - R} y1={geo.y(gold(e.price)!)} y2={geo.y(gold(e.price)!)} />)}
          {forever.length > 1 && <path className="ph-line" d={geo.path} />}
          {forever.length === 1 && <circle className="ph-dot" cx={geo.x(forever[0].day)} cy={geo.y(forever[0].g)} r={4} />}
          {anniv.map((p, i) => (
            <g key={i}>
              {p.lo !== null && p.hi !== null && p.hi > p.lo && <line className="tl-range" x1={geo.x(p.day)} x2={geo.x(p.day)} y1={geo.y(p.hi)} y2={geo.y(p.lo)} />}
              <circle className="tl-ref" cx={geo.x(p.day)} cy={geo.y(p.g)} r={4.5} />
            </g>
          ))}
          {cur && (
            <g>
              <line className="ph-cross" x1={geo.x(cur.day)} x2={geo.x(cur.day)} y1={T} y2={H - B} />
              <circle className={cur.kind === 'forever' ? 'ph-dot ph-dot-sel' : 'tl-ref tl-ref-sel'} cx={geo.x(cur.day)} cy={geo.y(cur.g)} r={6} />
            </g>
          )}
        </svg>
        {cur && (
          <div className="ph-tip" role="status" style={{ left: `${tipLeft}%` }}>
            <strong>{t('Día {n}', { n: cur.day })} · {cur.label}</strong>
            <span><CoinText text={fmtG(cur.g)} />{cur.lo !== null && cur.hi !== null && cur.hi > cur.lo && <> ({<CoinText text={fmtG(cur.lo)} />} – {<CoinText text={fmtG(cur.hi)} />})</>}</span>
            <span className="muted">{cur.sub}</span>
          </div>
        )}
      </div>
      <p id={`${uid}-hint`} className="small muted">
        {t('Escala logarítmica: cada línea de la rejilla multiplica el precio. Pasa el ratón o usa las flechas ← → sobre el gráfico.')}
        {later > 0 && <>{' '}{t('Hay {n} referencias posteriores al día 180 en la tabla de referencias.', { n: later })}</>}
      </p>
      <details className="ph-table">
        <summary>{t('Ver como tabla')}</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th className="num">{t('Día')}</th><th>{t('Serie')}</th><th className="num">{t('Precio')}</th><th className="num">{t('Rango')}</th><th>{t('Fecha')}</th></tr></thead>
            <tbody>{pts.map((p, i) => (
              <tr key={i}><td className="num">{p.day}</td><td>{p.label}</td><td className="num"><CoinText text={fmtG(p.g)} /></td>
                <td className="num">{p.lo !== null && p.hi !== null && p.hi > p.lo ? <><CoinText text={fmtG(p.lo)} /> – <CoinText text={fmtG(p.hi)} /></> : '—'}</td><td>{p.sub}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Tiers({ tiers, buy, commission }: { tiers: any[]; buy: any; commission: string }) {
  return (
    <section className="card" aria-labelledby="tl-tiers-h">
      <h2 id="tl-tiers-h" style={{ marginTop: 0 }}>{t('Tramos de venta sugeridos')}</h2>
      {!tiers.length ? <p className="muted small">{toQ(buy) ? t('No hay tramos: el techo del vendedor o el pico no dejan subir lo suficiente sobre el precio de hoy.') : t('Sin precio de hoy no se pueden calcular tramos.')}</p> : (
        <>
          <p className="small muted">{t('Si compras a {p}, vende por partes cuando el precio llegue a cada tramo. Cada tramo se recorta al techo del vendedor y al pico (o a lo que valió en Anniversary, si es mayor).', { p: formatMoney(toQ(buy)) })}</p>
          <div className="table-wrap">
            <table className="responsive">
              <thead><tr><th>{t('Tramo')}</th><th className="num">{t('Vender a')}</th><th className="num">{t('Parte')}</th><th className="num">{t('Ganancia por unidad')}</th><th>{t('Límite')}</th></tr></thead>
              <tbody>{tiers.map((x) => (
                <tr key={x.multiple}>
                  <td data-label={t('Tramo')}>×{x.multiple}</td>
                  <td data-label={t('Vender a')} className="num"><Money v={x.price} /></td>
                  <td data-label={t('Parte')} className="num">{pctAbs(toQ(x.share)?.toNumber())}</td>
                  <td data-label={t('Ganancia por unidad')} className="num"><Money v={x.netGain} /></td>
                  <td data-label={t('Límite')}>{x.clippedBy === 'techo' ? t('techo del vendedor') : x.clippedBy === 'pico' ? t('pico de Forever') : x.clippedBy === 'referencia' ? t('referencia de Anniversary') : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="small muted">{t('Ganancia ya restada la comisión de la casa ({c} %). Es una estimación: el precio puede no llegar.', { c: num(Number(commission) * 100) })}</p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Referencias (con formulario para el administrador)
// ---------------------------------------------------------------------------

const CONF: Record<string, string> = { alta: 'alta', media: 'media', baja: 'baja' };
const ECO: Record<string, string> = { anniversary: 'Classic Anniversary', forever: 'WoW Forever', era: 'Classic Era' };
const emptyForm = { id: null as number | null, economy: 'anniversary', observedOn: '', gold: '', goldMin: '', goldMax: '', realm: '', note: '', confidence: 'media', sourceUrl: '' };
const toGold = (c: string | null) => (c === null || c === undefined ? '' : Q.of(BigInt(c)).div(10000n).toDecimal(4));

function References({ data, canEdit, onChange, itemId, itemName }: { data: any; canEdit: boolean; onChange: () => void; itemId: number; itemName: string }) {
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs: any[] = data.references;
  const set = (k: keyof typeof emptyForm, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true); setErr(null);
    const body = { ...form, itemId, itemName, goldMin: form.goldMin || null, goldMax: form.goldMax || null };
    try {
      await api(form.id ? `/api/timeline/references/${form.id}` : '/api/timeline/references', { method: form.id ? 'PUT' : 'POST', body });
      setForm(null); onChange();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    if (!confirm(t('¿Borrar esta referencia? No se puede deshacer.'))) return;
    try { await api(`/api/timeline/references/${id}`, { method: 'DELETE' }); onChange(); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <section className="card" aria-labelledby="tl-refs-h">
      <div className="ph-head">
        <h2 id="tl-refs-h" style={{ margin: 0 }}>{t('Referencias de otras versiones')}</h2>
        {canEdit && !form && <button type="button" onClick={() => setForm({ ...emptyForm })}><Plus size={16} aria-hidden="true" />{t('Agregar referencia')}</button>}
      </div>
      {err && <p className="alert bad" role="alert">{err}</p>}
      {!refs.length ? <p className="muted small">{t('No hay referencias de Anniversary ni de Era para este objeto: el potencial solo puede venir del techo del vendedor.')}</p> : (
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>{t('Versión')}</th><th className="num">{t('Día')}</th><th>{t('Fase')}</th><th className="num">{t('Precio')}</th><th>{t('Reino')}</th><th>{t('Nota')}</th><th>{t('Confianza')}</th><th>{t('Fuente')}</th>{canEdit && <th><span className="sr-only">{t('Acciones')}</span></th>}</tr></thead>
            <tbody>{refs.map((x) => (
              <tr key={x.id}>
                <td data-label={t('Versión')}>{t(ECO[x.economy] ?? x.economy)}<div className="small muted">{x.observedOn}</div></td>
                <td data-label={t('Día')} className="num">{x.day ?? '—'}</td>
                <td data-label={t('Fase')}>{x.phase ? t(x.phase) : '—'}</td>
                <td data-label={t('Precio')} className="num"><CoinText text={moneyC(x.price)} />{x.min && x.max && x.max !== x.min && <div className="small muted"><CoinText text={moneyC(x.min)} /> – <CoinText text={moneyC(x.max)} /></div>}</td>
                <td data-label={t('Reino')}>{x.realm ?? '—'}</td>
                <td data-label={t('Nota')} className="small">{x.note ?? '—'}</td>
                <td data-label={t('Confianza')}>{t(CONF[x.confidence] ?? x.confidence)}</td>
                <td data-label={t('Fuente')}><a href={x.source} target="_blank" rel="noopener noreferrer" className="icon-inline"><LinkSimple size={14} aria-hidden="true" />{t('Ver hilo')}</a></td>
                {canEdit && (
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" aria-label={t('Editar referencia')} title={t('Editar')} onClick={() => setForm({ id: x.id, economy: x.economy, observedOn: x.observedOn, gold: toGold(x.price), goldMin: toGold(x.min), goldMax: toGold(x.max), realm: x.realm ?? '', note: x.note ?? '', confidence: x.confidence, sourceUrl: x.source })}><PencilSimple size={16} aria-hidden="true" /></button>
                      <button type="button" aria-label={t('Borrar referencia')} title={t('Borrar')} onClick={() => remove(x.id)}><Trash size={16} aria-hidden="true" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {canEdit && form && (
        <form className="tl-form" onSubmit={submit} aria-label={form.id ? t('Editar referencia') : t('Agregar referencia')}>
          <h3 className="small">{form.id ? t('Editar referencia') : t('Agregar referencia')}</h3>
          <div className="row">
            <label className="field">{t('Versión')}
              <select value={form.economy} onChange={(e) => set('economy', e.target.value)}>
                {Object.entries(ECO).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
              </select>
            </label>
            <label className="field">{t('Fecha observada')}<input type="date" value={form.observedOn} onChange={(e) => set('observedOn', e.target.value)} required /></label>
            <label className="field">{t('Precio (oro)')}<input type="text" inputMode="decimal" value={form.gold} onChange={(e) => set('gold', e.target.value)} required placeholder="50" /></label>
            <label className="field">{t('Mínimo (oro)')}<input type="text" inputMode="decimal" value={form.goldMin} onChange={(e) => set('goldMin', e.target.value)} /></label>
            <label className="field">{t('Máximo (oro)')}<input type="text" inputMode="decimal" value={form.goldMax} onChange={(e) => set('goldMax', e.target.value)} /></label>
            <label className="field">{t('Confianza')}
              <select value={form.confidence} onChange={(e) => set('confidence', e.target.value)}>
                {Object.keys(CONF).map((k) => <option key={k} value={k}>{t(k)}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <label className="field">{t('Reino')}<input type="text" value={form.realm} maxLength={120} onChange={(e) => set('realm', e.target.value)} /></label>
            <label className="field tl-grow">{t('Nota')}<input type="text" value={form.note} maxLength={300} onChange={(e) => set('note', e.target.value)} /></label>
            <label className="field tl-grow">{t('Enlace a la fuente (https://)')}<input type="url" value={form.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} required pattern="https://.*" placeholder="https://" /></label>
          </div>
          <div className="row">
            <button type="submit" className="primary" disabled={busy}>{busy ? t('Guardando…') : t('Guardar')}</button>
            <button type="button" onClick={() => { setForm(null); setErr(null); }}>{t('Cancelar')}</button>
          </div>
        </form>
      )}
    </section>
  );
}
