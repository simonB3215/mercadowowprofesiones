/**
 * «¿Comprarlo o fabricarlo?»: para un objeto que quieres usar (no vender), qué sale más barato.
 * Se usa en el detalle de receta y en la página «Comprar o fabricar».
 */
import React, { useEffect, useState } from 'react';
import { api, useApp, useAsync, Money, Loading, ErrorBox, priceSource, toQ } from './lib.js';
import { ItemLabel, WowIcon } from './icons.js';
import { SupplyText } from './PriceHistory.js';
import { Hammer, ShoppingCart, Equals, Question, Lock } from '@phosphor-icons/react';
import { t } from './i18n.js';

const VERDICT: Record<string, { label: string; tone: string; Icon: typeof Hammer }> = {
  fabricar: { label: 'Fabrícalo', tone: 'ok', Icon: Hammer },
  comprar: { label: 'Cómpralo', tone: 'info', Icon: ShoppingCart },
  igual: { label: 'Da igual', tone: 'neutral', Icon: Equals },
  solo_fabricar: { label: 'Solo se puede fabricar', tone: 'warn', Icon: Lock },
  sin_datos: { label: 'Sin datos', tone: 'neutral', Icon: Question },
};

const LEARN_FROM: Record<string, string> = {
  instructor: 'el instructor la enseña por',
  vendedor: 'la receta se compra al vendedor por',
  subasta: 'la receta cuesta en la subasta',
  inicial: 'se aprende al empezar la profesión (gratis)',
};

const pctText = (j: any) => { const q = toQ(j); return q ? `${Math.round(q.toNumber())} %` : ''; };

/** Resultado de una receta: veredicto, las dos cifras y el porqué. */
export function BuyOrCraftResult({ o, showRecipe }: { o: any; showRecipe?: boolean }) {
  const v = VERDICT[o.verdict] ?? VERDICT.sin_datos;
  const n = o.quantity;
  const u = n === 1 ? '' : ` (${n} unidades)`;
  const learn = o.learn;
  return (
    <div className="boc">
      {showRecipe && <p className="small muted icon-inline" style={{ margin: '0 0 6px' }}><WowIcon kind="profession" id={o.professionId} px={16} />{o.profession} · <a href={`#/receta/${o.recipeId}`}>{o.name}</a></p>}
      <div className={`boc-verdict t-${v.tone}`}>
        <v.Icon size={22} weight="bold" aria-hidden="true" />
        <strong>{t(v.label)}{o.savings && o.verdict !== 'sin_datos' && o.verdict !== 'solo_fabricar' ? ':' : ''}</strong>
        {o.savings && (o.verdict === 'fabricar' || o.verdict === 'comprar') && <span>{t('te ahorras')}{' '}<Money v={o.savings} />{u} <span className="small">({pctText(o.savingsPct)})</span></span>}
        {o.verdict === 'igual' && o.savings && <span>{t('solo')}{' '}<Money v={o.savings} />{' '}{t('de diferencia')}</span>}
      </div>
      <div className="rd-figs boc-figs">
        <div className={o.verdict === 'comprar' ? 'boc-best' : ''}>
          <span className="rd-fig-label"><ShoppingCart size={16} aria-hidden="true" />{t('Comprarlo')}{u}</span>
          <span className="rd-fig">{o.verdict === 'solo_fabricar' ? t('no se puede') : <Money v={o.buyTotal} />}</span>
          <span className="small muted">
            {o.buyUnit ? <><Money v={o.buyUnit} />{' '}{t('/unid. ·')}{' '}{priceSource(o.buyField, o.buyScope)}</> : o.verdict === 'solo_fabricar' ? t('se liga al recogerlo') : t('sin precio en la subasta')}
            {o.cheapestNow && o.buyUnit && toQ(o.cheapestNow)!.cmp(toQ(o.buyUnit)!) < 0 && <><br />{t('el más barato publicado ahora:')}{' '}<Money v={o.cheapestNow} /></>}
          </span>
          {o.buySupply && <span className="small"><SupplyText s={o.buySupply} /></span>}
        </div>
        <div className={o.verdict === 'fabricar' || o.verdict === 'solo_fabricar' ? 'boc-best' : ''}>
          <span className="rd-fig-label"><Hammer size={16} aria-hidden="true" />{t('Fabricarlo')}{u}</span>
          <span className="rd-fig"><Money v={o.craftTotal} /></span>
          <span className="small muted">
            {o.craftUnit ? <><Money v={o.craftUnit} />{' '}{t('/unid. en materiales')}</> : t('falta el precio de algún material')}
            {o.needsLearning && learn?.cost && toQ(learn.cost)!.sign() > 0 && <><br />+ <Money v={learn.cost} />{' '}{t('por la receta')}</>}
          </span>
        </div>
      </div>
      {o.reasons.length > 0 && <ul className="reasons small">{o.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>}
      {learn && (
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          <strong>{t('La receta:')}</strong> {learn.from ? <>{t(LEARN_FROM[learn.from])} {learn.from !== 'inicial' && <Money v={learn.cost} />}</> : t('no se sabe cuánto cuesta conseguirla')}
          {learn.learnedAt > 1 && <>{' '}{t('· nivel')}{' '}{learn.learnedAt}</>}
          {o.character === 'conoce' ? t(' · ya la conoces (perfil)') : o.needsLearning ? t(' · tu perfil no la tiene: se suma a fabricar') : t(' · elige un perfil para saber si ya la tienes')}
          {!o.needsLearning && o.character !== 'conoce' && o.breakEvenQty && learn.cost && toQ(learn.cost)!.sign() > 0 && <>{t('. Si no la tienes, comprarla compensa a partir de')}{' '}{o.breakEvenQty}{' '}{t('unidades')}</>}
          .
        </p>
      )}
      {o.materials?.length > 0 && (
        <details className="small" style={{ marginTop: 6 }}>
          <summary>{t('Materiales por fabricación')}</summary>
          <ul className="reasons">
            {o.materials.map((m: any) => (
              <li key={m.itemId} className="icon-inline">
                <ItemLabel id={m.itemId} name={`${m.quantity ?? '?'} × ${m.name ?? t('Objeto {id}', { id: m.itemId })}`} px={18} />
                <span className="muted">· {m.choice === 'fabricar' ? t('fabricado') : m.choice === 'comprar' ? t('comprado') : t('sin precio')} a <Money v={m.unitCost} />{' '}{t('/unid.')}{m.owned > 0 ? ` · ${t('tienes {n} (cuentan a precio de mercado)', { n: m.owned })}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function QuantityInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <label className="field" style={{ maxWidth: 140 }}>{t('Cuántas necesitas')}<input type="number" min={1} max={10000} step={1} value={text}
        onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 10000) onChange(n); }} />
    </label>
  );
}

/** Bloque del detalle de receta. */
export function BuyOrCraftCard({ recipeId }: { recipeId: number }) {
  const { ctxQuery, profileId } = useApp();
  const [qty, setQty] = useState(1);
  const [q, setQ] = useState(1);
  useEffect(() => { const t = setTimeout(() => setQ(qty), 300); return () => clearTimeout(t); }, [qty]);
  const d = useAsync(() => api(`/api/buy-or-craft?${ctxQuery}&recipeId=${recipeId}&qty=${q}${profileId ? `&profileId=${profileId}` : ''}`), [recipeId, ctxQuery, profileId, q]);
  return (
    <section className="card" aria-label={t('¿Comprarlo o fabricarlo?')}>
      <h2 style={{ marginTop: 0 }}>{t('¿Comprarlo o fabricarlo?')}</h2>
      <p className="small muted">{t('Si lo quieres para usarlo tú: qué te sale más barato, comprarlo en la subasta o fabricarlo.')}</p>
      <QuantityInput value={qty} onChange={setQty} />
      {d.loading && !d.data ? <Loading rows={2} /> : d.error ? <ErrorBox error={d.error} /> : d.data?.options[0] ? <BuyOrCraftResult o={d.data.options[0]} /> : null}
    </section>
  );
}
