import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Q } from '../../src/engine/rational.js';
import { formatMoney, exactGold, formatPct } from '../../src/engine/format.js';
import { STATUS_LABEL, type Status } from '../../src/engine/calc.js';
import {
  CheckCircle, Question, WarningCircle, TrendDown, MinusCircle, Prohibit, Storefront, TrendUp, Warning, ArrowClockwise, Tray, type Icon,
} from '@phosphor-icons/react';

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

/** Casa de subastas por defecto: la del usuario (JcJ, Horda). */
export const DEFAULT_REALM = 'pvp-horde';
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
  // Solo WoW Forever. Un contexto guardado de otra versión (Retail, demo) se descarta.
  const [ctx, setCtxS] = useState<Ctx>(() => {
    const c = stored<Ctx | null>('ctx', null);
    return c && c.version === 'forever' ? { ...c, realm: c.realm ?? DEFAULT_REALM } : { version: 'forever', region: 'us', realm: DEFAULT_REALM };
  });
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
const STATUS_ICON: Record<Status, Icon> = {
  candidato: CheckCircle,
  demanda_incierta: Question,
  margen_insuficiente: WarningCircle,
  no_rentable: TrendDown,
  datos_insuficientes: MinusCircle,
  no_fabricable: Prohibit,
  no_vendible: Storefront,
};
/** Estado con texto + icono + color (nunca solo color). */
export function StatusBadge({ s }: { s: Status }) {
  const I = STATUS_ICON[s];
  return <span className={`badge ${STATUS_CLASS[s]}`}><I size={14} weight="bold" aria-hidden="true" />{STATUS_LABEL[s]}</span>;
}

/**
 * Ganancia o pérdida ESTIMADA: icono + etiqueta de texto + color. «Sin datos» si el valor es desconocido
 * (nunca 0). El beneficio realizado solo existe en el registro real.
 */
export function Delta({ v, tag = true }: { v: any; tag?: boolean }) {
  const q = toQ(v);
  if (!q) return <span className="delta none"><span>—</span>{tag && <span className="delta-tag">sin datos</span>}</span>;
  const sgn = q.sign();
  const cls = sgn > 0 ? 'pos' : sgn < 0 ? 'neg' : 'zero';
  const I = sgn > 0 ? TrendUp : sgn < 0 ? TrendDown : MinusCircle;
  return (
    <span className={`delta ${cls}`}>
      <I size={14} weight="bold" aria-hidden="true" />
      <span>{formatMoney(q)}{tag && <span className="delta-tag">{sgn > 0 ? 'ganancia' : sgn < 0 ? 'pérdida' : 'equilibrio'}</span>}</span>
    </span>
  );
}

export function Loading({ label = 'Cargando…', rows = 0 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite">
      <p className="muted"><span className="spinner" aria-hidden="true" /> {label}</p>
      {rows > 0 && <div className="skeleton-rows card" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <span key={i} />)}</div>}
    </div>
  );
}
export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="alert bad" role="alert">
      <Warning size={20} weight="bold" aria-hidden="true" />
      <div>
        <p><strong>Error:</strong> {error}</p>
        {onRetry && <button onClick={onRetry}><ArrowClockwise size={16} aria-hidden="true" />Reintentar</button>}
      </div>
    </div>
  );
}
export function Empty({ children, icon: I = Tray }: { children: React.ReactNode; icon?: Icon }) {
  return <div className="empty card"><I size={32} aria-hidden="true" /><div>{children}</div></div>;
}
export function PageHead({ title, children, icon }: { title: React.ReactNode; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className={icon ? 'title-with-icon' : undefined}>{icon}{title}</h1>
        {children && <p className="muted small">{children}</p>}
      </div>
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

export function GoldInput({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  let invalid = false;
  if (value.trim()) { try { Q.parse(value); } catch { invalid = true; } }
  return (
    <label className="field">
      {label}
      <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={invalid} />
      {invalid ? <span style={{ color: 'var(--color-bad)' }}>Número inválido</span> : hint ? <span className="small">{hint}</span> : null}
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
