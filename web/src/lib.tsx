import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Q } from '../../src/engine/rational.js';
import { formatMoney, exactGold, formatPct } from '../../src/engine/format.js';
import { STATUS_LABEL, type Status } from '../../src/engine/calc.js';

export { Q, formatMoney, exactGold, formatPct, STATUS_LABEL };
export type { Status };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers: opts.body ? { 'content-type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo contactar con el servidor.');
  }
  const text = await res.text();
  let j: any = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* respuesta no JSON */ }
  if (res.status === 401 && j?.auth) window.dispatchEvent(new Event('auth-required'));
  if (!res.ok) throw new ApiError(res.status, j?.error ?? `Error HTTP ${res.status}`);
  return j as T;
}

/** Convierte {n,d} del servidor a Q; null se mantiene. */
export const toQ = (j: any): Q | null => (j && typeof j === 'object' && 'n' in j ? Q.fromJSON(j) : null);
export const money = (j: any) => formatMoney(toQ(j));
export const pct = (j: any) => formatPct(toQ(j));
/** ROI corto para tablas: aproximado, con el valor exacto en el título. */
export function PctShort({ v }: { v: any }) {
  const q = toQ(v);
  if (!q) return <>—</>;
  return <span title={`Exacto: ${formatPct(q)}`}>{q.isTerminating() ? '' : '≈ '}{q.toDecimal(1)} %</span>;
}

export interface Ctx { version: string; region: string; realm: string | null }

interface AppState {
  ctx: Ctx;
  setCtx: (c: Ctx) => void;
  profileId: string | null;
  setProfileId: (id: string | null) => void;
  meta: any | null;
  reloadMeta: () => void;
  ctxQuery: string;
}

const AppCtx = createContext<AppState | null>(null);
export const useApp = () => useContext(AppCtx)!;

function stored<T>(k: string, def: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}
function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* almacenamiento no disponible */ }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtxS] = useState<Ctx>(() => stored('ctx', { version: 'retail', region: 'us', realm: null }));
  const [profileId, setPid] = useState<string | null>(() => stored('profileId', null));
  const [meta, setMeta] = useState<any>(null);
  const reloadMeta = useCallback(() => {
    api('/api/meta').then(setMeta).catch((e) => setMeta({ error: e.message }));
  }, []);
  useEffect(reloadMeta, [reloadMeta]);
  const setCtx = (c: Ctx) => { setCtxS(c); save('ctx', c); };
  const setProfileId = (id: string | null) => { setPid(id); save('profileId', id); };
  const ctxQuery = new URLSearchParams({ version: ctx.version, region: ctx.region, ...(ctx.realm ? { realm: ctx.realm } : {}) }).toString();
  return <AppCtx.Provider value={{ ctx, setCtx, profileId, setProfileId, meta, reloadMeta, ctxQuery }}>{children}</AppCtx.Provider>;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: T | null }>({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && setState({ loading: false, error: null, data }),
      (e) => alive && setState({ loading: false, error: e.message ?? String(e), data: null }),
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

// --- Enrutado por hash ---------------------------------------------------
export function useRoute(): [string, string[]] {
  const [hash, setHash] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const path = hash.split('?')[0];
  return [path, path.split('/').filter(Boolean)];
}
export function hashQuery(): URLSearchParams {
  const h = location.hash.slice(1);
  const i = h.indexOf('?');
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
}
export function setHashQuery(path: string, q: URLSearchParams) {
  const s = q.toString();
  const next = `#${path}${s ? '?' + s : ''}`;
  if (location.hash !== next) history.replaceState(null, '', next);
  if (path === '/') { try { sessionStorage.setItem('lastComparator', next); } catch { /* sin almacenamiento */ } }
}

// --- Componentes comunes ------------------------------------------------
const STATUS_CLASS: Record<Status, string> = {
  candidato: 'b-ok',
  demanda_incierta: 'b-info',
  margen_insuficiente: 'b-warn',
  no_rentable: 'b-bad',
  datos_insuficientes: 'b-neutral',
  no_fabricable: 'b-neutral',
  no_vendible: 'b-neutral',
};
export function StatusBadge({ s }: { s: Status }) {
  return <span className={`badge ${STATUS_CLASS[s]}`}>{STATUS_LABEL[s]}</span>;
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <p role="status" className="muted"><span className="spinner" aria-hidden="true" /> {label}</p>;
}
export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="alert bad" role="alert">
      <p><strong>Error:</strong> {error}</p>
      {onRetry && <button onClick={onRetry}>Reintentar</button>}
    </div>
  );
}

export function age(h: number | null | undefined) {
  if (h === null || h === undefined) return 'sin datos';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} días`;
}
export function dt(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}
export const hoursSince = (iso: string | null | undefined) => (iso ? (Date.now() - Date.parse(iso)) / 3600000 : null);

export function DemoBanner() {
  const { ctx } = useApp();
  if (ctx.version !== 'demo') return null;
  return (
    <div className="alert demo" role="note">
      <p><span className="badge b-demo">DEMO</span> <strong>Datos ficticios.</strong> Objetos, recetas y precios inventados para probar la aplicación. No son resultados reales del juego.</p>
    </div>
  );
}

export function GoldInput({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  let invalid = false;
  if (value.trim()) { try { Q.parse(value); } catch { invalid = true; } }
  return (
    <label className="field">
      {label}
      <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={invalid} />
      {invalid ? <span style={{ color: 'var(--bad)' }}>Número inválido</span> : hint ? <span className="small">{hint}</span> : null}
    </label>
  );
}

// --- Plan local (borrador del usuario) ------------------------------------
export interface DraftEntry { recipeId: number; name: string; amount: number; mode: 'ejecuciones' | 'unidades' }
export function getDraft(): DraftEntry[] { return stored('planDraft', []); }
export function setDraft(d: DraftEntry[]) { save('planDraft', d); }
export function addToDraft(e: DraftEntry) {
  const d = getDraft();
  const i = d.findIndex((x) => x.recipeId === e.recipeId);
  if (i >= 0) d[i] = { ...d[i], amount: d[i].amount + e.amount };
  else d.push(e);
  setDraft(d);
}
