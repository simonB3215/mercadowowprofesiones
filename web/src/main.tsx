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
const Leveling = lazy(() => import('./pages/Leveling.js').then((m) => ({ default: m.Leveling })));
const Character = lazy(() => import('./pages/Character.js').then((m) => ({ default: m.Character })));
const SettingsPage = lazy(() => import('./pages/Settings.js').then((m) => ({ default: m.SettingsPage })));
const PotionsPage = lazy(() => import('./pages/Potions.js').then((m) => ({ default: m.PotionsPage })));
const TransmutationsPage = lazy(() => import('./pages/Transmutations.js').then((m) => ({ default: m.Transmutations })));
const BuyOrCraftPage = lazy(() => import('./pages/BuyOrCraft.js').then((m) => ({ default: m.BuyOrCraft })));
const GameChangesPage = lazy(() => import('./pages/GameChanges.js').then((m) => ({ default: m.GameChanges })));
const TimelinePage = lazy(() => import('./pages/Timeline.js').then((m) => ({ default: m.TimelinePage })));
const Changelog = lazy(() => import('./pages/Changelog.js').then((m) => ({ default: m.Changelog })));
import { changelogUnseen } from './changelog.js';
import { UpdateBanner, WhatsNew } from './Updates.js';
import { ItemTipHost } from './ItemTooltip.js';
import { GlobalSearch } from './GlobalSearch.js';
import { t, t as tr, lang, setLang, loadGameNames } from './i18n.js';
import {
  ChartBar, BookOpen, Hammer, Package, UserCircle, Receipt, Calculator, ShieldCheck, GearSix, Coins, LockKey, ArrowFatLinesUp, IdentificationCard, ClockCounterClockwise,
  House, SignOut, Scales, Flask, Scroll, BeerBottle, ChartLineUp, type Icon,
} from '@phosphor-icons/react';
const Home = lazy(() => import('./pages/Home.js').then((m) => ({ default: m.Home })));
const Privacy = lazy(() => import('./pages/Privacy.js').then((m) => ({ default: m.Privacy })));

/**
 * Tras publicar una versión nueva, una pestaña abierta con la anterior pide trozos (assets/Pagina-abc.js) que ya no
 * existen y la página se quedaba en blanco. Si falla la carga de un trozo, se recarga una vez para traer la versión
 * nueva. Como mucho una recarga por minuto, para no entrar en bucle si el fallo es otro (sin conexión, etc.).
 */
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Expected a JavaScript.*module script/i;
function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem('chunkReloadAt') ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem('chunkReloadAt', String(Date.now()));
  } catch { /* sin almacenamiento: se recarga igual */ }
  location.reload();
  return true;
}
window.addEventListener('vite:preloadError', (e) => { if (reloadForNewVersion()) e.preventDefault(); });
window.addEventListener('unhandledrejection', (e) => { if (CHUNK_ERROR.test(String((e.reason as Error)?.message ?? e.reason))) reloadForNewVersion(); });
window.addEventListener('error', (e) => { if (CHUNK_ERROR.test(String(e.message ?? ''))) reloadForNewVersion(); });

type NavItem = [string, string, Icon];
/** Menú en tres grupos por objetivo. En tableta y móvil los títulos se sustituyen por una línea separadora. */
const NAV_GROUPS: Array<[string | null, NavItem[]]> = [
  [null, [['/inicio', t('Inicio'), House]]],
  [t('Ganar oro'), [
    ['/', t('Comparador'), ChartBar],
    ['/catalogo', t('Catálogo'), BookOpen],
    ['/materiales', t('Materiales'), Package],
    ['/comprar', t('Comprar o fabricar'), Scales],
    ['/transmutaciones', t('Transmutaciones'), Flask],
    ['/pociones', t('Pociones'), BeerBottle],
    ['/linea-de-tiempo', t('Línea de tiempo'), ChartLineUp],
    ['/plan', t('Fabricación'), Hammer],
  ]],
  [t('Subir profesión'), [
    ['/nivel', t('Subir nivel'), ArrowFatLinesUp],
    ['/personaje', t('Mi personaje'), IdentificationCard],
  ]],
  [t('El juego'), [
    ['/cambios', t('Cambios del juego'), Scroll],
  ]],
  [t('Mis datos'), [
    ['/perfil', t('Perfiles manuales'), UserCircle],
    ['/registro', t('Registro real'), Receipt],
    ['/avanzado', t('Simulador'), Calculator],
  ]],
  [t('La web'), [
    ['/datos', t('Calidad de datos'), ShieldCheck],
    ['/ajustes', t('Ajustes'), GearSix],
    ['/changelog', t('Changelog'), ClockCounterClockwise],
  ]],
];
const NAV: NavItem[] = NAV_GROUPS.flatMap(([, items]) => items);
/** Para qué sirve cada sección (ayuda emergente del menú). */
const NAV_HELP: Record<string, string> = {
  '/inicio': t('Página de inicio'),
  '/': t('Qué recetas dan más oro con los precios actuales'),
  '/catalogo': t('Todas las profesiones y sus recetas'),
  '/materiales': t('¿Vender un material o usarlo para fabricar?'),
  '/transmutaciones': t('Transmutaciones y recetas con espera: cuánto oro dan al día'),
  '/pociones': t('Las pociones más vendidas y si aún conviene fabricarlas para vender'),
  '/linea-de-tiempo': t('Qué materiales comprar baratos hoy para venderlos cuando abran las raids'),
  '/comprar': t('¿Te sale más barato comprar un objeto o fabricarlo?'),
  '/plan': t('Lista de compra total para fabricar varias recetas'),
  '/nivel': t('Qué fabricar para subir una profesión y cuánto cuesta'),
  '/personaje': t('Tu personaje de Battle.net y la ruta desde tu nivel'),
  '/perfil': t('Indica a mano qué recetas conoces y qué materiales tienes'),
  '/registro': t('Anota tus compras y ventas reales para ver tu ganancia de verdad'),
  '/avanzado': t('Calcula la ganancia media de resultados al azar (desencantar…)'),
  '/datos': t('De cuándo son los precios y qué le falta al catálogo'),
  '/ajustes': t('Comisión de la subasta y criterios de «Buena opción»'),
  '/changelog': t('Novedades de la web'),
  '/cambios': t('Buffs y nerfs de cada clase y raza (hotfixes oficiales de Blizzard)'),
};
const EXTRA_TITLES: Record<string, string> = { '/privacidad': t('Privacidad') };

/** Hay entradas del changelog que este navegador aún no ha visto. */
function useChangelogUnseen() {
  const [unseen, setUnseen] = useState(changelogUnseen);
  useEffect(() => {
    const on = () => setUnseen(changelogUnseen());
    window.addEventListener('changelog-seen', on);
    return () => window.removeEventListener('changelog-seen', on);
  }, []);
  return unseen;
}

/**
 * Hay un hotfix de Blizzard más reciente que el último que se vio en «Cambios del juego» (desde este navegador).
 * La primera vez que se abre la web no se marca nada: solo avisa de los que salgan después.
 */
const HOTFIX_KEY = 'mw-hotfix-visto';
function useHotfixUnseen(onPage: boolean) {
  const [latest, setLatest] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(() => { try { return localStorage.getItem(HOTFIX_KEY); } catch { return null; } });
  useEffect(() => { api<any>('/api/patch-notes?days=1').then((r) => setLatest(r.days?.[0]?.date ?? null)).catch(() => {}); }, []);
  useEffect(() => {
    if (!latest || (seen && !onPage && latest <= seen)) return;
    if (onPage || !seen) { try { localStorage.setItem(HOTFIX_KEY, latest); } catch { /* sin almacenamiento */ } setSeen(latest); }
  }, [latest, onPage]);
  return Boolean(latest && seen && latest > seen && !onPage);
}

function ContextBar() {
  const { ctx, setCtx, meta, profileId, setProfileId } = useApp();
  const versions = meta?.versions ?? [];
  const version = versions.find((v: any) => v.id === ctx.version);
  const realms = useAsync(() => api(`/api/realms?version=${ctx.version}&region=${ctx.region}`), [ctx.version, ctx.region]);
  const profiles = useAsync(() => api('/api/profiles'), [profileId]);
  const change = (c: Partial<Ctx>) => setCtx({ ...ctx, ...c });

  return (
    <div className="ctxbar" role="group" aria-label={t('Mercado y personaje')}>
      <label className="field">{t('Región')}
        <select value={ctx.region} onChange={(e) => change({ region: e.target.value, realm: null })}>
          {(version?.regions ?? []).map((r: string) => <option key={r} value={r}>{t(meta?.regions?.[r] ?? r)}</option>)}
        </select>
      </label>
      <label className="field">{t(realms.data?.realmLabel ?? 'Reino')}
        <select value={ctx.realm ?? ''} onChange={(e) => change({ realm: e.target.value || null })}>
          <option value="">{t('Elige una (sin ella solo hay datos regionales)')}</option>
          {(realms.data?.realms ?? []).map((r: any) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
          {ctx.realm && !(realms.data?.realms ?? []).some((r: any) => r.slug === ctx.realm) && <option value={ctx.realm}>{ctx.realm}</option>}
        </select>
      </label>
      <label className="field">
        <span>{t('Perfil manual')} <a className="small" href="#/perfil" title={t('Qué es un perfil manual')}>(?)</a></span>
        <select value={profileId ?? ''} onChange={(e) => setProfileId(e.target.value || null)}>
          <option value="">{t('Ninguno (no filtra por recetas conocidas)')}</option>
          {(profiles.data?.profiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="field">{t('Idioma')}
        <select value={lang()} onChange={(e) => setLang(e.target.value as 'es' | 'en')}>
          <option value="es">{t('Español')}</option>
          <option value="en">{t('English')}</option>
        </select>
      </label>
    </div>
  );
}

function App({ onLogout, onLogin }: { onLogout?: () => void; onLogin?: () => void }) {
  const [path, parts] = useRoute();
  const { meta } = useApp();
  useEffect(() => {
    const k = '/' + (parts[0] ?? '');
    const t = NAV.find(([p]) => p === k)?.[1] ?? EXTRA_TITLES[k] ?? tr('Receta');
    document.title = `${t} · ${tr('Mercado de profesiones')}`;
  }, [path]);
  let page: React.ReactNode;
  switch (parts[0]) {
    case undefined: page = <Comparator />; break;
    case 'inicio': page = <Home />; break;
    case 'privacidad': page = <Privacy />; break;
    case 'receta': page = <RecipeDetail id={Number(parts[1])} />; break;
    case 'catalogo': page = <Catalog />; break;
    case 'datos': page = <DataQuality />; break;
    case 'perfil': page = <Profiles />; break;
    case 'transmutaciones': page = <TransmutationsPage />; break;
    case 'pociones': page = <PotionsPage />; break;
    case 'linea-de-tiempo': page = <TimelinePage itemId={parts[1] ? Number(parts[1]) : null} />; break;
    case 'comprar': page = <BuyOrCraftPage />; break;
    case 'plan': page = <PlanPage />; break;
    case 'materiales': page = <Materials itemId={parts[1] ? Number(parts[1]) : null} />; break;
    case 'avanzado': page = <Advanced />; break;
    case 'registro': page = <Ledger />; break;
    case 'nivel': page = <Leveling />; break;
    case 'personaje': page = <Character />; break;
    case 'ajustes': page = <SettingsPage />; break;
    case 'changelog': page = <Changelog />; break;
    case 'cambios': page = <GameChangesPage />; break;
    default: page = <div className="empty card">{t('Página no encontrada.')} <a href="#/">{t('Volver al comparador')}</a></div>;
  }
  const active = '/' + (parts[0] === 'receta' ? '' : parts[0] ?? '');
  const unseen = useChangelogUnseen();
  const hotfixUnseen = useHotfixUnseen(active === '/cambios');
  return (
    <>
      <a className="skip" href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById('contenido')?.focus(); }}>{t('Saltar al contenido')}</a>
      <div className="shell">
        <aside className="sidebar" aria-label={t('Navegación principal')}>
          <a className="brand" href="#/inicio" aria-label={t('Mercado de profesiones, WoW Forever: ir al inicio')}>
            <span className="brand-mark" aria-hidden="true"><Coins size={20} weight="fill" /></span>
            <span>{t('Mercado de profesiones')}<small>{t('WoW Forever')}</small></span>
          </a>
          <nav className="main" aria-label={t('Secciones')}>
            {NAV_GROUPS.map(([group, items], gi) => (
              <div key={gi} className="nav-group" role="group" aria-label={group ?? t('Inicio')}>
                {group && <span className="nav-group-title" aria-hidden="true">{group}</span>}
                {items.map(([p, l, Ico]) => (
                  <a key={p} href={`#${p}`} aria-current={active === p ? 'page' : undefined} title={NAV_HELP[p] && p !== "/inicio" ? `${l}: ${NAV_HELP[p]}` : l}>
                    <Ico size={20} weight={active === p ? 'fill' : 'regular'} aria-hidden="true" />
                    <span className="nav-text">{l}</span>
                    {p === '/changelog' && unseen && <span className="nav-dot" aria-label={t('(novedades sin ver)')} />}
                    {p === '/cambios' && hotfixUnseen && <span className="nav-dot nav-dot-hotfix" title={t('Hay un hotfix nuevo de Blizzard')} aria-label={t('(hotfix nuevo sin ver)')} />}
                  </a>
                ))}
              </div>
            ))}
          </nav>
          {onLogout && (
            <button type="button" className="nav-logout" onClick={onLogout} title={t('Salir del modo administrador')}>
              <SignOut size={20} aria-hidden="true" /><span className="nav-text">{t('Salir de admin')}</span>
            </button>
          )}
          {onLogin && (
            <button type="button" className="nav-logout" onClick={onLogin} title={t('Contraseña para cambiar ajustes, sincronizar precios y editar datos compartidos')}>
              <LockKey size={20} aria-hidden="true" /><span className="nav-text">{t('Entrar como admin')}</span>
            </button>
          )}
          <p className="sidebar-foot">{t('Las ganancias son estimaciones; el beneficio realizado está en «Registro real».')}</p>
        </aside>
        <div className="content">
          <UpdateBanner />
          <ItemTipHost />
          <header className="topbar">
            <GlobalSearch />
            <ContextBar />
          </header>
          <main id="contenido" tabIndex={-1} className="fade-in" key={parts[0] ?? 'inicio'}>
            <WhatsNew hidden={parts[0] === 'changelog'} />
            {meta?.error &&<div className="alert bad" role="alert"><div><p><strong>{t('No se pudo conectar con la API:')}</strong> {meta.error}</p><p className="small">{t('Comprueba DATABASE_URL y que las migraciones estén aplicadas (npm run migrate).')}</p></div></div>}
            <Suspense fallback={<Loading rows={4} />}>{page}</Suspense>
          </main>
          <footer className="site">
            {t('Solo World of Warcraft: Forever. Precios: casas de subastas de la API de Blizzard y estadísticas regionales de TradeSkillMaster (importes en cobre).')}
            {' '}{t('Catálogo: Blizzard Game Data API. Iconos:')} <a href="https://www.wowhead.com/forever" rel="noopener noreferrer" target="_blank">{t('Wowhead (WoW Forever)')}</a> {t('y Blizzard; arte © Blizzard Entertainment.')}
            {' '}{t('Las ganancias son estimaciones condicionadas a vender al precio utilizado; no son beneficios realizados.')}
            <span className="footer-legal">
              {t('Web de fans sin relación con Blizzard Entertainment. World of Warcraft y Battle.net son marcas de Blizzard Entertainment, Inc.')}
              {' · '}<a href="#/privacidad">{t('Privacidad')}</a>{' · '}<a href="#/changelog">{t('Changelog')}</a>
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}

/** Contraseña de administrador (APP_PASSWORD): solo hace falta para cambiar datos compartidos. Se abre encima de la página. */
function Login({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancel]);
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
    <div className="login" role="dialog" aria-modal="true" aria-labelledby="login-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="card" onSubmit={submit}>
        <h1 id="login-title"><span className="brand-mark" aria-hidden="true"><LockKey size={20} weight="fill" /></span> {t('Modo administrador')}</h1>
        <p className="muted small">{t('Consultar la web no necesita contraseña. Solo hace falta para cambiar los ajustes, sincronizar precios y editar perfiles, fabricación o el registro, que son comunes para todos.')}</p>
        <label>
          {t('Contraseña')}
          <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
        </label>
        {err && <p className="alert bad" role="alert">{err}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={busy || !pw}>{busy ? t('Comprobando…') : t('Entrar')}</button>
          <button type="button" onClick={onCancel}>{t('Cancelar')}</button>
        </div>
      </form>
    </div>
  );
}

/** Se entra sin contraseña. La de administrador se pide al pulsar «Entrar como administrador» o cuando un cambio la necesita. */
function Gate() {
  const [auth, setAuth] = useState({ required: false, authenticated: true });
  const [showLogin, setShowLogin] = useState(false);
  useEffect(() => {
    api<{ required: boolean; authenticated: boolean }>('/api/auth/status').then(setAuth).catch(() => {}); // sin API, la app muestra su propio error
    const onAuth = () => { setAuth((a) => ({ ...a, authenticated: false })); setShowLogin(true); };
    window.addEventListener('auth-required', onAuth);
    return () => window.removeEventListener('auth-required', onAuth);
  }, []);
  const admin = auth.required && auth.authenticated;
  return (
    <AppProvider>
      <App
        onLogout={admin ? () => { api('/api/auth/logout', { method: 'POST' }).finally(() => setAuth({ required: true, authenticated: false })); } : undefined}
        onLogin={auth.required && !auth.authenticated ? () => setShowLogin(true) : undefined}
      />
      {showLogin && <Login onDone={() => { setAuth({ required: true, authenticated: true }); setShowLogin(false); }} onCancel={() => setShowLogin(false)} />}
    </AppProvider>
  );
}

// Entrar sin ruta (la dirección de la web a secas) lleva al inicio; los enlaces al comparador (#/…) siguen igual.
if (!location.hash) history.replaceState(null, '', '#/inicio');

// Con la web en inglés, primero se cargan los nombres del juego en inglés (una vez).
loadGameNames().finally(() => createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Gate />
  </React.StrictMode>,
));
