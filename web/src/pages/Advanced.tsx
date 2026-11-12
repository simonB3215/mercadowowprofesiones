import React, { useState } from 'react';
import { api, money, ErrorBox, GoldInput } from '../lib.js';

export function Advanced() {
  const [rows, setRows] = useState([{ label: 'Resultado A', probability: '', netRevenueGold: '' }, { label: 'Resultado B', probability: '', netRevenueGold: '' }]);
  const [cost, setCost] = useState('');
  const [ev, setEv] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [c, setC] = useState({ profitWithoutGold: '', profitWithGold: '', concentration: '' });
  const [cr, setCr] = useState<any>(null);

  const runEv = async () => {
    setErr(null);
    try { setEv(await api('/api/tools/expected', { method: 'POST', body: { scenarios: rows, costGold: cost } })); } catch (e: any) { setErr(e.message); }
  };
  const runC = async () => {
    setErr(null);
    try { setCr(await api('/api/tools/expected', { method: 'POST', body: { kind: 'concentration', ...c } })); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div>
      <h1>Herramientas avanzadas (manuales)</h1>
      <div className="alert warn" role="note">
        <p><strong>Sin reglas verificadas.</strong> Calidades, especialización, producción adicional, ahorro de materiales, concentración, enfriamientos, molienda, prospección y desencantado necesitan reglas comprobadas por receta y parche. Todavía no se dispone de ellas, así que el comparador no las aplica automáticamente.</p>
        <p>Estas calculadoras usan solo los valores que introduces. El resultado se marca como manual y no genera recomendaciones automáticas.</p>
      </div>
      {err && <ErrorBox error={err} />}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Resultados aleatorios excluyentes (valor esperado)</h2>
        <p className="small muted">Ingreso_esperado = Σ(probabilidad × ingreso neto). Las probabilidades deben sumar exactamente 1 (se admiten fracciones como 1/3).</p>
        {rows.map((r, i) => (
          <div className="row" key={i}>
            <label className="field">Escenario<input type="text" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></label>
            <GoldInput label="Probabilidad" value={r.probability} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, probability: v } : x)))} placeholder="0.25" />
            <GoldInput label="Ingreso neto (oro)" value={r.netRevenueGold} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, netRevenueGold: v } : x)))} />
            <button className="link danger" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length <= 1}>Quitar</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => setRows([...rows, { label: `Resultado ${rows.length + 1}`, probability: '', netRevenueGold: '' }])}>Añadir escenario</button>
          <GoldInput label="Costo esperado (oro)" value={cost} onChange={setCost} />
          <button className="primary" onClick={runEv}>Calcular</button>
        </div>
        {ev && (
          <div style={{ marginTop: 8 }}>
            {ev.errors.length ? <div className="alert bad">{ev.errors.map((e: string, i: number) => <p key={i}>{e}</p>)}</div> : (
              <p>Ingreso esperado: <strong>{money(ev.expected)}</strong> · Ganancia esperada: <strong>{money(ev.expectedProfit)}</strong> <span className="badge b-info">Manual</span></p>
            )}
            <p className="small muted">El valor esperado no está garantizado en cada ejecución.</p>
          </div>
        )}
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Concentración: ganancia incremental por punto</h2>
        <p className="small muted">(Ganancia con concentración − ganancia sin ella) / concentración consumida. Ambas alternativas deben ser válidas.</p>
        <div className="row">
          <GoldInput label="Ganancia sin concentración (oro)" value={c.profitWithoutGold} onChange={(v) => setC({ ...c, profitWithoutGold: v })} />
          <GoldInput label="Ganancia con concentración (oro)" value={c.profitWithGold} onChange={(v) => setC({ ...c, profitWithGold: v })} />
          <GoldInput label="Concentración consumida" value={c.concentration} onChange={(v) => setC({ ...c, concentration: v })} />
          <button className="primary" onClick={runC}>Calcular</button>
        </div>
        {cr && <p style={{ marginTop: 8 }}>{cr.error ? <span style={{ color: 'var(--bad)' }}>{cr.error}</span> : <>Incremental: <strong>{money(cr.incremental)}</strong> · por punto: <strong>{money(cr.perPoint)}</strong> <span className="badge b-info">Manual</span></>}</p>}
      </section>
    </div>
  );
}
