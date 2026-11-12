import React from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, DemoBanner } from '../lib.js';

const KIND: Record<string, string> = {
  fabricacion: 'Fabricación', secundaria: 'Secundaria (fabricación)', recoleccion: 'Recolección / transformación', historica: 'Histórica', desconocido: 'Sin clasificar',
};

export function Catalog() {
  const { ctx } = useApp();
  const p = useAsync(() => api(`/api/professions?version=${ctx.version}`), [ctx.version]);
  const cov = useAsync(() => api(`/api/coverage?version=${ctx.version}`), [ctx.version]);
  if (p.loading) return <Loading />;
  if (p.error) return <ErrorBox error={p.error} onRetry={p.reload} />;
  const groups: Record<string, any[]> = {};
  for (const x of p.data.professions) (groups[x.kind] ??= []).push(x);
  const expansionsByProf: Record<string, any[]> = {};
  for (const r of cov.data?.rows ?? []) (expansionsByProf[r.profession] ??= []).push(r);
  return (
    <div>
      <DemoBanner />
      <h1>Catálogo de profesiones</h1>
      <p className="muted small">Profesiones y expansiones disponibles en el catálogo de la versión seleccionada. Pulsa una expansión para abrir el comparador filtrado.</p>
      {p.data.missingRequired.length > 0 && (
        <div className="alert warn" role="note">
          <p><strong>Profesiones requeridas sin datos en el catálogo:</strong> {p.data.missingRequired.map((m: any) => m.name).join(', ')}.</p>
          <p className="small">Esto es una laguna del catálogo, no una ausencia confirmada de recetas. Sincroniza el catálogo de Blizzard para completarlo.</p>
        </div>
      )}
      {!p.data.professions.length && <div className="card empty">El catálogo de esta versión está vacío.</div>}
      {Object.entries(groups).map(([k, list]) => (
        <section key={k}>
          <h2>{KIND[k] ?? k}</h2>
          {k === 'recoleccion' && <p className="small muted">Las profesiones de recolección no tienen recetas inventadas: solo se muestran las transformaciones que publica el catálogo. Consulta el valor de los materiales en <a href="#/materiales">Materiales</a>.</p>}
          <div className="grid grid-3">
            {list.map((x) => (
              <div className="card" key={x.id}>
                <h3>{x.name}</h3>
                <p className="small muted">{x.recipes} receta(s) · {x.complete} sin errores de descarga</p>
                <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                  {(expansionsByProf[x.name] ?? []).filter((e) => e.total > 0).map((e) => (
                    <li key={e.expansion}>
                      <a href={`#/?professionId=${x.id}&expansion=${encodeURIComponent(e.expansion)}`}>{e.expansion}</a>: {e.total} ({e.complete} completas)
                    </li>
                  ))}
                  {!(expansionsByProf[x.name] ?? []).some((e) => e.total > 0) && <li className="muted">Sin recetas en el catálogo.</li>}
                </ul>
                <p style={{ marginTop: 8 }}><a href={`#/?professionId=${x.id}`}>Ver en el comparador</a></p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
