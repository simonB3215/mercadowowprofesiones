import React, { useEffect, useState } from 'react';
import { api, useApp, Loading, ErrorBox } from '../lib.js';

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
      <h1>Ajustes</h1>
      <p className="muted small">Los umbrales son preferencias tuyas, no reglas oficiales de TSM. Las comisiones (5 % en las casas de Alianza y Horda, 15 % en Aguasnegras) son supuestos configurables: verifícalas en el juego.</p>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Precios y comisión</h2>
        <div className="grid grid-3">
          {fld('commission', 'Comisión Alianza / Horda (decimal)', '0 ≤ t < 1, p. ej. 0.05')}
          {fld('commissionNeutral', 'Comisión Aguasnegras (decimal)', '0 ≤ t < 1, p. ej. 0.15')}
          {src('buySource', 'Precio de los materiales')}
          {src('sellSource', 'Precio de venta del resultado')}
        </div>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Objetivos para «candidato rentable»</h2>
        <div className="grid grid-3">
          {fld('minProfitUnitGold', 'Ganancia mínima por unidad (oro)')}
          {fld('minRoiPct', 'ROI mínimo (%)')}
          {fld('minSaleRate', 'Tasa de venta regional mínima', 'Señal comparativa, no probabilidad', 'number')}
          {fld('minSoldPerDay', 'Vendidos por día (región) mínimo', undefined, 'number')}
        </div>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Vigencia de los datos</h2>
        <div className="grid grid-3">
          {fld('maxAgeHoursRealm', 'Antigüedad máx. casa de subastas (h)', 'TSM los actualiza cada pocas horas', 'number')}
          {fld('maxAgeHoursRegion', 'Antigüedad máx. estadísticas regionales (h)', 'TSM las actualiza a diario', 'number')}
        </div>
      </section>
      <div className="row">
        <button className="primary" onClick={save}>Guardar ajustes</button>
        <button onClick={() => setS(meta.defaults)}>Restaurar valores por defecto</button>
      </div>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
