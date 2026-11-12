import React, { useEffect, useState } from 'react';
import { api, useApp, useAsync, money, Loading, ErrorBox, StatusBadge, GoldInput, PageHead, toQ, formatMoney, Q } from '../lib.js';
import { ItemLabel, WowIcon } from '../icons.js';
import { ArrowLeft, MagnifyingGlass, ArrowUp, ArrowDown, MinusCircle } from '@phosphor-icons/react';

function GoldPerHour({ netPerUnit }: { netPerUnit: Q | null }) {
  const [units, setUnits] = useState('');
  const [minutes, setMinutes] = useState('');
  let result: string | null = null;
  try {
    if (netPerUnit && units && minutes) {
      const u = Q.parse(units);
      const m = Q.parse(minutes);
      if (m.sign() > 0 && u.sign() >= 0) result = formatMoney(netPerUnit.mul(u).div(m).mul(60));
    }
  } catch { result = null; }
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Oro por hora (con tus datos)</h2>
      <p className="small muted">Solo se calcula con el tiempo y el rendimiento que indiques; no hay una fuente validada de tasas de recolección.</p>
      <div className="row">
        <GoldInput label="Unidades obtenidas" value={units} onChange={setUnits} placeholder="p. ej. 120" />
        <GoldInput label="Minutos empleados" value={minutes} onChange={setMinutes} placeholder="p. ej. 30" />
      </div>
      <p>Resultado: <strong>{result ?? '—'}</strong> /hora <span className="small muted">(procedencia: entrada del usuario × valor neto de venta)</span></p>
    </section>
  );
}

function MaterialDetail({ itemId }: { itemId: number }) {
  const { ctxQuery } = useApp();
  const d = useAsync(() => api(`/api/materials/${itemId}?${ctxQuery}`), [itemId, ctxQuery]);
  if (d.loading) return <Loading rows={4} />;
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  const x = d.data;
  return (
    <>
      <p><a className="icon-inline" href="#/materiales"><ArrowLeft size={16} aria-hidden="true" />Todos los materiales</a></p>
      <div className="card title-with-icon"><WowIcon id={itemId} px={56} /><div><h1 style={{ margin: 0 }}>{x.name ?? `Objeto ${itemId}`}</h1><p className="small muted" style={{ margin: 0 }}>ID {itemId}</p></div></div>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Vender el material</h2>
        <dl className="kv">
          <dt>Precio utilizado</dt><dd>{money(x.price.copper)} <span className="small muted">{x.price.field} · {x.price.scope}</span></dd>
          <dt>Valor neto de venta por unidad</dt><dd><strong>{money(x.sellNet)}</strong> <span className="small muted">(tras comisión {x.commission})</span></dd>
        </dl>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Usarlo para fabricar</h2>
        <p className="small muted">Valor por unidad del material = (ingreso neto de la receta − costo del resto de materiales) / cantidad usada. Mismos supuestos de precio que la venta directa.</p>
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>Receta</th><th>Profesión</th><th className="num">Cantidad</th><th className="num">Valor por unidad del material</th><th>Comparación</th><th>Estado</th></tr></thead>
            <tbody>
              {x.alternatives.map((a: any) => {
                const v = toQ(a.valuePerUnit);
                const s = toQ(x.sellNet);
                return (
                  <tr key={a.recipeId}>
                    <td data-label="Receta" className="cell-main"><a href={`#/receta/${a.recipeId}`}>{a.name}</a></td>
                    <td data-label="Profesión">{a.profession}</td>
                    <td data-label="Cantidad" className="num">{a.quantity ?? '—'}</td>
                    <td data-label="Valor/unidad" className="num">{formatMoney(v)}</td>
                    <td data-label="Comparación">{v && s ? (v.cmp(s) > 0
                      ? <span className="delta pos"><ArrowUp size={14} weight="bold" aria-hidden="true" />Mejor que vender</span>
                      : <span className="delta neg"><ArrowDown size={14} weight="bold" aria-hidden="true" />Peor que vender</span>)
                      : <span className="delta none"><MinusCircle size={14} aria-hidden="true" />Sin datos comparables</span>}</td>
                    <td data-label="Estado"><StatusBadge s={a.status} /></td>
                  </tr>
                );
              })}
              {!x.alternatives.length && <tr><td colSpan={6} className="empty">Ninguna receta del catálogo usa este material.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <GoldPerHour netPerUnit={toQ(x.sellNet)} />
    </>
  );
}

export function Materials({ itemId }: { itemId: number | null }) {
  const { ctx } = useApp();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  const list = useAsync(() => api(`/api/materials?version=${ctx.version}&search=${encodeURIComponent(q)}`), [ctx.version, q]);
  if (itemId) return <MaterialDetail itemId={itemId} />;
  return (
    <div>
      <PageHead title="Materiales">Compara vender un material (por ejemplo, de recolección) con usarlo en las recetas del catálogo.</PageHead>
      <label className="field" style={{ maxWidth: 360 }}>Buscar material<span className="input-icon"><MagnifyingGlass size={16} aria-hidden="true" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre del material" /></span></label>
      {list.loading ? <Loading rows={6} /> : list.error ? <ErrorBox error={list.error} /> : (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="responsive">
            <thead><tr><th>Material</th><th className="num">Recetas que lo usan</th></tr></thead>
            <tbody>
              {list.data.materials.map((m: any) => (
                <tr key={m.item_id}><td data-label="Material" className="cell-main"><ItemLabel id={m.item_id} href={`#/materiales/${m.item_id}`} name={m.name} sub={`ID ${m.item_id}`} /></td><td data-label="Recetas" className="num">{m.uses}</td></tr>
              ))}
              {!list.data.materials.length && <tr><td colSpan={2} className="empty">Sin materiales en el catálogo.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
