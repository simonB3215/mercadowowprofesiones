import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, PageHead, Money, toQ, age, hoursSince, dt, hashQuery, setHashQuery } from '../lib.js';
import { ItemLabel } from '../icons.js';
import { ArrowFatLinesUp, ArrowSquareOut, Warning, Info, ShoppingCart, Trash, Calculator } from '@phosphor-icons/react';

const COLOR_LABEL: Record<string, string> = { naranja: 'naranja', amarillo: 'amarillo', verde: 'verde', gris: 'gris' };
const MANUAL_KEY = 'levelingManualPrices';

function loadManual(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function saveManual(m: Record<string, string>) {
  try { localStorage.setItem(MANUAL_KEY, JSON.stringify(m)); } catch { /* sin almacenamiento */ }
}
const validGold = (v: string) => /^\d{1,7}(\.\d{1,4})?$/.test(v.trim());

function SkillColor({ c }: { c: string | null }) {
  if (!c) return <>—</>;
  return <span className={`skill skill-${c}`}>{COLOR_LABEL[c] ?? c}</span>;
}

function Availability({ r }: { r: any }) {
  if (r.availability === 'instructor') {
    // El coste de aprendizaje llega en cobre como texto (bigint serializado).
    const cost = String(r.trainingCost ?? '0');
    return <span className="badge b-info">Instructor{cost !== '0' ? <>{' · '}<Money v={{ n: cost, d: '1' }} /></> : null}</span>;
  }
  if (r.availability === 'inicial') return <span className="badge b-neutral" title="Wowhead no indica su fuente; se deduce que se conoce al aprender la profesión.">Inicial (deducida)</span>;
  return <span className="badge b-warn" title="Requiere patrón, botín, misión u otra fuente: no está garantizada.">Patrón u otra fuente</span>;
}

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
    ? `El nivel inicial debe ser ≥ 1 y menor que el final${current ? `, y el final ≤ ${current.maxSkill}` : ''}.` : null;

  const d = plan.data;
  return (
    <>
      <PageHead title="Subir de nivel" icon={<ArrowFatLinesUp size={26} weight="duotone" aria-hidden="true" />}>
        La ruta más barata para subir cada profesión con los precios de tu casa de subastas. Las fabricaciones de los tramos amarillo y verde son una <strong>estimación</strong>; el costo real puede variar.
      </PageHead>

      <form className="card" onSubmit={(e) => { e.preventDefault(); if (!rangeError) setApplied({ prof, from, to, all }); }}>
        {profs.loading && <Loading label="Cargando profesiones…" />}
        {profs.error && <ErrorBox error={profs.error} onRetry={profs.reload} />}
        {!!list.length && (
          <div className="row">
            <label className="field" style={{ flex: '1 1 200px' }}>
              Profesión
              <select value={prof} onChange={(e) => { setProf(e.target.value); const p = list.find((x) => String(x.id) === e.target.value); if (p) setTo(String(p.defaultTo)); }}>
                {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 120 }}>
              Nivel actual
              <input type="number" min={1} value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={!!rangeError} />
            </label>
            <label className="field" style={{ width: 120 }}>
              Nivel objetivo
              <input type="number" min={2} max={current?.maxSkill} value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={!!rangeError} />
            </label>
            <button type="submit" className="primary" disabled={!!rangeError}><Calculator size={18} aria-hidden="true" />Calcular ruta</button>
          </div>
        )}
        {!!list.length && (
          <label className="check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Incluir recetas de patrón, botín o misión (no siempre están disponibles)
          </label>
        )}
        {rangeError && <p className="small" role="alert" style={{ color: 'var(--color-bad)' }}>{rangeError}</p>}
        <p className="small muted" style={{ marginBottom: 0 }}>
          Herboristería, Desuello y Pesca no aparecen: se suben recolectando, no fabricando. El objetivo por defecto es 300 (máximo de Artesano en Classic); el catálogo de Blizzard de Forever no publica el máximo.
        </p>
      </form>

      {plan.loading && applied && <Loading label="Calculando la ruta…" rows={6} />}
      {plan.error && <ErrorBox error={plan.error} onRetry={plan.reload} />}
      {d && !plan.loading && (
        <>
          <div className="kpis">
            <div className="kpi"><div className="kpi-icon"><ArrowFatLinesUp size={20} aria-hidden="true" /></div><div><div className="kpi-value">{d.from} → {d.to}</div><div className="kpi-label">{d.profession.name}</div></div></div>
            <div className="kpi"><div className={`kpi-icon ${d.incomplete ? 'warn' : 'ok'}`}><ShoppingCart size={20} aria-hidden="true" /></div><div><div className="kpi-value"><Money v={d.total} /></div><div className="kpi-label">Costo total estimado{d.incomplete ? ' (incompleto)' : ''}</div></div></div>
            <div className="kpi"><div className="kpi-icon neutral"><Info size={20} aria-hidden="true" /></div><div><div className="kpi-value"><Money v={d.materialsCost} /></div><div className="kpi-label">Materiales</div></div></div>
            <div className="kpi"><div className="kpi-icon neutral"><Info size={20} aria-hidden="true" /></div><div><div className="kpi-value"><Money v={d.trainingCost} /></div><div className="kpi-label">Aprendizaje en el instructor</div></div></div>
          </div>

          {d.incomplete && (
            <div className="alert warn" role="status">
              <Warning size={20} weight="bold" aria-hidden="true" />
              <div><strong>Hay tramos sin datos.</strong> El total no incluye esos niveles. Puedes indicar abajo el precio de los materiales que faltan (por ejemplo, lo que cobra el vendedor) o incluir recetas de patrón.</div>
            </div>
          )}

          <p className="small muted">
            Precios: la casa de subastas elegida arriba, campo «{d.priceField}», escaneo {d.priceSourceTime ? `hace ${age(hoursSince(d.priceSourceTime))} (${dt(d.priceSourceTime)})` : 'sin datos'}.
            {' '}Recetas y umbrales de dificultad: <a href={d.source.url} target="_blank" rel="noreferrer">Wowhead (WoW Forever)</a>, extraídos el {dt(d.source.fetchedAt)}.
            {' '}Probabilidad de subir en amarillo y verde: (gris − nivel) / (gris − amarillo), estimación de la comunidad. Las fabricaciones se redondean hacia arriba.
          </p>

          <div className="table-wrap">
            <table className="responsive">
              <thead>
                <tr><th>Niveles</th><th>Receta</th><th>Color</th><th className="num">Fabricaciones</th><th>Materiales</th><th className="num">Costo</th></tr>
              </thead>
              <tbody>
                {d.steps.map((s: any, i: number) => (
                  <tr key={i}>
                    <td data-label="Niveles" className="mono">{s.from} → {s.to}</td>
                    {s.recipe ? (
                      <>
                        <td data-label="Receta" className="cell-main">
                          <div className="stack">
                            <ItemLabel id={s.recipe.createsItemId} quality={s.recipe.createsQuality} px={28}
                              name={s.recipe.catalogRecipeId ? <a href={`#/receta/${s.recipe.catalogRecipeId}`}>{s.recipe.name}</a> : (s.recipe.name ?? s.recipe.nameEn)}
                              sub={<>{s.recipe.name && s.recipe.name !== s.recipe.nameEn ? `${s.recipe.nameEn} · ` : ''}{s.recipe.availability === 'inicial' ? 'se conoce al aprender la profesión' : `se aprende en ${s.recipe.learnedAt}`} ·<a href={s.recipe.wowheadUrl} target="_blank" rel="noreferrer" className="icon-inline">Wowhead<ArrowSquareOut size={12} aria-hidden="true" /></a></>} />
                            <Availability r={s.recipe} />
                          </div>
                        </td>
                        <td data-label="Color"><SkillColor c={s.colorFrom} />{s.colorTo !== s.colorFrom && <> → <SkillColor c={s.colorTo} /></>}</td>
                        <td data-label="Fabricaciones" className="num" title={`Esperadas: ${toQ(s.expectedCrafts)?.toDecimal(2) ?? '—'}`}>{String(s.crafts)}</td>
                        <td data-label="Materiales">
                          <ul className="mat-list">
                            {s.materials.map((m: any) => (
                              <li key={m.itemId}><ItemLabel id={m.itemId} quality={m.quality} px={18} href={`#/materiales/${m.itemId}`} name={m.name ?? `Objeto ${m.itemId}`} /> <span className="mono">× {String(m.quantity)}</span>{m.priceSource === 'manual' && <span className="badge b-neutral" style={{ marginLeft: 6 }}>precio manual</span>}</li>
                            ))}
                          </ul>
                        </td>
                        <td data-label="Costo" className="num"><Money v={s.cost} /></td>
                      </>
                    ) : (
                      <td colSpan={5} data-label="Sin datos" className="cell-main">
                        <div className="alert warn" style={{ margin: 0 }}>
                          <Warning size={18} aria-hidden="true" />
                          <div>
                            <strong>Sin datos.</strong> {s.reason}
                            {!!s.missingItems.length && (
                              <div className="missing-prices">
                                <span className="small">Materiales sin precio en la casa de subastas (indica uno en oro para usarlo):</span>
                                {s.missingItems.slice(0, 8).map((m: any) => (
                                  <div key={m.itemId} className="row" style={{ alignItems: 'center' }}>
                                    <ItemLabel id={m.itemId} quality={m.quality} px={18} name={m.name ?? `Objeto ${m.itemId}`} />
                                    <input type="text" inputMode="decimal" aria-label={`Precio manual en oro de ${m.name ?? `objeto ${m.itemId}`}`} placeholder="oro, p. ej. 0.05"
                                      defaultValue={manual[m.itemId] ?? ''} onBlur={(e) => setPrice(m.itemId, e.target.value)}
                                      aria-invalid={!!e2(manual[m.itemId])} style={{ width: 130 }} />
                                  </div>
                                ))}
                                {s.missingItems.length > 8 && <span className="small">… y {s.missingItems.length - 8} más.</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <h2 className="icon-inline" style={{ marginTop: 0 }}><ShoppingCart size={20} aria-hidden="true" />Lista de compra</h2>
            {!d.shopping.length ? <p className="muted">No hay materiales con precio para comprar.</p> : (
              <div className="table-wrap">
                <table className="responsive">
                  <thead><tr><th>Material</th><th className="num">Cantidad</th><th className="num">Precio unidad</th><th>Origen</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {d.shopping.map((m: any) => (
                      <tr key={m.itemId}>
                        <td data-label="Material" className="cell-main"><ItemLabel id={m.itemId} quality={m.quality} px={24} href={`#/materiales/${m.itemId}`} name={m.name ?? `Objeto ${m.itemId}`} /></td>
                        <td data-label="Cantidad" className="num">{String(m.quantity)}</td>
                        <td data-label="Precio unidad" className="num"><Money v={m.unitPrice} /></td>
                        <td data-label="Origen" className="small">{m.priceSource}</td>
                        <td data-label="Total" className="num"><Money v={m.cost} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {!!Object.keys(manual).length && (
            <section className="card">
              <h2 style={{ marginTop: 0 }}>Precios manuales</h2>
              <p className="small muted">Se guardan solo en este navegador y sustituyen al precio de la casa de subastas de ese material.</p>
              <ul className="mat-list">
                {Object.entries(manual).map(([id, v]) => (
                  <li key={id} className="row" style={{ alignItems: 'center' }}>
                    <ItemLabel id={Number(id)} px={18} quality={itemInfo(d, Number(id))?.quality} name={itemInfo(d, Number(id))?.name ?? `Objeto ${id}`} />
                    <span className="mono">{v} oro</span>{!validGold(v) && <span className="badge b-bad">inválido: no se usa</span>}
                    <button type="button" className="link danger" onClick={() => setPrice(Number(id), '')}><Trash size={14} aria-hidden="true" />Quitar</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

/** Nombre y calidad de un objeto según el plan cargado (lista de compra o materiales sin precio). */
function itemInfo(d: any, id: number): { name: string | null; quality: string | null } | null {
  const hit = d.shopping.find((m: any) => m.itemId === id)
    ?? d.steps.flatMap((s: any) => [...s.materials, ...s.missingItems]).find((m: any) => m.itemId === id);
  return hit ? { name: hit.name, quality: hit.quality } : null;
}

/** Marca un precio manual como inválido (texto no vacío que no es oro con hasta 4 decimales). */
function e2(v: string | undefined) {
  return v !== undefined && v.trim() !== '' && !validGold(v) ? 'invalid' : null;
}
