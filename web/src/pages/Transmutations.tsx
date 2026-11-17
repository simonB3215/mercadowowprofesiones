import React, { useMemo, useState } from 'react';
import { api, useApp, useAsync, Money, Delta, StatusBadge, Loading, ErrorBox, Empty, PageHead, toQ } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';
import { ItemLabel, WowIcon } from '../icons.js';
import { SupplyText } from '../PriceHistory.js';
import { cooldownLabel } from '../../../src/engine/cooldown.js';
import { Flask, Info, Hourglass, Trophy } from '@phosphor-icons/react';

const LEARN: Record<string, string> = { instructor: 'Instructor', inicial: 'Al empezar', otra: 'Receta' };

/** Página «Transmutaciones»: recetas con reutilización de todas las profesiones y cuánto oro dan al día (PT-04). */
export function Transmutations() {
  const { ctxQuery, profileId } = useApp();
  const d = useAsync(() => api(`/api/transmutations?${ctxQuery}${profileId ? `&profileId=${profileId}` : ''}`), [ctxQuery, profileId]);
  const [onlyProfit, setOnlyProfit] = useState(false);
  const [onlyKnown, setOnlyKnown] = useState(false);
  const all: any[] = d.data?.items ?? [];
  const list = useMemo(() => all.filter((i) => (!onlyProfit || toQ(i.profitPerCraft)?.sign() === 1) && (!onlyKnown || i.character === 'conoce')), [all, onlyProfit, onlyKnown]);
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const i of list) m.set(i.profession, [...(m.get(i.profession) ?? []), i]);
    return [...m.entries()];
  }, [list]);
  // Las mejores con demanda suficiente («Buena opción»), una por espera distinta.
  const best = useMemo(() => {
    const seen = new Set<number>();
    return all.filter((i) => i.status === 'candidato' && toQ(i.goldPerDay)?.sign() === 1).filter((i) => !seen.has(i.cooldown) && seen.add(i.cooldown)).slice(0, 3);
  }, [all]);

  return (
    <div>
      <PageHead title="Transmutaciones">Recetas que solo se pueden fabricar cada cierto tiempo (transmutaciones de Alquimia, Tela lunar…): cuánto dejan por fabricación y cuánto <strong>al día</strong> según su espera.</PageHead>
      <MarketStatus compact />
      {d.loading && !d.data ? <Loading rows={8} /> : d.error ? <ErrorBox error={d.error} /> : !all.length ? (
        <Empty icon={Flask}>No hay recetas con reutilización para esta versión.</Empty>
      ) : (
        <>
          {best.length > 0 && (
            <section className="card tm-best" aria-label="Las que más oro dan">
              <h2 className="icon-inline" style={{ marginTop: 0 }}><Trophy size={20} aria-hidden="true" />Las que más oro dan al día</h2>
              <div className="rd-figs">
                {best.map((i) => (
                  <a key={i.recipeId} href={`#/receta/${i.recipeId}`} className="tm-best-item">
                    <span className="icon-inline"><WowIcon id={i.output?.itemId} px={28} quality={i.output?.quality} /><strong>{i.name}</strong></span>
                    <span className="rd-fig"><Delta v={i.goldPerDay} tag={false} /> <span className="small muted">al día</span></span>
                    <span className="small muted">{toQ(i.profitPerCraft) ? <><Money v={i.profitPerCraft} /> por fabricación · </> : null}1 cada {cooldownLabel(i.cooldown)}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
          <div className="alert info icon-inline" style={{ alignItems: 'flex-start' }}>
            <Info size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
            <span className="small">{d.data.note} Las transmutaciones necesitan la <strong>Piedra filosofal</strong>. Las esperas cortas cuentan como máximo {d.data.maxCraftsPerDay} fabricaciones al día.</span>
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
                        </td>
                        <td data-label="Espera"><span className="icon-inline"><Hourglass size={14} aria-hidden="true" />{cooldownLabel(i.cooldown)}</span></td>
                        <td data-label="Costo" className="num"><Money v={i.cost} /></td>
                        <td data-label="Se vende por" className="num"><Money v={i.sellPrice} />{i.sellSupply && <div className="small"><SupplyText s={i.sellSupply} /></div>}</td>
                        <td data-label="Ganancia" className="num"><Delta v={i.profitPerCraft} /></td>
                        <td data-label="Oro al día" className="num"><strong><Delta v={i.goldPerDay} tag={false} /></strong></td>
                        <td data-label="Ventas/día" className="num">{i.demand?.soldPerDay ?? '—'}</td>
                        <td data-label="Estado"><StatusBadge s={i.status} />{i.status !== 'candidato' && i.reasons[0] && <div className="small muted">{i.reasons[0]}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <details className="card">
            <summary>¿Cómo se calcula?</summary>
            <ul className="reasons small">
              <li><strong>Ganancia</strong> por fabricación: lo que cobras al venderlo (menos la comisión de la subasta) menos lo que cuestan los materiales, con los precios de tu casa.</li>
              <li><strong>Oro al día</strong> = ganancia × fabricaciones al día (24 h ÷ espera). Una espera de 47 h permite media fabricación al día; una de 1 h, como máximo {d.data.maxCraftsPerDay}.</li>
              <li><strong>Espera</strong>: la de Wowhead para WoW Forever. Las ventas por día son de toda la región, no una garantía de que vendas lo tuyo.</li>
              <li>«Receta» quiere decir que no la enseña el instructor: hay que conseguir el objeto de receta (en el detalle se indica dónde).</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
