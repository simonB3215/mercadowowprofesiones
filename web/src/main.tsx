import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider, useApp, useRoute, api, useAsync, age, dt, type Ctx } from './lib.js';
import { Comparator } from './pages/Comparator.js';
import { RecipeDetail } from './pages/RecipeDetail.js';
import { Catalog } from './pages/Catalog.js';
import { DataQuality } from './pages/DataQuality.js';
import { Profiles } from './pages/Profiles.js';
import { PlanPage } from './pages/Plan.js';
import { Materials } from './pages/Materials.js';
import { Advanced } from './pages/Advanced.js';
import { Ledger } from './pages/Ledger.js';
import { SettingsPage } from './pages/Settings.js';

const NAV: Array<[string, string]> = [
  ['/', 'Comparador'],
  ['/catalogo', 'Catálogo'],
  ['/plan', 'Fabricación'],
  ['/materiales', 'Materiales'],
  ['/perfil', 'Personaje'],
  ['/registro', 'Registro real'],
  ['/avanzado', 'Avanzado'],
  ['/datos', 'Calidad de datos'],
  ['/ajustes', 'Ajustes'],
];

function ContextBar() {
  const { ctx, setCtx, meta, profileId, setProfileId } = useApp();
  const versions = meta?.versions ?? [];
  const version = versions.find((v: any) => v.id === ctx.version);
  const realms = useAsync(() => api(`/api/realms?version=${ctx.version}&region=${ctx.region}`), [ctx.version, ctx.region]);
  const profiles = useAsync(() => api('/api/profiles'), [profileId]);
  const [newRealm, setNewRealm] = useState('');
  const [realmMsg, setRealmMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = (c: Partial<Ctx>) => setCtx({ ...ctx, ...c });
  const onVersion = (id: string) => {
    const v = versions.find((x: any) => x.id === id);
    if (!v?.enabled) return;
    if (id === 'demo') setCtx({ version: 'demo', region: 'demo', realm: 'reino-demo' });
    else setCtx({ version: id, region: v.regions[0], realm: null });
  };
  const addRealm = async () => {
    setBusy(true);
    setRealmMsg(null);
    try {
      const slug = newRealm.trim().toLowerCase().replace(/\s+/g, '-').replace(/'/g, '');
      await api('/api/realms', { method: 'POST', body: { ...ctx, realm: slug, name: newRealm.trim() } });
      setNewRealm('');
      realms.reload();
      change({ realm: slug });
    } catch (e: any) {
      setRealmMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ctxbar" role="group" aria-label="Mercado y personaje">
      <label className="field">Versión
        <select value={ctx.version} onChange={(e) => onVersion(e.target.value)}>
          {versions.map((v: any) => (
            <option key={v.id} value={v.id} disabled={!v.enabled}>{v.label}{v.enabled ? '' : ' (no disponible)'}</option>
          ))}
        </select>
      </label>
      <label className="field">Región
        <select value={ctx.region} onChange={(e) => change({ region: e.target.value, realm: null })}>
          {(version?.regions ?? []).map((r: string) => <option key={r} value={r}>{meta?.regions?.[r] ?? r}</option>)}
        </select>
      </label>
      <label className="field">Reino
        <select value={ctx.realm ?? ''} onChange={(e) => change({ realm: e.target.value || null })}>
          <option value="">— Sin reino (solo commodities) —</option>
          {(realms.data?.realms ?? []).map((r: any) => <option key={r.slug} value={r.slug}>{r.name}{r.source === 'usuario' ? ' (añadido)' : ''}</option>)}
          {ctx.realm && !(realms.data?.realms ?? []).some((r: any) => r.slug === ctx.realm) && <option value={ctx.realm}>{ctx.realm}</option>}
        </select>
      </label>
      {ctx.version !== 'demo' && (
        <label className="field">Añadir reino (slug de TSM)
          <span className="row" style={{ flexWrap: 'nowrap' }}>
            <input type="text" value={newRealm} onChange={(e) => setNewRealm(e.target.value)} placeholder="p. ej. area-52" style={{ width: 140 }}
              onKeyDown={(e) => e.key === 'Enter' && newRealm.trim() && addRealm()} />
            <button onClick={addRealm} disabled={!newRealm.trim() || busy}>{busy ? 'Comprobando…' : 'Añadir'}</button>
          </span>
          {realmMsg && <span role="alert" style={{ color: 'var(--bad)' }}>{realmMsg}</span>}
        </label>
      )}
      <label className="field">Personaje
        <select value={profileId ?? ''} onChange={(e) => setProfileId(e.target.value || null)}>
          <option value="">— Sin perfil (capacidad sin confirmar) —</option>
          {(profiles.data?.profiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
    </div>
  );
}

function App() {
  const [path, parts] = useRoute();
  const { meta } = useApp();
  useEffect(() => {
    const t = NAV.find(([p]) => p === '/' + (parts[0] ?? ''))?.[1] ?? 'Receta';
    document.title = `${t} · Mercado de profesiones`;
  }, [path]);
  let page: React.ReactNode;
  switch (parts[0]) {
    case undefined: page = <Comparator />; break;
    case 'receta': page = <RecipeDetail id={Number(parts[1])} />; break;
    case 'catalogo': page = <Catalog />; break;
    case 'datos': page = <DataQuality />; break;
    case 'perfil': page = <Profiles />; break;
    case 'plan': page = <PlanPage />; break;
    case 'materiales': page = <Materials itemId={parts[1] ? Number(parts[1]) : null} />; break;
    case 'avanzado': page = <Advanced />; break;
    case 'registro': page = <Ledger />; break;
    case 'ajustes': page = <SettingsPage />; break;
    default: page = <div className="empty">Página no encontrada. <a href="#/">Volver al comparador</a></div>;
  }
  const active = '/' + (parts[0] === 'receta' ? '' : parts[0] ?? '');
  return (
    <>
      <a className="skip" href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById('contenido')?.focus(); }}>Saltar al contenido</a>
      <header className="top">
        <div className="top-inner">
          <a className="brand" href="#/"><span className="coin" aria-hidden="true">o</span> Mercado de profesiones</a>
          <nav className="main" aria-label="Secciones">
            {NAV.map(([p, l]) => <a key={p} href={`#${p}`} aria-current={active === p ? 'page' : undefined}>{l}</a>)}
          </nav>
        </div>
        <ContextBar />
      </header>
      <main id="contenido" tabIndex={-1}>
        {meta?.error && <div className="alert bad" role="alert"><p><strong>No se pudo conectar con la API:</strong> {meta.error}</p><p className="small">Comprueba DATABASE_URL y que las migraciones estén aplicadas (npm run migrate).</p></div>}
        {page}
      </main>
      <footer className="small muted" style={{ maxWidth: 1280, margin: '0 auto', padding: '8px 16px 24px' }}>
        Precios: datos públicos de TradeSkillMaster (importes en cobre). Catálogo: Blizzard Game Data API. Las ganancias son estimaciones condicionadas a vender al precio utilizado; no son beneficios realizados.
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider><App /></AppProvider>
  </React.StrictMode>,
);
