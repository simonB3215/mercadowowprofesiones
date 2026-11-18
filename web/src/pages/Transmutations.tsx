import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, Money, Delta, StatusBadge, Loading, ErrorBox, Empty, PageHead, toQ } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';
import { ItemLabel, WowIcon } from '../icons.js';
import { SupplyText } from '../PriceHistory.js';
import { cooldownLabel } from '../../../src/engine/cooldown.js';
import { Flask, Info, Hourglass, Trophy, CheckCircle, ArrowCounterClockwise, Timer, Scales } from '@phosphor-icons/react';

const LEARN: Record<string, string> = { instructor: 'Instructor', inicial: 'Al empezar', otra: 'Receta' };

// PT-08: cuándo se hizo cada receta (o grupo de espera compartida), guardado solo en este navegador.
const DONE_KEY = 'mw-transmutaciones-hechas';
type Done = Record<string, { at: number; cd: number; name: string }>;
function loadDone(): Done {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function saveDone(d: Done) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch { /* sin almacenamiento: solo dura esta visita */ }
}
const slotOf = (i: any) => i.group ?? `receta:${i.recipeId}`;
const when = (ms: number) => new Date(ms).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Disponible ya, o bloqueada hasta cuándo (y por cuál), con el botón para apuntarla. */
function Availability({ i, done, now, onDone, onClear }: { i: any; done: Done; now: number; onDone: () => void; onClear: () => void }) {
  const d = done[slotOf(i)];
  const until = d ? d.at + d.cd * 1000 : 0;
  if (d && until > now) {
    return (
      <span className="tm-avail small">
        <span className="icon-inline tm-wait"><Timer size={14} aria-hidden="true" />Hasta el {when(until)}</span>
        {d.name !== i.name && <span className="muted"> (hiciste {d.name})</span>}
        <button type="button" className="link-button" onClick={onClear} title="Borrar la marca: ya está disponible"><ArrowCounterClockwise size={14} aria-hidden="true" />Ya está disponible</button>
      </span>
    );
  }
  return <button type="button" className="tm-done-btn" onClick={onDone}><CheckCircle size={16} aria-hidden="true" />La hice ahora</button>;
}

/** Página «Transmutaciones»: recetas con reutilización de todas las profesiones y cuánto oro dan al día (PT-04 a PT-08). */
export function Transmutations() {
  const { ctxQuery, profileId } = useApp();
  const d = useAsync(() => api(`/api/transmutations?${ctxQuery}${profileId ? `&profileId=${profileId}` : ''}`), [ctxQuery, profileId]);
  const [onlyProfit, setOnlyProfit] = useState(false);
  const [onlyKnown, setOnlyKnown] = useState(false);
  const [done, setDone] = useState<Done>(loadDone);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const mark = (i: any) => { const n = { ...done, [slotOf(i)]: { at: Date.now(), cd: i.cooldown, name: i.name } }; setDone(n); saveDone(n); setNow(Date.now()); };
  const clear = (i: any) => { const n = { ...done }; delete n[slotOf(i)]; setDone(n); saveDone(n); };

  const all: any[] = d.data?.items ?? [];
  const list = useMemo(() => all.filter((i) => (!onlyProfit || toQ(i.profitPerCraft)?.sign() === 1) && (!onlyKnown || i.character === 'conoce')), [all, onlyProfit, onlyKnown]);
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const i of list) m.set(i.profession, [...(m.get(i.profession) ?? []), i]);
    return [...m.entries()];
  }, [list]);
  const byId = useMemo(() => new Map(all.map((i) => [i.recipeId, i])), [all]);
  const plan: any[] = d.data?.plan ?? [];

  return (
    <div>
      <PageHead title="Transmutaciones">Recetas que solo se pueden fabricar cada cierto tiempo (transmutaciones de Alquimia, Tela lunar…): cuánto dejan por fabricación y cuánto <strong>al día</strong> según su espera.</PageHead>
      <MarketStatus compact />
      {d.loading && !d.data ? <Loading rows={8} /> : d.error ? <ErrorBox error={d.error} /> : !all.length ? (
        <Empty icon={Flask}>No hay recetas con reutilización para esta versión.</Empty>
      ) : (
        <>
          {plan.length > 0 && (
            <section className="card tm-best" aria-label="Qué hacer">
              <h2 className="icon-inline" style={{ marginTop: 0 }}><Trophy size={20} aria-hidden="true" />Qué hacer para sacar más oro</h2>
              <p className="small muted" style={{ marginTop: 0 }}>
                La mejor de cada espera. Se pueden hacer a la vez: juntas dan <strong><Delta v={d.data.planTotal} tag={false} /> al día</strong>.
              </p>
              <div className="rd-figs">
                {plan.map((p) => {
                  const i = byId.get(p.recipeId);
                  return (
                    <div key={p.recipeId} className="tm-best-item">
                      <a href={`#/receta/${p.recipeId}`} className="icon-inline"><WowIcon id={p.output?.itemId} px={28} quality={p.output?.quality} /><strong>{p.name}</strong></a>
                      <span className="rd-fig"><Delta v={p.goldPerDay} tag={false} /> <span className="small muted">al día</span></span>
                      <span className="small muted"><Money v={p.profitPerCraft} /> por fabricación · 1 cada {cooldownLabel(p.cooldown)}{p.group ? ' · ocupa la espera de las transmutaciones' : ''}</span>
                      {i && <Availability i={i} done={done} now={now} onDone={() => mark(i)} onClear={() => clear(i)} />}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <div className="alert info icon-inline" style={{ alignItems: 'flex-start' }}>
            <Info size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
            <span className="small">{d.data.note} Necesitan la <strong>Piedra filosofal</strong>. Las esperas cortas cuentan como máximo {d.data.maxCraftsPerDay} fabricaciones al día. «La hice ahora» se guarda solo en este navegador.</span>
          </div>
          <div className="row" style={{ margin: '8px 0' }}>
            <label className="check"><input type="checkbox" checked={onlyProfit} onChange={(e) => setOnlyProfit(e.target.checked)} />Solo con ganancia</label>
            {profileId && <label className="check"><input type="checkbox" checked={onlyKnown} onChange={(e) => setOnlyKnown(e.target.checked)} />Solo las que conoce el perfil</label>}
          </div>
          {!list.length ? <Empty icon={Flask}>Ninguna receta cumple los filtros.</Empty> : groups.map(([prof, items]) => (
            <section key={prof} className="card">
              <h2 className="icon-inline" style={{ marginTop: 0 }}><WowIcon kind="profession" id={items[0].professionId} px={22} />{prof}</h2>
              <div className="table-wrap">
                <table className="responsive">
                  <caption className="sr-only">{prof}: recetas con reutilización, ganancia por fabricación y oro al día</caption>
                  <thead><tr><th>Receta</th><th>Espera</th><th className="num">Costo</th><th className="num">Se vende por</th><th className="num">Ganancia</th><th className="num">Oro al día</th><th className="num">Ventas/día</th><th>Estado</th></tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.recipeId} className={toQ(i.profitPerCraft)?.sign() === -1 ? 'tm-loss' : ''}>
                        <td data-label="Receta" className="cell-main">
                          <ItemLabel id={i.output?.itemId} quality={i.output?.quality} href={`#/receta/${i.recipeId}`} name={i.name}
                            sub={<>{LEARN[i.learn.availability] ?? ''}{i.learn.learnedAt > 1 ? ` · nivel ${i.learn.learnedAt}` : ''}{i.unitsPerRun > 1 ? ` · ${i.unitsPerRun} por fabricación` : ''}{i.character === 'conoce' ? ' · la conoces' : ''}</>} />
                          {i.bestInGroup && <span className="badge b-ok" style={{ marginTop: 4 }}><Trophy size={12} aria-hidden="true" />{i.group ? 'La mejor transmutación' : 'Recomendada'}</span>}
                        </td>
                        <td data-label="Espera">
                          <span className="icon-inline"><Hourglass size={14} aria-hidden="true" />{cooldownLabel(i.cooldown)}</span>
                          {i.group && <div className="small muted">compartida</div>}
                          <Availability i={i} done={done} now={now} onDone={() => mark(i)} onClear={() => clear(i)} />
                        </td>
                        <td data-label="Costo" className="num"><Money v={i.cost} /></td>
                        <td data-label="Se vende por" className="num"><Money v={i.sellPrice} />{i.sellSupply && <div className="small"><SupplyText s={i.sellSupply} /></div>}</td>
                        <td data-label="Ganancia" className="num"><Delta v={i.profitPerCraft} /></td>
                        <td data-label="Oro al día" className="num"><strong><Delta v={i.goldPerDay} tag={false} /></strong></td>
                        <td data-label="Ventas/día" className="num">{i.demand?.soldPerDay ?? '—'}{i.daysPerSale && <div className="small lv-error">se vende 1 cada {String(i.daysPerSale).replace('.', ',')} días</div>}</td>
                        <td data-label="Estado"><StatusBadge s={i.status} />{i.status !== 'candidato' && i.reasons[0] && <div className="small muted">{i.reasons[0]}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {d.data.buyOrMake?.length > 0 && (
            <section className="card">
              <h2 className="icon-inline" style={{ marginTop: 0 }}><Scales size={20} aria-hidden="true" />¿Lo necesitas para ti? Comprarlo o transmutarlo</h2>
              <p className="small muted" style={{ marginTop: 0 }}>Precio por unidad en tu casa frente a lo que cuesta hacerlo con la receta más barata. Recuerda que transmutarlo ocupa la espera.</p>
              <div className="table-wrap">
                <table className="responsive">
                  <thead><tr><th>Objeto</th><th className="num">Comprarlo</th><th className="num">Hacerlo</th><th>Mejor</th></tr></thead>
                  <tbody>
                    {d.data.buyOrMake.map((b: any) => (
                      <tr key={b.itemId}>
                        <td data-label="Objeto" className="cell-main"><ItemLabel id={b.itemId} name={b.name ?? `Objeto ${b.itemId}`} quality={b.quality} sub={b.via ? `con «${b.via.name}»` : undefined} /></td>
                        <td data-label="Comprarlo" className="num"><Money v={b.buyUnit} /></td>
                        <td data-label="Hacerlo" className="num"><Money v={b.makeUnit} /></td>
                        <td data-label="Mejor">
                          <strong>{b.verdict === 'fabricar' ? (b.via?.group ? 'Transmutarlo' : 'Hacerlo') : b.verdict === 'comprar' ? 'Comprarlo' : b.verdict === 'igual' ? 'Da igual' : 'Sin datos'}</strong>
                          {b.savings && (b.verdict === 'fabricar' || b.verdict === 'comprar') && <span className="small muted"> · ahorras <Money v={b.savings} /></span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {d.data.itemUses?.map((u: any) => (
            <section key={u.key} className="card" aria-label={u.device.name ?? u.nameEn}>
              <h2 className="icon-inline" style={{ marginTop: 0 }}>
                <ItemLabel id={u.device.itemId} quality={u.device.quality} px={24} href={`#/materiales/${u.device.itemId}`} name={u.device.name ?? u.nameEn} />
                <span className="small muted">· Peletería</span>
              </h2>
              <p className="small" style={{ marginTop: 0 }}>
                Un objeto que convierte <ItemLabel id={u.input.itemId} quality={u.input.quality} px={18} name={u.input.name ?? `Objeto ${u.input.itemId}`} /> en <ItemLabel id={u.output.itemId} quality={u.output.quality} px={18} name={u.output.name ?? `Objeto ${u.output.itemId}`} />,
                {' '}una vez cada {cooldownLabel(u.cooldown)}. Necesitas {u.requires.profession} {u.requires.skill}; el salero lo fabrica {u.madeBy.profession}
                {u.device.buyPrice && <> (en tu casa, <Money v={u.device.buyPrice} />)</>}. Su espera es aparte: no ocupa la de las transmutaciones.
              </p>
              <div className="table-wrap">
                <table className="responsive">
                  <thead><tr><th className="num">Compras la sal</th><th className="num">Vendes la refinada</th><th className="num">Margen por unidad</th><th className="num">Ventas/día</th><th>Disponible</th></tr></thead>
                  <tbody>
                    <tr>
                      <td data-label="Compras la sal" className="num"><Money v={u.input.buyPrice} /></td>
                      <td data-label="Vendes la refinada" className="num"><Money v={u.output.sellNet} /><span className="lv-unit">sin la comisión</span></td>
                      <td data-label="Margen por unidad" className="num"><Delta v={u.marginPerUnit} /></td>
                      <td data-label="Ventas/día" className="num">{u.soldPerDay ?? '—'}{u.soldPerDay !== null && u.soldPerDay < 1 && u.soldPerDay > 0 && <span className="lv-unit lv-error">se vende 1 cada {(Math.round(10 / u.soldPerDay) / 10).toLocaleString('es')} días</span>}</td>
                      <td data-label="Disponible">{(() => { const i = { group: `uso:${u.key}`, name: u.device.name ?? u.nameEn, cooldown: u.cooldown }; return <Availability i={i} done={done} now={now} onDone={() => mark(i)} onClear={() => clear(i)} />; })()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                {toQ(u.minGoldPerDay)?.sign() === 1 && <><strong>Al menos <Money v={u.minGoldPerDay} /> al día</strong> si cada uso da una sola. </>}
                <Info size={14} aria-hidden="true" /> Wowhead no dice cuántas sales refinadas da cada uso, así que no se suma arriba con las demás. <a href={u.wowheadUrl} target="_blank" rel="noreferrer">Ver en Wowhead</a>.
              </p>
            </section>
          ))}
          <details className="card">
            <summary>¿Cómo se calcula?</summary>
            <ul className="reasons small">
              <li><strong>Ganancia</strong> por fabricación: lo que cobras al venderlo (menos la comisión de la subasta) menos lo que cuestan los materiales, con los precios de tu casa.</li>
              <li><strong>Oro al día</strong> = ganancia × fabricaciones al día (24 h ÷ espera). Una espera de 47 h permite media fabricación al día; una de 1 h, como máximo {d.data.maxCraftsPerDay}.</li>
              <li><strong>Espera compartida</strong>: todas las transmutaciones usan la misma; por eso se recomienda una sola, la que más oro da al día (con ventas suficientes). Las demás recetas con espera (Tela lunar) van por su cuenta y se suman.</li>
              <li><strong>Ventas</strong>: son de toda la región, no una garantía de que vendas lo tuyo. Si se vende menos de una al día se indica cada cuántos días se vende una.</li>
              <li>«Receta» quiere decir que no la enseña el instructor: hay que conseguir el objeto de receta (en el detalle se indica dónde).</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
