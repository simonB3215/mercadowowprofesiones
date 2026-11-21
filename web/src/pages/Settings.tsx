import React, { useEffect, useState } from 'react';
import { api, useApp, Loading, ErrorBox, PageHead } from '../lib.js';

export function SettingsPage() {
  const { meta, reloadMeta } = useApp();
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (meta?.settings) setS(meta.settings); }, [meta]);
  if (!meta) return <Loading />;
  if (meta.error) return <ErrorBox error={meta.error} />;
  if (!s) return <Loading />;
  const save = async () => {
    setMsg(null);
    try { await api('/api/settings', { method: 'PUT', body: s }); setMsg('Ajustes guardados. Los cálculos se recalculan con estos valores.'); reloadMeta(); } catch (e: any) { setMsg(e.message); }
  };
  const pctOf = (v: string) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1 ? ` · ahora: ${+(n * 100).toFixed(2)} %` : ''; };
  const fld = (k: string, label: string, hint?: string, type = 'text') => (
    <label className="field">{label}
      <input type={type} value={s[k]} onChange={(e) => setS({ ...s, [k]: type === 'number' ? e.target.value : e.target.value })} />
      {hint && <span className="small">{hint}</span>}
    </label>
  );
  const src = (k: string, label: string) => (
    <label className="field">{label}
      <select value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })}>
        {Object.entries(meta.priceFields).map(([v, l]: any) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <div>
      <PageHead title="Ajustes">
        Cambia cómo se calculan las ganancias y cuándo una receta cuenta como «Buena opción». Los valores por defecto sirven para la mayoría; si dudas, no toques nada.
      </PageHead>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Precios y comisión</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          En WoW Forever la subasta se queda con el <strong>5 %</strong> de cada venta en Alianza y Horda y con el <strong>15 %</strong> en Aguasnegras
          (Gadgetzan, Bahía del Botín y Vista Eterna), según el cliente del juego comprobado el 13-11-2026 (<a href="https://conquestcapped.com/guides/wow-forever/wow-forever-auction-house/" target="_blank" rel="noreferrer">guía de Forever</a>).
          El depósito se devuelve si se vende.
        </p>
        <div className="grid grid-3">
          {fld('commission', 'Comisión de la subasta de Alianza y Horda', `Escrita en decimal: 0.05 = 5 %${pctOf(s.commission)}`)}
          {fld('commissionNeutral', 'Comisión de la subasta de Aguasnegras', `Escrita en decimal: 0.15 = 15 %${pctOf(s.commissionNeutral)}`)}
          {src('buySource', 'Precio de los materiales')}
          {src('sellSource', 'Precio de venta del resultado')}
        </div>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Cuándo una receta es «Buena opción»</h2>
        <p className="small muted">Tiene que cumplir todo: si gana menos sale como «Gana poco», y si se vende menos, como «Rentable, ventas inciertas».</p>
        <div className="grid grid-3">
          {fld('minProfitUnitGold', 'Ganancia mínima por unidad (oro)')}
          {fld('minRoiPct', 'ROI mínimo (%)', 'Ganancia ÷ costo. 10 = ganas al menos un 10 % sobre lo invertido')}
          {fld('minSaleRate', 'Tasa de venta mínima (región)', 'Qué parte de lo publicado llega a venderse, de 0 a 1', 'number')}
          {fld('minSoldPerDay', 'Ventas al día mínimas (región)', 'Unidades vendidas al día en toda la región', 'number')}
        </div>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Cuándo un precio es demasiado viejo</h2>
        <p className="small muted">Si los precios tienen más horas que esto, las recetas salen como «Faltan precios».</p>
        <div className="grid grid-3">
          {fld('maxAgeHoursRealm', 'Precios de tu casa de subastas (horas)', 'Se actualizan cada hora', 'number')}
          {fld('maxAgeHoursRegion', 'Estadísticas de la región (horas)', 'Se actualizan una vez al día', 'number')}
        </div>
      </section>
      <div className="row">
        <button className="primary" onClick={save}>Guardar ajustes</button>
        <button onClick={() => setS(meta.defaults)}>Volver a los valores por defecto</button>
      </div>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
