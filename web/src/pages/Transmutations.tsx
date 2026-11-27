import React, { useEffect, useMemo, useState } from 'react';
import { api, useApp, useAsync, Money, Delta, StatusBadge, Loading, ErrorBox, Empty, PageHead, toQ, STATUS_LABEL, type Status } from '../lib.js';
import { useListFilters, sortNum, type FilterSpec } from '../ListFilters.js';
import { useFavorites } from '../favorites.js';
import { MarketStatus } from '../MarketStatus.js';
import { ItemLabel, WowIcon } from '../icons.js';
import { SupplyText } from '../PriceHistory.js';
import { cooldownLabel } from '../../../src/engine/cooldown.js';
import { useMyCharacters } from '../myCharacters.js';
import { Flask, Info, Hourglass, Trophy, CheckCircle, ArrowCounterClockwise, Timer, Scales } from '@phosphor-icons/react';
import { t, locale } from '../i18n.js';

const LEARN: Record<string, string> = { instructor: 'Instructor', inicial: 'Al empezar', otra: 'Receta' };

// PT-08: cuándo se hizo cada receta (o grupo de espera compartida). Con Battle.net conectado se guarda con el personaje;
// si no, solo en este navegador.
const DONE_KEY = 'mw-transmutaciones-hechas';
type Done = Record<string, { at: number; cd: number; name: string }>;
function loadDone(): Done {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function saveDone(d: Done) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch { /* sin almacenamiento: solo dura esta visita */ }
}
export const slotOf = (i: any) => i.group ?? `receta:${i.recipeId}`;
/** Marcas de «La hice ahora»: del personaje elegido (en el servidor) o de este navegador. */
export function useDone() {
  const me = useMyCharacters();
  const char = me.current;
  const [done, setDone] = useState<Done>(loadDone);
  const [err, setErr] = useState<string | null>(null);
  const toDone = (list: any[]): Done => Object.fromEntries(list.map((c) => [c.slot, { at: c.at, cd: c.cd, name: c.name }]));
  const url = char ? `/api/me/characters/${char.id}/cooldowns` : '';
  useEffect(() => {
    if (!char) { setDone(loadDone()); return; }
    let on = true;
    (async () => {
      try {
        let r = await api<any>(url);
        // Las marcas que había en este navegador (aún en espera) pasan al personaje la primera vez.
        const local = loadDone();
        const server = new Set((r.cooldowns as any[]).map((c) => c.slot));
        for (const [slot, d] of Object.entries(local)) {
          if (server.has(slot) || d.at + d.cd * 1000 <= Date.now()) continue;
          r = await api<any>(url, { method: 'PUT', body: { slot, at: d.at, cooldown: d.cd, name: d.name } });
        }
        if (Object.keys(local).length) saveDone({});
        if (on) { setDone(toDone(r.cooldowns)); setErr(null); }
      } catch (e) { if (on) setErr((e as Error).message); }
    })();
    return () => { on = false; };
  }, [char?.id]);
  const mark = async (slot: string, cd: number, name: string) => {
    const at = Date.now();
    if (!char) { const n = { ...done, [slot]: { at, cd, name } }; setDone(n); saveDone(n); return; }
    try { const r = await api<any>(url, { method: 'PUT', body: { slot, at, cooldown: cd, name } }); setDone(toDone(r.cooldowns)); setErr(null); }
    catch (e) { setErr((e as Error).message); }
  };
  const clear = async (slot: string) => {
    if (!char) { const n = { ...done }; delete n[slot]; setDone(n); saveDone(n); return; }
    try { const r = await api<any>(`${url}/${encodeURIComponent(slot)}`, { method: 'DELETE' }); setDone(toDone(r.cooldowns)); setErr(null); }
    catch (e) { setErr((e as Error).message); }
  };
  return { done, mark, clear, err, me };
}

const when = (ms: number) => new Date(ms).toLocaleString(locale(), { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Disponible ya, o bloqueada hasta cuándo (y por cuál), con el botón para apuntarla. */
function Availability({ i, done, now, onDone, onClear }: { i: any; done: Done; now: number; onDone: () => void; onClear: () => void }) {
  const d = done[slotOf(i)];
  const until = d ? d.at + d.cd * 1000 : 0;
  if (d && until > now) {
    return (
      <span className="tm-avail small">
        <span className="icon-inline tm-wait"><Timer size={14} aria-hidden="true" />{t('Hasta el')}{' '}{when(until)}</span>
        {d.name !== i.name && <span className="muted">{' '}{t('(hiciste')}{' '}{d.name})</span>}
        <button type="button" className="link-button" onClick={onClear} title={t('Borrar la marca: ya está disponible')}><ArrowCounterClockwise size={14} aria-hidden="true" />{t('Ya está disponible')}</button>
      </span>
    );
  }
  return <button type="button" className="tm-done-btn" onClick={onDone}><CheckCircle size={16} aria-hidden="true" />{t('La hice ahora')}</button>;
}

/** Página «Transmutaciones»: recetas con reutilización de todas las profesiones y cuánto oro dan al día (PT-04 a PT-08). */
export function Transmutations() {
  const { ctxQuery, profileId } = useApp();
  const d = useAsync(() => api(`/api/transmutations?${ctxQuery}${profileId ? `&profileId=${profileId}` : ''}`), [ctxQuery, profileId]);
  const { done, mark: markSlot, clear: clearSlot, err: doneErr, me } = useDone();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const mark = (i: any) => { markSlot(slotOf(i), i.cooldown, i.name); setNow(Date.now()); };
  const clear = (i: any) => clearSlot(slotOf(i));

  const all: any[] = d.data?.items ?? [];
  const favs = useFavorites();
  const spec: FilterSpec<any> = {
    path: '/transmutaciones',
    name: (i) => i.name, searchExtra: (i) => i.output?.name ?? '', searchPlaceholder: 'Receta u objeto',
    profession: (i) => ({ id: i.professionId, name: i.profession }),
    status: { label: 'Estado', get: (i) => i.status, options: (Object.keys(STATUS_LABEL) as Status[]).map((s) => [s, STATUS_LABEL[s]]) },
    quality: (i) => i.output?.quality,
    defaultSort: '',
    sorts: [
      { key: 'goldPerDay', label: 'Oro al día', get: (i) => sortNum(i.goldPerDay) },
      { key: 'profit', label: 'Ganancia por fabricación', get: (i) => sortNum(i.profitPerCraft) },
      { key: 'roi', label: 'ROI', get: (i) => sortNum(i.roiPct) },
      { key: 'soldPerDay', label: 'Ventas al día (región)', get: (i) => i.demand?.soldPerDay },
      { key: 'cost', label: 'Costo', get: (i) => sortNum(i.cost) },
      { key: 'cooldown', label: 'Espera', get: (i) => i.cooldown },
      { key: 'name', label: 'Nombre', get: (i) => i.name },
    ],
    depsKey: `${favs.ids.join(',')}|${profileId ?? ''}`,
    checks: [
      { key: 'ganancia', label: 'Solo con ganancia', test: (i) => toQ(i.profitPerCraft)?.sign() === 1 },
      { key: 'conocidas', label: 'Solo recetas conocidas', test: (i) => i.character === 'conoce', disabled: !profileId, hint: ' (elige un perfil manual arriba)' },
      { key: 'vendibles', label: 'Ocultar resultados no vendibles', test: (i) => i.status !== 'no_vendible' },
      { key: 'favoritas', label: 'Solo favoritas', test: (i) => favs.ids.includes(i.recipeId) },
    ],
  };
  const { list, ui: filtersUi } = useListFilters(all, spec);
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const i of list) m.set(i.profession, [...(m.get(i.profession) ?? []), i]);
    return [...m.entries()];
  }, [list]);
  const byId = useMemo(() => new Map(all.map((i) => [i.recipeId, i])), [all]);
  const plan: any[] = d.data?.plan ?? [];

  return (
    <div>
      <PageHead title={t('Transmutaciones')}>{t('Recetas que solo se pueden fabricar cada cierto tiempo (transmutaciones de Alquimia, Tela lunar…): cuánto dejan por fabricación y cuánto')}{' '}<strong>{t('al día')}</strong>{' '}{t('según su espera.')}</PageHead>
      <MarketStatus compact />
      {d.loading && !d.data ? <Loading rows={8} /> : d.error ? <ErrorBox error={d.error} /> : !all.length ? (
        <Empty icon={Flask}>{t('No hay recetas con reutilización para esta versión.')}</Empty>
      ) : (
        <>
          {plan.length > 0 && (
            <section className="card tm-best" aria-label={t('Qué hacer')}>
              <h2 className="icon-inline" style={{ marginTop: 0 }}><Trophy size={20} aria-hidden="true" />{t('Qué hacer para sacar más oro')}</h2>
              <p className="small muted" style={{ marginTop: 0 }}>{t('La mejor de cada espera. Se pueden hacer a la vez: juntas dan')}{' '}<strong><Delta v={d.data.planTotal} tag={false} />{' '}{t('al día')}</strong>.
              </p>
              <div className="rd-figs">
                {plan.map((p) => {
                  const i = byId.get(p.recipeId);
                  return (
                    <div key={p.recipeId} className="tm-best-item">
                      <a href={`#/receta/${p.recipeId}`} className="icon-inline"><WowIcon id={p.output?.itemId} px={28} quality={p.output?.quality} /><strong>{p.name}</strong></a>
                      <span className="rd-fig"><Delta v={p.goldPerDay} tag={false} /> <span className="small muted">{t('al día')}</span></span>
                      <span className="small muted"><Money v={p.profitPerCraft} />{' '}{t('por fabricación · 1 cada')}{' '}{cooldownLabel(p.cooldown)}{p.group ? t(' · ocupa la espera de las transmutaciones') : ''}</span>
                      {i && <Availability i={i} done={done} now={now} onDone={() => mark(i)} onClear={() => clear(i)} />}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <div className="alert info icon-inline" style={{ alignItems: 'flex-start' }}>
            <Info size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
            <span className="small">{d.data.note}{' '}{t('Necesitan la')}{' '}<strong>{t('Piedra filosofal')}</strong>{t('. Las esperas cortas cuentan como máximo')}{' '}{d.data.maxCraftsPerDay}{' '}{t('fabricaciones al día.')}{' '}{me.current ? <>{t('«La hice ahora» se guarda con')}{' '}<strong>{me.current.name}</strong>{' '}{t('(Battle.net): lo verás en cualquier equipo.')}</> : <>{t('«La hice ahora» se guarda solo en este navegador;')}{' '}<a href="#/personaje">{t('conecta Battle.net')}</a>{' '}{t('para guardarlo con tu personaje.')}</>}</span>
          </div>
          {me.characters.length > 1 && (
            <label className="field tm-char">{t('Personaje')}<select value={me.current?.id ?? ''} onChange={(e) => me.choose(e.target.value)}>
                {me.characters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.level ? ` (nivel ${c.level})` : ''}</option>)}
              </select>
            </label>
          )}
          {doneErr && <p className="small lv-error" role="alert">{t('No se pudo guardar con el personaje:')}{' '}{doneErr}</p>}
          {filtersUi}
          {!list.length ? <Empty icon={Flask}>{t('Ninguna receta cumple los filtros.')}</Empty> : groups.map(([prof, items]) => (
            <section key={prof} className="card">
              <h2 className="icon-inline" style={{ marginTop: 0 }}><WowIcon kind="profession" id={items[0].professionId} px={22} />{prof}</h2>
              <div className="table-wrap">
                <table className="responsive">
                  <caption className="sr-only">{prof}{t(': recetas con reutilización, ganancia por fabricación y oro al día')}</caption>
                  <thead><tr><th>{t('Receta')}</th><th>{t('Espera')}</th><th className="num">{t('Costo')}</th><th className="num">{t('Se vende por')}</th><th className="num">{t('Ganancia')}</th><th className="num">{t('Oro al día')}</th><th className="num">{t('Ventas/día')}</th><th>{t('Estado')}</th></tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.recipeId} className={toQ(i.profitPerCraft)?.sign() === -1 ? 'tm-loss' : ''}>
                        <td data-label={t('Receta')} className="cell-main">
                          <ItemLabel id={i.output?.itemId} quality={i.output?.quality} href={`#/receta/${i.recipeId}`} name={i.name}
                            sub={<>{LEARN[i.learn.availability] ?? ''}{i.learn.learnedAt > 1 ? ` · nivel ${i.learn.learnedAt}` : ''}{i.unitsPerRun > 1 ? ` · ${t('{n} por fabricación', { n: i.unitsPerRun })}` : ''}{i.character === 'conoce' ? t(' · la conoces') : ''}</>} />
                          {i.bestInGroup && <span className="badge b-ok" style={{ marginTop: 4 }}><Trophy size={12} aria-hidden="true" />{i.group ? t('La mejor transmutación') : t('Recomendada')}</span>}
                        </td>
                        <td data-label={t('Espera')}>
                          <span className="icon-inline"><Hourglass size={14} aria-hidden="true" />{cooldownLabel(i.cooldown)}</span>
                          {i.group && <div className="small muted">{t('compartida')}</div>}
                          <Availability i={i} done={done} now={now} onDone={() => mark(i)} onClear={() => clear(i)} />
                        </td>
                        <td data-label={t('Costo')} className="num"><Money v={i.cost} /></td>
                        <td data-label={t('Se vende por')} className="num"><Money v={i.sellPrice} />{i.sellSupply && <div className="small"><SupplyText s={i.sellSupply} /></div>}</td>
                        <td data-label={t('Ganancia')} className="num"><Delta v={i.profitPerCraft} /></td>
                        <td data-label={t('Oro al día')} className="num"><strong><Delta v={i.goldPerDay} tag={false} /></strong></td>
                        <td data-label={t('Ventas/día')} className="num">{i.demand?.soldPerDay ?? '—'}{i.daysPerSale && <div className="small lv-error">{t('se vende 1 cada')}{' '}{Number(i.daysPerSale).toLocaleString(locale())}{' '}{t('días')}</div>}</td>
                        <td data-label={t('Estado')}><StatusBadge s={i.status} />{i.status !== 'candidato' && i.reasons[0] && <div className="small muted">{i.reasons[0]}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {d.data.buyOrMake?.length > 0 && (
            <section className="card">
              <h2 className="icon-inline" style={{ marginTop: 0 }}><Scales size={20} aria-hidden="true" />{t('¿Lo necesitas para ti? Comprarlo o transmutarlo')}</h2>
              <p className="small muted" style={{ marginTop: 0 }}>{t('Precio por unidad en tu casa frente a lo que cuesta hacerlo con la receta más barata. Recuerda que transmutarlo ocupa la espera.')}</p>
              <div className="table-wrap">
                <table className="responsive">
                  <thead><tr><th>{t('Objeto')}</th><th className="num">{t('Comprarlo')}</th><th className="num">{t('Hacerlo')}</th><th>{t('Mejor')}</th></tr></thead>
                  <tbody>
                    {d.data.buyOrMake.map((b: any) => (
                      <tr key={b.itemId}>
                        <td data-label={t('Objeto')} className="cell-main"><ItemLabel id={b.itemId} name={b.name ?? t('Objeto {id}', { id: b.itemId })} quality={b.quality} sub={b.via ? `con «${b.via.name}»` : undefined} /></td>
                        <td data-label={t('Comprarlo')} className="num"><Money v={b.buyUnit} /></td>
                        <td data-label={t('Hacerlo')} className="num"><Money v={b.makeUnit} /></td>
                        <td data-label={t('Mejor')}>
                          <strong>{b.verdict === 'fabricar' ? (b.via?.group ? t('Transmutarlo') : t('Hacerlo')) : b.verdict === 'comprar' ? t('Comprarlo') : b.verdict === 'igual' ? t('Da igual') : t('Sin datos')}</strong>
                          {b.savings && (b.verdict === 'fabricar' || b.verdict === 'comprar') && <span className="small muted">{' '}{t('· ahorras')}{' '}<Money v={b.savings} /></span>}
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
                <span className="small muted">{t('· Peletería')}</span>
              </h2>
              <p className="small" style={{ marginTop: 0 }}>{t('Un objeto que convierte')}{' '}<ItemLabel id={u.input.itemId} quality={u.input.quality} px={18} name={u.input.name ?? t('Objeto {id}', { id: u.input.itemId })} />{' '}{t('en')}{' '}<ItemLabel id={u.output.itemId} quality={u.output.quality} px={18} name={u.output.name ?? t('Objeto {id}', { id: u.output.itemId })} />,
                {' '}{t('una vez cada')}{' '}{cooldownLabel(u.cooldown)}{t('. Necesitas')}{' '}{u.requires.profession} {u.requires.skill}{t('; el salero lo fabrica')}{' '}{u.madeBy.profession}
                {u.device.buyPrice && <>{' '}{t('(en tu casa,')}{' '}<Money v={u.device.buyPrice} />)</>}{t('. Su espera es aparte: no ocupa la de las transmutaciones.')}</p>
              <div className="table-wrap">
                <table className="responsive">
                  <thead><tr><th className="num">{t('Compras la sal')}</th><th className="num">{t('Vendes la refinada')}</th><th className="num">{t('Margen por unidad')}</th><th className="num">{t('Ventas/día')}</th><th>{t('Disponible')}</th></tr></thead>
                  <tbody>
                    <tr>
                      <td data-label={t('Compras la sal')} className="num"><Money v={u.input.buyPrice} /></td>
                      <td data-label={t('Vendes la refinada')} className="num"><Money v={u.output.sellNet} /><span className="lv-unit">{t('sin la comisión')}</span></td>
                      <td data-label={t('Margen por unidad')} className="num"><Delta v={u.marginPerUnit} /></td>
                      <td data-label={t('Ventas/día')} className="num">{u.soldPerDay ?? '—'}{u.soldPerDay !== null && u.soldPerDay < 1 && u.soldPerDay > 0 && <span className="lv-unit lv-error">{t('se vende 1 cada')}{' '}{(Math.round(10 / u.soldPerDay) / 10).toLocaleString(locale())}{' '}{t('días')}</span>}</td>
                      <td data-label={t('Disponible')}>{(() => { const i = { group: `uso:${u.key}`, name: u.device.name ?? u.nameEn, cooldown: u.cooldown }; return <Availability i={i} done={done} now={now} onDone={() => mark(i)} onClear={() => clear(i)} />; })()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                {toQ(u.minGoldPerDay)?.sign() === 1 && <><strong>{t('Al menos')}{' '}<Money v={u.minGoldPerDay} />{' '}{t('al día')}</strong>{' '}{t('si cada uso da una sola.')}{' '}</>}
                <Info size={14} aria-hidden="true" />{' '}{t('Wowhead no dice cuántas sales refinadas da cada uso, así que no se suma arriba con las demás.')}{' '}<a href={u.wowheadUrl} target="_blank" rel="noreferrer">{t('Ver en Wowhead')}</a>.
              </p>
            </section>
          ))}
          <details className="card">
            <summary>{t('¿Cómo se calcula?')}</summary>
            <ul className="reasons small">
              <li><strong>{t('Ganancia')}</strong>{' '}{t('por fabricación: lo que cobras al venderlo (menos la comisión de la subasta) menos lo que cuestan los materiales, con los precios de tu casa.')}</li>
              <li><strong>{t('Oro al día')}</strong>{' '}{t('= ganancia × fabricaciones al día (24 h ÷ espera). Una espera de 47 h permite media fabricación al día; una de 1 h, como máximo')}{' '}{d.data.maxCraftsPerDay}.</li>
              <li><strong>{t('Espera compartida')}</strong>{t(': todas las transmutaciones usan la misma; por eso se recomienda una sola, la que más oro da al día (con ventas suficientes). Las demás recetas con espera (Tela lunar) van por su cuenta y se suman.')}</li>
              <li><strong>{t('Ventas')}</strong>{t(': son de toda la región, no una garantía de que vendas lo tuyo. Si se vende menos de una al día se indica cada cuántos días se vende una.')}</li>
              <li>{t('«Receta» quiere decir que no la enseña el instructor: hay que conseguir el objeto de receta (en el detalle se indica dónde).')}</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
