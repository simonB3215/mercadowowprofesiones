import React from 'react';
import { useApp } from '../lib.js';
import { MarketStatus } from '../MarketStatus.js';
import { FavoriteAlerts } from '../favorites.js';
import { PriceAlertHits } from '../priceAlerts.js';
import { CHANGELOG } from '../changelog.js';
import { PatchNotesSummary } from '../PatchNotes.js';
import { Today } from '../Today.js';
import { Coins, ChartBar, ArrowFatLinesUp, IdentificationCard, ArrowRight, ClockCounterClockwise, type Icon } from '@phosphor-icons/react';
import { t, locale } from '../i18n.js';

const ACTIONS: Array<{ href: string; icon: Icon; title: string; text: string; cta: string }> = [
  { href: '#/', icon: ChartBar, title: '¿Qué fabrico para ganar oro?', text: 'Compara el costo de los materiales con el precio de venta de cada receta en tu casa de subastas.', cta: 'Abrir el comparador' },
  { href: '#/nivel', icon: ArrowFatLinesUp, title: 'Subir una profesión', text: 'Qué fabricar en cada tramo, cuántas veces y cuánto cuesta, con la lista de la compra.', cta: 'Calcular una ruta' },
  { href: '#/personaje', icon: IdentificationCard, title: 'Mi personaje', text: 'Conecta Battle.net para ver tu equipo y tus profesiones, y calcular la ruta desde tu nivel actual.', cta: 'Ver mi personaje' },
];

export function Home() {
  const { meta, ctx } = useApp();
  const recipes = meta?.catalog?.recipes?.[ctx.version] ?? null;
  const latest = CHANGELOG[0];
  return (
    <div className="home">
      <section className="home-hero">
        <span className="brand-mark home-mark" aria-hidden="true"><Coins size={30} weight="fill" /></span>
        <div>
          <h1>{t('Mercado de profesiones de WoW Forever')}</h1>
          <p className="muted">{t('Precios reales de la casa de subastas de Blizzard')}{recipes ? `, ${t('{n} recetas', { n: recipes.toLocaleString(locale()) })}` : ''}{' '}{t('y rutas para subir profesiones. Las ganancias son estimaciones con los precios actuales.')}</p>
        </div>
      </section>

      <div className="home-actions">
        {ACTIONS.map(({ href, icon: I, title, text, cta }) => (
          <a key={href} className="card home-action" href={href}>
            <span className="home-action-icon" aria-hidden="true"><I size={26} weight="duotone" /></span>
            <h2>{t(title)}</h2>
            <p className="small muted">{t(text)}</p>
            <span className="home-cta">{t(cta)}<ArrowRight size={16} weight="bold" aria-hidden="true" /></span>
          </a>
        ))}
      </div>

      <Today />

      <PatchNotesSummary />

      <FavoriteAlerts compact />
      <PriceAlertHits />
      <MarketStatus />

      {latest && (
        <p className="small home-latest">
          <ClockCounterClockwise size={16} aria-hidden="true" />{t('Última actualización:')}{' '}<strong>{t(latest.title)}</strong> · <a href="#/changelog">{t('ver el changelog')}</a>
        </p>
      )}
    </div>
  );
}
