import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, PageHead, Money, toQ, age, hoursSince, dt, hashQuery, setHashQuery } from '../lib.js';
import { ItemLabel } from '../icons.js';
import { ArrowFatLinesUp, ArrowSquareOut, Warning, ShoppingCart, Trash, Calculator, ListNumbers, CheckCircle, Info } from '@phosphor-icons/react';

const MANUAL_KEY = 'levelingManualPrices';

function loadManual(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function saveManual(m: Record<string, string>) {
  try { localStorage.setItem(MANUAL_KEY, JSON.stringify(m)); } catch { /* sin almacenamiento */ }
}
const validGold = (v: string) => /^\d{1,7}(\.\d{1,4})?$/.test(v.trim());

/** Color de dificultad: punto de color + nombre (nunca solo color). */
function SkillColor({ c }: { c: string | null }) {
  if (!c) return null;
  return <span className={`skill skill-${c}`}>{c}</span>;
}

/** Cómo se consigue la receta, en una frase corta. */
function HowToLearn({ r }: { r: any }) {
  if (r.availability === 'instructor') {
    const cost = String(r.trainingCost ?? '0'); // cobre como texto (bigint serializado)
    return <>Instructor (nivel {r.learnedAt}){cost !== '0' && <>{' · '}<Money v={{ n: cost, d: '1' }} /></>}</>;
  }
  if (r.availability === 'inicial') return <span title="Wowhead no indica su fuente; se deduce que se conoce al aprender la profesión.">Se conoce al aprender la profesión</span>;
  return <span className="lv-warn-text" title="Requiere patrón, botín, misión u otra fuente: no está garantizada.">Patrón, botín o misión (nivel {r.learnedAt})</span>;
}

type Tab = 'pasos' | 'compra';

export function Leveling() {
  const { ctxQuery, ctx } = useApp();
  const init = hashQuery();
  const profs = useAsync(() => api(`/api/leveling/professions?version=${ctx.version}`), [ctx.version]);
  const [prof, setProf] = useState(init.get('prof') ?? '');
  const [from, setFrom] = useState(init.get('from') ?? '1');
  const [to, setTo] = useState(init.get('to') ?? '');
  const [all, setAll] = useState(init.get('all') === '1');
  const [manual, setManual] = useState<Record<string, string>>(loadManual);
  const [applied, setApplied] = useState<{ prof: string; from: string; to: string; all: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>('pasos');

  const list: any[] = profs.data?.professions ?? [];
  const current = list.find((p) => String(p.id) === prof) ?? null;

  // Profesión por defecto y objetivo por defecto cuando cambia la profesión.
  useEffect(() => {
    if (!list.length) return;
    if (!current) { setProf(String(list[0].id)); return; }
    if (!to) setTo(String(current.defaultTo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, prof]);

  // Calcula al elegir profesión y al pulsar «Calcular».
  useEffect(() => {
    if (current && to) setApplied({ prof, from, to, all });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prof, current?.id, to === '' ? '' : 'set']);

  const manualParam = useMemo(
    () => Object.entries(manual).filter(([, v]) => validGold(v)).map(([k, v]) => `${k}:${v.trim()}`).join(','),
    [manual],
  );
  const plan = useAsync(
    () => (applied
      ? api(`/api/leveling?${ctxQuery}&profession=${applied.prof}&from=${applied.from}&to=${applied.to}&trainerOnly=${applied.all ? '0' : '1'}${manualParam ? `&manual=${encodeURIComponent(manualParam)}` : ''}`)
      : Promise.resolve(null)),
    [applied, ctxQuery, manualParam],
  );
  useEffect(() => {
    if (applied) setHashQuery('/nivel', new URLSearchParams({ prof: applied.prof, from: applied.from, to: applied.to, ...(applied.all ? { all: '1' } : {}) }));
  }, [applied]);

  const setPrice = (id: number, v: string) => {
    const next: Record<string, string> = { ...manual, [id]: v };
    if (!v.trim()) delete next[id];
    setManual(next); saveManual(next);
  };

  const fromN = Number(from), toN = Number(to);
  const rangeError = !Number.isInteger(fromN) || !Number.isInteger(toN) || fromN < 1 || toN <= fromN || (current && toN > current.maxSkill)
    ? `El nivel actual debe ser 1 o más y menor que el objetivo${current ? ` (máximo ${current.maxSkill})` : ''}.` : null;

  const d = plan.data;
  const gapLevels = d ? d.steps.filter((s: any) => !s.recipe).reduce((n: number, s: any) => n + (s.to - s.from), 0) : 0;
  const manualCount = Object.keys(manual).length;

  return (
    <>
      <PageHead title="Subir de nivel" icon={<ArrowFatLinesUp size={26} weight="duotone" aria-hidden="true" />}>
        Elige la profesión y los niveles: te decimos qué fabricar, cuántas veces y cuánto cuesta con los precios de tu casa de subastas.
      </PageHead>

      <form className="card lv-form" onSubmit={(e) => { e.preventDefault(); if (!rangeError) setApplied({ prof, from, to, all }); }}>
        {profs.loading && <Loading label="Cargando profesiones…" />}
        {profs.error && <ErrorBox error={profs.error} onRetry={profs.reload} />}
        {!!list.length && (
          <>
            <div className="lv-fields">
              <label className="field lv-prof">
                Profesión
                <select value={prof} onChange={(e) => { setProf(e.target.value); const p = list.find((x) => String(x.id) === e.target.value); if (p) setTo(String(p.defaultTo)); }}>
                  {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="field">
                Nivel actual
                <input type="number" min={1} value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={!!rangeError} />
              </label>
              <label className="field">
                Nivel objetivo
                <input type="number" min={2} max={current?.maxSkill} value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={!!rangeError} />
              </label>
              <button type="submit" className="primary lv-submit" disabled={!!rangeError}><Calculator size={18} aria-hidden="true" />Calcular ruta</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
              Incluir recetas de patrón, botín o misión
            </label>
            {rangeError && <p className="small lv-error" role="alert">{rangeError}</p>}
          </>
        )}
      </form>

      {plan.loading && applied && <Loading label="Calculando la ruta…" rows={5} />}
      {plan.error && <ErrorBox error={plan.error} onRetry={plan.reload} />}
      {d && !plan.loading && (
        <>
          {/* Resumen: una cifra principal y dos secundarias. */}
          <section className="card lv-summary" aria-label="Resumen de costos">
            <div className="lv-summary-main">
              <span className="lv-summary-label">{d.profession.name} · {d.from} → {d.to}</span>
              <span className="lv-total"><Money v={d.total} /></span>
              <span className="lv-summary-label">Costo total estimado</span>
            </div>
            <dl className="lv-summary-parts">
              <div><dt>Materiales</dt><dd><Money v={d.materialsCost} /></dd></div>
              <div><dt>Instructor</dt><dd><Money v={d.trainingCost} /></dd></div>
            </dl>
            <p className={`lv-status ${d.incomplete ? 'warn' : 'ok'}`}>
              {d.incomplete
                ? <><Warning size={18} weight="bold" aria-hidden="true" />Faltan precios para {gapLevels} niveles: el total no los incluye. Revisa los pasos marcados.</>
                : <><CheckCircle size={18} weight="bold" aria-hidden="true" />Ruta completa con precios de la casa de subastas.</>}
            </p>
          </section>

          <div className="lv-tabs" role="tablist" aria-label="Vista">
            <button type="button" role="tab" aria-selected={tab === 'pasos'} aria-controls="lv-panel" onClick={() => setTab('pasos')}>
              <ListNumbers size={18} aria-hidden="true" />Pasos <span className="lv-count">{d.steps.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'compra'} aria-controls="lv-panel" onClick={() => setTab('compra')}>
              <ShoppingCart size={18} aria-hidden="true" />Lista de compra <span className="lv-count">{d.shopping.length}</span>
            </button>
          </div>

          <div id="lv-panel" role="tabpanel">
            {tab === 'pasos' ? (
              <ol className="lv-steps">
                {d.steps.map((s: any, i: number) => (
                  <li key={i} className={`lv-step${s.recipe ? '' : ' gap'}`}>
                    <div className="lv-level"><span className="lv-step-n">Paso {i + 1}</span><span className="mono">{s.from} → {s.to}</span></div>
                    {s.recipe ? (
                      <>
                        <div className="lv-main">
                          <div className="lv-title">
                            <span className="lv-qty mono" title={`Esperadas: ${toQ(s.expectedCrafts)?.toDecimal(2) ?? '—'}`}>{String(s.crafts)} ×</span>
                            <ItemLabel id={s.recipe.createsItemId} quality={s.recipe.createsQuality} px={32}
                              href={s.recipe.catalogRecipeId ? `#/receta/${s.recipe.catalogRecipeId}` : undefined}
                              name={s.recipe.name ?? s.recipe.nameEn} />
                          </div>
                          <ul className="lv-mats" aria-label="Materiales">
                            {s.materials.map((m: any) => (
                              <li key={m.itemId} className="lv-chip">
                                <span className="mono">{String(m.quantity)} ×</span>
                                <ItemLabel id={m.itemId} quality={m.quality} px={18} name={m.name ?? `Objeto ${m.itemId}`} />
                                {m.priceSource === 'manual' && <span className="lv-manual" title="Precio indicado por ti">manual</span>}
                              </li>
                            ))}
                          </ul>
                          <p className="lv-meta">
                            <HowToLearn r={s.recipe} />
                            <span aria-hidden="true">·</span>
                            <span>Dificultad <SkillColor c={s.colorFrom} />{s.colorTo !== s.colorFrom && <> a <SkillColor c={s.colorTo} /></>}</span>
                            <span aria-hidden="true">·</span>
                            <a href={s.recipe.wowheadUrl} target="_blank" rel="noreferrer" className="icon-inline">Wowhead<ArrowSquareOut size={12} aria-hidden="true" /></a>
                          </p>
                        </div>
                        <div className="lv-cost"><Money v={s.cost} /></div>
                      </>
                    ) : (
                      <div className="lv-main">
                        <p className="lv-gap-title"><Warning size={18} weight="bold" aria-hidden="true" />Sin datos para estos niveles</p>
                        <p className="small lv-gap-reason">{s.reason}</p>
                        {!!s.missingItems.length && (
                          <div className="lv-prices">
                            <span className="small muted">Si sabes cuánto cuestan (por ejemplo, en el vendedor), escribe el precio en oro:</span>
                            {s.missingItems.slice(0, 6).map((m: any) => (
                              <label key={m.itemId} className="lv-price-row">
                                <ItemLabel id={m.itemId} quality={m.quality} px={18} name={m.name ?? `Objeto ${m.itemId}`} />
                                <input type="text" inputMode="decimal" placeholder="oro, p. ej. 0.05"
                                  aria-label={`Precio en oro de ${m.name ?? `objeto ${m.itemId}`}`}
                                  defaultValue={manual[m.itemId] ?? ''} onBlur={(e) => setPrice(m.itemId, e.target.value)}
                                  aria-invalid={!!invalidGold(manual[m.itemId])} />
                              </label>
                            ))}
                            {s.missingItems.length > 6 && <span className="small muted">… y {s.missingItems.length - 6} más.</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <section className="card lv-shop">
                {!d.shopping.length ? <p className="muted">No hay materiales con precio para comprar.</p> : (
                  <table className="lv-shop-table">
                    <thead><tr><th>Material</th><th className="num">Cantidad</th><th className="num">Total</th></tr></thead>
                    <tbody>
                      {d.shopping.map((m: any) => (
                        <tr key={m.itemId}>
                          <td><ItemLabel id={m.itemId} quality={m.quality} px={24} href={`#/materiales/${m.itemId}`} name={m.name ?? `Objeto ${m.itemId}`} /></td>
                          <td className="num">{String(m.quantity)}</td>
                          <td className="num">
                            <Money v={m.cost} />
                            <span className="lv-unit"><Money v={m.unitPrice} /> c/u{m.priceSource === 'manual' ? ' · manual' : ''}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><th colSpan={2}>Total materiales</th><td className="num"><Money v={d.materialsCost} /></td></tr></tfoot>
                  </table>
                )}
              </section>
            )}
          </div>

          {manualCount > 0 && (
            <details className="card lv-details">
              <summary>Tus precios manuales ({manualCount})</summary>
              <p className="small muted">Se guardan solo en este navegador y sustituyen al precio de la casa de subastas.</p>
              <ul className="lv-manual-list">
                {Object.entries(manual).map(([id, v]) => (
                  <li key={id}>
                    <ItemLabel id={Number(id)} px={18} quality={itemInfo(d, Number(id))?.quality} name={itemInfo(d, Number(id))?.name ?? `Objeto ${id}`} />
                    <span className="mono">{v} oro</span>{!validGold(v) && <span className="badge b-bad">no válido: no se usa</span>}
                    <button type="button" className="link danger" onClick={() => setPrice(Number(id), '')}><Trash size={14} aria-hidden="true" />Quitar</button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details className="card lv-details">
            <summary className="icon-inline"><Info size={16} aria-hidden="true" />¿Cómo se calcula?</summary>
            <ul className="small lv-notes">
              <li>En cada nivel se elige la receta que sube un punto más barato. Las veces a fabricar en dificultad amarilla y verde son una <strong>estimación</strong> (fórmula de la comunidad); se redondean hacia arriba.</li>
              <li>Precios: casa de subastas elegida arriba, campo «{d.priceField}», escaneo {d.priceSourceTime ? `hace ${age(hoursSince(d.priceSourceTime))} (${dt(d.priceSourceTime)})` : 'sin datos'}. Un material sin precio nunca se cuenta como gratis.</li>
              <li>Recetas y dificultad: <a href={d.source.url} target="_blank" rel="noreferrer">Wowhead (WoW Forever)</a>, datos del {dt(d.source.fetchedAt)}.</li>
              <li>Por defecto solo se usan recetas del instructor y las que se conocen al aprender la profesión. El objetivo por defecto es 300.</li>
              <li>Herboristería, Desuello y Pesca no aparecen: se suben recolectando.</li>
            </ul>
          </details>
        </>
      )}
    </>
  );
}

/** Nombre y calidad de un objeto según el plan cargado (lista de compra o materiales). */
function itemInfo(d: any, id: number): { name: string | null; quality: string | null } | null {
  const hit = d.shopping.find((m: any) => m.itemId === id)
    ?? d.steps.flatMap((s: any) => [...s.materials, ...s.missingItems]).find((m: any) => m.itemId === id);
  return hit ? { name: hit.name, quality: hit.quality } : null;
}

/** Texto no vacío que no es oro con hasta 4 decimales. */
function invalidGold(v: string | undefined) {
  return v !== undefined && v.trim() !== '' && !validGold(v);
}
