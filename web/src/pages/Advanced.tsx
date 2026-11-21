import React, { useState } from 'react';
import { api, money, ErrorBox, GoldInput, Money, PageHead } from '../lib.js';import { t } from '../i18n.js';


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
      <PageHead title={t('Simulador de resultados al azar')}>{t('Para cuando un resultado depende de la suerte: desencantar, una fabricación que a veces da unidades extra, una caja con varios premios posibles… Escribe cada resultado posible, su probabilidad y lo que cobrarías, y te dice cuánto ganas de media.')}</PageHead>
      <div className="alert info" role="note">
        <p>{t('El comparador no tiene en cuenta estos resultados al azar porque no hay tablas comprobadas de WoW Forever. Aquí solo se usan los números que escribas.')}</p>
      </div>
      {err && <ErrorBox error={err} />}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t('Resultados posibles')}</h2>
        <p className="small muted">{t('Ejemplo: al desencantar sale «Polvo» la mitad de las veces (0.5) y «Esencia» la otra mitad (0.5). Las probabilidades tienen que sumar 1; puedes escribir fracciones como 1/3.')}</p>
        {rows.map((r, i) => (
          <div className="row" key={i}>
            <label className="field">{t('Resultado')}<input type="text" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></label>
            <GoldInput label={t('Probabilidad (0 a 1)')} value={r.probability} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, probability: v } : x)))} placeholder="0.25" />
            <GoldInput label={t('Cobras si sale (oro)')} value={r.netRevenueGold} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, netRevenueGold: v } : x)))} />
            <button className="link danger" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length <= 1}>{t('Quitar')}</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => setRows([...rows, { label: `Resultado ${rows.length + 1}`, probability: '', netRevenueGold: '' }])}>{t('Añadir resultado')}</button>
          <GoldInput label={t('Lo que te cuesta cada intento (oro)')} value={cost} onChange={setCost} />
          <button className="primary" onClick={runEv}>{t('Calcular')}</button>
        </div>
        {ev && (
          <div style={{ marginTop: 8 }}>
            {ev.errors.length ? <div className="alert bad">{ev.errors.map((e: string, i: number) => <p key={i}>{e}</p>)}</div> : (
              <p>{t('De media cobras')}{' '}<strong><Money v={ev.expected} /></strong>{' '}{t('por intento · Ganancia media:')}{' '}<strong><Money v={ev.expectedProfit} /></strong></p>
            )}
            <p className="small muted">{t('Es una media: en cada intento concreto puedes ganar más o menos.')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
