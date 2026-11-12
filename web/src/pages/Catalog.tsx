import React from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, Empty, PageHead } from '../lib.js';
import { WowIcon } from '../icons.js';
import { ArrowRight, WarningCircle } from '@phosphor-icons/react';

const KIND: Record<string, string> = {
  fabricacion: 'Fabricación', secundaria: 'Secundaria (fabricación)', recoleccion: 'Recolección / transformación', historica: 'Histórica', desconocido: 'Sin clasificar',
};

export function Catalog() {
  const { ctx } = useApp();
  const p = useAsync(() => api(`/api/professions?version=${ctx.version}`), [ctx.version]);
  if (p.loading) return <Loading rows={4} />;
  if (p.error) return <ErrorBox error={p.error} onRetry={p.reload} />;
  const groups: Record<string, any[]> = {};
  for (const x of p.data.professions) (groups[x.kind] ??= []).push(x);
  return (
    <div>
      <PageHead title="Catálogo de profesiones">Profesiones de WoW Forever disponibles en el catálogo. Pulsa una para abrir el comparador filtrado.</PageHead>
      {p.data.missingRequired.length > 0 && (
        <div className="alert warn" role="note">
          <WarningCircle size={20} weight="bold" aria-hidden="true" />
          <div>
            <p><strong>Profesiones requeridas sin datos en el catálogo:</strong> {p.data.missingRequired.map((m: any) => m.name).join(', ')}.</p>
            <p className="small">Esto es una laguna del catálogo, no una ausencia confirmada de recetas. Sincroniza el catálogo de Blizzard para completarlo.</p>
          </div>
        </div>
      )}
      {!p.data.professions.length && <Empty>El catálogo de esta versión está vacío.</Empty>}
      {Object.entries(groups).map(([k, list]) => (
        <section key={k} aria-labelledby={`grupo-${k}`}>
          <h2 id={`grupo-${k}`}>{KIND[k] ?? k}</h2>
          {k === 'recoleccion' && <p className="small muted">Las profesiones de recolección no tienen recetas inventadas: solo se muestran las transformaciones que publica el catálogo. Consulta el valor de los materiales en <a href="#/materiales">Materiales</a>.</p>}
          <div className="grid grid-3">
            {list.map((x) => (
              <article className="card prof-card" key={x.id}>
                <div className="title-with-icon">
                  <WowIcon kind="profession" id={x.id} px={44} />
                  <div>
                    <h3>{x.name}</h3>
                    <p className="small muted" style={{ margin: 0 }}><span className="num-font">{x.recipes}</span> receta(s) · <span className="num-font">{x.complete}</span> sin errores de descarga</p>
                  </div>
                </div>
                <div className="actions">
                  {x.recipes > 0
                    ? <a className="icon-inline" href={`#/?professionId=${x.id}`}>Ver en el comparador <ArrowRight size={16} aria-hidden="true" /></a>
                    : <span className="small muted">Sin recetas en el catálogo.</span>}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
