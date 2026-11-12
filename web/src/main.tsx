import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider, useApp, useRoute, api, useAsync, age, dt, Loading, type Ctx } from './lib.js';
import { Comparator } from './pages/Comparator.js';
// Las páginas secundarias se cargan bajo demanda (el comparador va en el paquete inicial).
const RecipeDetail = lazy(() => import('./pages/RecipeDetail.js').then((m) => ({ default: m.RecipeDetail })));
const Catalog = lazy(() => import('./pages/Catalog.js').then((m) => ({ default: m.Catalog })));
const DataQuality = lazy(() => import('./pages/DataQuality.js').then((m) => ({ default: m.DataQuality })));
const Profiles = lazy(() => import('./pages/Profiles.js').then((m) => ({ default: m.Profiles })));
const PlanPage = lazy(() => import('./pages/Plan.js').then((m) => ({ default: m.PlanPage })));
const Materials = lazy(() => import('./pages/Materials.js').then((m) => ({ default: m.Materials })));
const Advanced = lazy(() => import('./pages/Advanced.js').then((m) => ({ default: m.Advanced })));
const Ledger = lazy(() => import('./pages/Ledger.js').then((m) => ({ default: m.Ledger })));
const SettingsPage = lazy(() => import('./pages/Settings.js').then((m) => ({ default: m.SettingsPage })));
import {
  ChartBar, BookOpen, Hammer, Package, UserCircle, Receipt, Calculator, ShieldCheck, GearSix, Coins, LockKey, type Icon,
} from '@phosphor-icons/react';

const NAV: Array<[string, string, Icon]> = [
  ['/', 'Comparador', ChartBar],
  ['/catalogo', 'Catálogo', BookOpen],
  ['/plan', 'Fabricación', Hammer],
  ['/materiales', 'Materiales', Package],
  ['/perfil', 'Personaje', UserCircle],
  ['/registro', 'Registro real', Receipt],
  ['/avanzado', 'Simulador', Calculator],
  ['/datos', 'Calidad de datos', ShieldCheck],
  ['/ajustes', 'Ajustes', GearSix],
];

function ContextBar() {
  const { ctx, setCtx, meta, profileId, setProfileId } = useApp();
  const versions = meta?.versions ?? [];
  const version = versions.find((v: any) => v.id === ctx.version);
  const realms = useAsync(() => api(`/api/realms?version=${ctx.version}&region=${ctx.region}`), [ctx.version, ctx.region]);
  const profiles = useAsync(() => api('/api/profiles'), [profileId]);
  const change = (c: Partial<Ctx>) => setCtx({ ...ctx, ...c });

  return (
    <div className="ctxbar" role="group" aria-label="Mercado y personaje">
      <label className="field">Región
        <select value={ctx.region} onChange={(e) => change({ region: e.target.value, realm: null })}>
          {(version?.regions ?? []).map((r: string) => <option key={r} value={r}>{meta?.regions?.[r] ?? r}</option>)}
        </select>
      </label>
      <label className="field">{realms.data?.realmLabel ?? 'Reino'}
        <select value={ctx.realm ?? ''} onChange={(e) => change({ realm: e.target.value || null })}>
          <option value="">Elige una (sin ella solo hay datos regionales)</option>
          {(realms.data?.realms ?? []).map((r: any) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
          {ctx.realm && !(realms.data?.realms ?? []).some((r: any) => r.slug === ctx.realm) && <option value={ctx.realm}>{ctx.realm}</option>}
        </select>
      </label>
      <label className="field">Personaje
        <select value={profileId ?? ''} onChange={(e) => setProfileId(e.target.value || null)}>
          <option value="">Sin perfil (capacidad sin confirmar)</option>
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
    default: page = <div className="empty card">Página no encontrada. <a href="#/">Volver al comparador</a></div>;
  }
  const active = '/' + (parts[0] === 'receta' ? '' : parts[0] ?? '');
  return (
    <>
      <a className="skip" href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById('contenido')?.focus(); }}>Saltar al contenido</a>
      <div className="shell">
        <aside className="sidebar" aria-label="Navegación principal">
          <a className="brand" href="#/" aria-label="Mercado de profesiones, WoW Forever: ir al comparador">
            <span className="brand-mark" aria-hidden="true"><Coins size={20} weight="fill" /></span>
            <span>Mercado de profesiones<small>WoW Forever</small></span>
          </a>
          <nav className="main" aria-label="Secciones">
            {NAV.map(([p, l, Ico]) => (
              <a key={p} href={`#${p}`} aria-current={active === p ? 'page' : undefined} title={l}>
                <Ico size={20} weight={active === p ? 'fill' : 'regular'} aria-hidden="true" />
                <span className="nav-text">{l}</span>
              </a>
            ))}
          </nav>
          <p className="sidebar-foot">Las ganancias son estimaciones; el beneficio realizado está en «Registro real».</p>
        </aside>
        <div className="content">
          <header className="topbar">
            <ContextBar />
          </header>
          <main id="contenido" tabIndex={-1} className="fade-in" key={parts[0] ?? 'inicio'}>
            {meta?.error && <div className="alert bad" role="alert"><div><p><strong>No se pudo conectar con la API:</strong> {meta.error}</p><p className="small">Comprueba DATABASE_URL y que las migraciones estén aplicadas (npm run migrate).</p></div></div>}
            <Suspense fallback={<Loading rows={4} />}>{page}</Suspense>
          </main>
          <footer className="site">
            Solo World of Warcraft: Forever. Precios: casas de subastas de la API de Blizzard y estadísticas regionales de TradeSkillMaster (importes en cobre).
            Catálogo: Blizzard Game Data API. Iconos: <a href="https://www.wowhead.com/forever" rel="noopener noreferrer" target="_blank">Wowhead (WoW Forever)</a> y Blizzard; arte © Blizzard Entertainment.
            Las ganancias son estimaciones condicionadas a vender al precio utilizado; no son beneficios realizados.
          </footer>
        </div>
      </div>
    </>
  );
}

/** Pantalla de acceso cuando el servidor tiene APP_PASSWORD. */
function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Acceso · Mercado de profesiones'; }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: { password: pw } });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="login" id="contenido">
      <form className="card" onSubmit={submit} aria-labelledby="login-title">
        <h1 id="login-title"><span className="brand-mark" aria-hidden="true"><LockKey size={20} weight="fill" /></span> Mercado de profesiones</h1>
        <p className="muted small">Esta aplicación es privada. Introduce la contraseña de acceso.</p>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
        </label>
        {err && <p className="alert bad" role="alert">{err}</p>}
        <button type="submit" className="primary" disabled={busy || !pw}>{busy ? 'Comprobando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}

function Gate() {
  const [state, setState] = useState<'loading' | 'login' | 'ok'>('loading');
  const [required, setRequired] = useState(false);
  useEffect(() => {
    api<{ required: boolean; authenticated: boolean }>('/api/auth/status')
      .then((s) => { setRequired(s.required); setState(s.authenticated ? 'ok' : 'login'); })
      .catch(() => setState('ok')); // si la API no responde, la app muestra su propio error de conexión
    const onAuth = () => setState('login');
    window.addEventListener('auth-required', onAuth);
    return () => window.removeEventListener('auth-required', onAuth);
  }, []);
  if (state === 'loading') return null;
  if (state === 'login') return <Login onDone={() => setState('ok')} />;
  return (
    <AppProvider>
      <App />
      {required && (
        <p className="small" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 16px 24px' }}>
          <button type="button" className="link" onClick={() => api('/api/auth/logout', { method: 'POST' }).finally(() => setState('login'))}>Cerrar sesión</button>
        </p>
      )}
    </AppProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Gate />
  </React.StrictMode>,
);
