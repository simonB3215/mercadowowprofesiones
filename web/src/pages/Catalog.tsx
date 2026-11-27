import React from 'react';
import { api, useApp, useAsync, Loading, ErrorBox, Empty, PageHead } from '../lib.js';
import { WowIcon } from '../icons.js';
import { ArrowRight, WarningCircle } from '@phosphor-icons/react';
import { t } from '../i18n.js';
import { useListFilters } from '../ListFilters.js';

const KIND: Record<string, string> = {
  fabricacion: 'Fabricación', secundaria: 'Secundaria (fabricación)', recoleccion: 'Recolección / transformación', historica: 'Histórica', desconocido: 'Sin clasificar',
};

export function Catalog() {
  const { ctx } = useApp();
  const p = useAsync(() => api<any>(`/api/professions?version=${ctx.version}`), [ctx.version]);
  const filters = useListFilters<any>(p.data?.professions ?? [], {
    path: '/catalogo',
    name: (x) => x.name, searchLabel: 'Buscar profesión', searchPlaceholder: 'p. ej. Alquimia',
    status: { label: 'Tipo', get: (x) => x.kind, options: Object.entries(KIND) },
    defaultSort: '',
    sorts: [
      { key: 'recipes', label: 'Número de recetas', get: (x) => x.recipes },
      { key: 'name', label: 'Nombre', get: (x) => x.name },
    ],
    checks: [
      { key: 'conrecetas', label: 'Solo con recetas', test: (x) => x.recipes > 0 },
      { key: 'completas', label: 'Solo con todos los datos completos', test: (x) => x.complete >= x.recipes },
    ],
  });
  if (p.loading) return <Loading rows={4} />;
  if (p.error) return <ErrorBox error={p.error} onRetry={p.reload} />;
  const groups: Record<string, any[]> = {};
  for (const x of filters.list) (groups[x.kind] ??= []).push(x);
  return (
    <div>
      <PageHead title={t('Catálogo de profesiones')}>{t('Todas las profesiones de WoW Forever. Elige una para ver qué recetas dan oro o para calcular cómo subirla.')}</PageHead>
      {p.data.missingRequired.length > 0 && (
        <div className="alert warn" role="note">
          <WarningCircle size={20} weight="bold" aria-hidden="true" />
          <div>
            <p><strong>{t('Profesiones requeridas sin datos en el catálogo:')}</strong> {p.data.missingRequired.map((m: any) => m.name).join(', ')}.</p>
            <p className="small">{t('Esto es una laguna del catálogo, no una ausencia confirmada de recetas. Sincroniza el catálogo de Blizzard para completarlo.')}</p>
          </div>
        </div>
      )}
      {p.data.professions.length > 0 && filters.ui}
      {!p.data.professions.length && <Empty>{t('El catálogo de esta versión está vacío.')}</Empty>}
      {p.data.professions.length > 0 && !filters.list.length && <Empty>{t('Ninguna profesión cumple los filtros.')}</Empty>}
      {Object.entries(groups).map(([k, list]) => (
        <section key={k} aria-labelledby={`grupo-${k}`}>
          <h2 id={`grupo-${k}`}>{t(KIND[k] ?? k)}</h2>
          {k === 'recoleccion' && <p className="small muted">{t('Las profesiones de recolección no tienen recetas inventadas: solo se muestran las transformaciones que publica el catálogo. Consulta el valor de los materiales en')}{' '}<a href="#/materiales">{t('Materiales')}</a>.</p>}
          <div className="grid grid-3">
            {list.map((x) => (
              <article className="card prof-card" key={x.id}>
                <div className="title-with-icon">
                  <WowIcon kind="profession" id={x.id} px={44} />
                  <div>
                    <h3>{x.name}</h3>
                    <p className="small muted" style={{ margin: 0 }}><span className="num-font">{x.recipes}</span> {x.recipes === 1 ? t('receta') : t('recetas')}{x.complete < x.recipes ? ` · ${t('{n} con datos incompletos', { n: x.recipes - x.complete })}` : ''}</p>
                  </div>
                </div>
                <div className="actions">
                  {x.recipes > 0
                    ? <>
                        <a className="icon-inline" href={`#/?professionId=${x.id}`}>{t('Qué da oro')}{' '}<ArrowRight size={16} aria-hidden="true" /></a>
                        {k !== 'recoleccion' && <a className="icon-inline" href={`#/nivel?prof=${x.id}`}>{t('Subir de nivel')}{' '}<ArrowRight size={16} aria-hidden="true" /></a>}
                      </>
                    : <span className="small muted">{t('Sin recetas en el catálogo.')}</span>}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
