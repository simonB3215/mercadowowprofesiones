import React, { useState } from 'react';
import { api, money, ErrorBox, GoldInput, Money } from '../lib.js';

export function Advanced() {
  const [rows, setRows] = useState([{ label: 'Resultado A', probability: '', netRevenueGold: '' }, { label: 'Resultado B', probability: '', netRevenueGold: '' }]);
  const [cost, setCost] = useState('');
  const [ev, setEv] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const runEv = async () => {
    setErr(null);
    try { setEv(await api('/api/tools/expected', { method: 'POST', body: { scenarios: rows, costGold: cost } })); } catch (e: any) { setErr(e.message); }
  };
  return (
    <div>
      <h1>Herramientas avanzadas (manuales)</h1>
      <div className="alert warn" role="note">
        <p><strong>Sin reglas verificadas.</strong> El desencantado, los procs de producción adicional y otros resultados aleatorios de WoW Forever necesitan tablas comprobadas. Todavía no se dispone de ellas, así que el comparador no los aplica automáticamente.</p>
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
              <p>Ingreso esperado: <strong><Money v={ev.expected} /></strong> · Ganancia esperada: <strong><Money v={ev.expectedProfit} /></strong> <span className="badge b-info">Manual</span></p>
            )}
            <p className="small muted">El valor esperado no está garantizado en cada ejecución.</p>
          </div>
        )}
      </section>
    </div>
  );
}
