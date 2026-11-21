import React, { useEffect } from 'react';
import { PageHead } from '../lib.js';
import { CHANGELOG, markChangelogSeen, type ChangeKind } from '../changelog.js';
import { ClockCounterClockwise, Sparkle, ArrowUp, Wrench, type Icon } from '@phosphor-icons/react';
import { t } from '../i18n.js';

const KIND: Record<ChangeKind, { label: string; cls: string; icon: Icon }> = {
  nuevo: { label: 'Nuevo', cls: 'b-ok', icon: Sparkle },
  mejora: { label: 'Mejora', cls: 'b-info', icon: ArrowUp },
  arreglo: { label: 'Arreglo', cls: 'b-warn', icon: Wrench },
};

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function Changelog() {
  useEffect(markChangelogSeen, []);
  const days = [...new Set(CHANGELOG.map((e) => e.date))];
  return (
    <div>
      <PageHead title={t('Changelog')} icon={<ClockCounterClockwise size={26} aria-hidden="true" />}>{t('Todas las actualizaciones de la web, de la más reciente a la más antigua.')}</PageHead>
      <ol className="cl-days">
        {days.map((d) => (
          <li key={d} className="cl-day">
            <h2 className="cl-date"><time dateTime={d}>{longDate(d)}</time></h2>
            <div className="cl-entries">
              {CHANGELOG.filter((e) => e.date === d).map((e) => {
                const k = KIND[e.kind];
                return (
                  <article key={e.title} className="card cl-entry">
                    <h3><span className={`badge ${k.cls}`}><k.icon size={14} weight="bold" aria-hidden="true" />{k.label}</span>{t(e.title)}</h3>
                    <ul>{e.items.map((it, i) => <li key={i}>{t(it)}</li>)}</ul>
                  </article>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
