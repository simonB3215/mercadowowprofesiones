import React, { useEffect, useState } from 'react';
import { CHANGELOG, unseenEntries, markChangelogSeen } from './changelog.js';
import { ArrowsClockwise, Sparkle, X } from '@phosphor-icons/react';

/** Archivo principal de la versión cargada (p. ej. /assets/index-AbC123.js). En desarrollo no existe y no se comprueba. */
function loadedBundle(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return s ? new URL(s.src).pathname : null;
}

const CHECK_MS = 5 * 60 * 1000;

/**
 * Avisa cuando se ha publicado una versión nueva mientras la página estaba abierta: compara el archivo principal
 * de la versión cargada con el que sirve ahora index.html (cada 5 min y al volver a la pestaña).
 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const mine = loadedBundle();
    if (!mine) return;
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState === 'hidden') return;
      try {
        const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
        const live = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
        if (live && live !== mine) setAvailable(true);
      } catch { /* sin conexión: se vuelve a intentar */ }
    };
    const t = setInterval(check, CHECK_MS);
    document.addEventListener('visibilitychange', check);
    check();
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, []);
  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <Sparkle size={18} weight="fill" aria-hidden="true" />
      <span>Hay una versión nueva de la web.</span>
      <button type="button" className="primary" onClick={() => location.reload()}>
        <ArrowsClockwise size={16} weight="bold" aria-hidden="true" />Actualizar ahora
      </button>
    </div>
  );
}

/** Tarjeta «Novedades» con lo que ha cambiado desde la última visita. Se cierra o se marca como vista al abrir el changelog. */
export function WhatsNew({ hidden }: { hidden: boolean }) {
  const [entries, setEntries] = useState(() => unseenEntries());
  useEffect(() => {
    const on = () => setEntries(unseenEntries());
    window.addEventListener('changelog-seen', on);
    return () => window.removeEventListener('changelog-seen', on);
  }, []);
  if (hidden || !entries.length) return null;
  return (
    <section className="card whats-new" aria-labelledby="whats-new-title">
      <div className="whats-new-head">
        <h2 id="whats-new-title" className="icon-inline"><Sparkle size={18} weight="fill" aria-hidden="true" />Novedades de la web</h2>
        <button type="button" className="icon-btn" aria-label="Cerrar novedades" onClick={markChangelogSeen}><X size={18} aria-hidden="true" /></button>
      </div>
      {entries.map((e) => (
        <div key={e.title} className="whats-new-entry">
          <strong>{e.title}</strong>
          <ul>{e.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      ))}
      <p className="small" style={{ margin: 0 }}>
        <a href="#/changelog">Ver todas las actualizaciones ({CHANGELOG.length})</a>
        {' · '}<button type="button" className="link" onClick={markChangelogSeen}>Entendido</button>
      </p>
    </section>
  );
}
