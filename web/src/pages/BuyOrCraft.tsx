import React, { useEffect, useState } from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, Empty, PageHead, hashQuery, setHashQuery } from '../lib.js';
import { ItemPicker } from '../ItemPicker.js';
import { ItemLabel } from '../icons.js';
import { BuyOrCraftResult, QuantityInput } from '../BuyOrCraft.js';
import { Scales } from '@phosphor-icons/react';
import { t } from '../i18n.js';

/** Página «Comprar o fabricar»: eliges un objeto y cuántas unidades, y te dice qué sale más barato. */
export function BuyOrCraft() {
  const { ctxQuery, profileId } = useApp();
  const init = hashQuery();
  const [item, setItem] = useState<{ id: number; name: string } | null>(init.get('item') ? { id: Number(init.get('item')), name: init.get('nombre') ?? t('Objeto {id}', { id: init.get('item') ?? '' }) } : null);
  const [qty, setQty] = useState(Math.max(1, Number(init.get('qty')) || 1));
  const [q, setQ] = useState(qty);
  useEffect(() => { const t = setTimeout(() => setQ(qty), 300); return () => clearTimeout(t); }, [qty]);
  useEffect(() => {
    const h = new URLSearchParams();
    if (item) { h.set('item', String(item.id)); h.set('nombre', item.name); }
    if (q !== 1) h.set('qty', String(q));
    setHashQuery('/comprar', h);
  }, [item?.id, q]);
  const d = useAsync(() => (item ? api(`/api/buy-or-craft?${ctxQuery}&itemId=${item.id}&qty=${q}${profileId ? `&profileId=${profileId}` : ''}`) : Promise.resolve(null)), [item?.id, q, ctxQuery, profileId]);
  const opts: any[] = d.data?.options ?? [];
  return (
    <div>
      <PageHead title={t('Comprar o fabricar')}>{t('¿Necesitas pociones, comida u otro objeto para usarlo tú? Elige cuál y cuántas, y te decimos si sale más barato comprarlo en la subasta o fabricarlo.')}</PageHead>
      <div className="card row" style={{ alignItems: 'flex-end' }}>
        <ItemPicker label={t('Objeto que necesitas')} value={item} onPick={setItem} craftable />
        <QuantityInput value={qty} onChange={setQty} />
      </div>
      {!item ? (
        <Empty icon={Scales}>{t('Escribe el nombre de un objeto que se pueda fabricar, por ejemplo «Poción de maná».')}</Empty>
      ) : d.loading && !d.data ? <Loading rows={4} /> : d.error ? <ErrorBox error={d.error} /> : !opts.length ? (
        <Empty icon={Scales}>{t('Ninguna receta del catálogo fabrica este objeto: solo se puede comprar.')}</Empty>
      ) : (
        <>
          <section className="card">
            <h2 className="icon-inline" style={{ marginTop: 0 }}><ItemLabel id={d.data.item?.itemId} name={d.data.item?.name ?? item.name} quality={d.data.item?.quality} px={32} /></h2>
            <BuyOrCraftResult o={opts[0]} showRecipe={opts.length > 1} />
          </section>
          {opts.length > 1 && (
            <details className="card">
              <summary>{t('Otras recetas que lo fabrican (')}{opts.length - 1})</summary>
              {opts.slice(1).map((o) => <div key={o.recipeId} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 8 }}><BuyOrCraftResult o={o} showRecipe /></div>)}
            </details>
          )}
          <details className="card">
            <summary>{t('¿Cómo se calcula?')}</summary>
            <ul className="reasons small">
              <li><strong>{t('Comprarlo:')}</strong>{' '}{t('precio del objeto en tu casa de subastas × cantidad. No se resta comisión: compras, no vendes. Si hay menos unidades en venta de las que necesitas, se avisa.')}</li>
              <li><strong>{t('Fabricarlo:')}</strong>{' '}{t('cada material por lo más barato entre comprarlo o fabricarlo tú. Los materiales que ya tienes cuentan a precio de mercado: usarlos también te cuesta el oro que sacarías vendiéndolos.')}</li>
              <li><strong>{t('La receta:')}</strong>{' '}{t('con un perfil que no la conoce, se suma lo que cuesta (instructor, vendedor o subasta). Sin perfil se indica desde cuántas unidades compensa comprarla.')}</li>
              <li><strong>{t('Da igual')}</strong>{' '}{t('si la diferencia es menor del 5 %.')}</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
