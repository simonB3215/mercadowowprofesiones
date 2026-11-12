/**
 * Capa central de iconos de WoW en la interfaz.
 *  - Los iconos se piden por id real al servidor (/api/assets), que los resolvió y verificó
 *    contra Wowhead (WoW Forever) y Blizzard (ver src/server/assets.ts).
 *  - Las peticiones se agrupan (una por ciclo de render) y se guardan en caché por id y tamaño.
 *  - Si la imagen falla: se prueba UNA vez el icono oficial de Blizzard y, si también falla,
 *    se muestra un marcador neutro del mismo tamaño. No hay reintentos ni saltos de diseño.
 * Para iconos de interfaz (buscar, filtrar, ordenar…) se usa Phosphor, nunca emojis.
 */
import React, { useEffect, useState } from 'react';

type Kind = 'item' | 'profession';
type Size = 'small' | 'medium' | 'large';
export interface Asset { source: string; src: string | null; fallback: string | null; page: string | null }

const cache = new Map<string, Asset | null>();
const waiting = new Map<string, Array<(a: Asset | null) => void>>();
let queue: Record<Size, { items: Set<number>; professions: Set<number> }> | null = null;

const key = (k: Kind, id: number, s: Size) => `${k}:${id}:${s}`;

function flush() {
  const q = queue!;
  queue = null;
  for (const size of Object.keys(q) as Size[]) {
    const { items, professions } = q[size];
    const chunks: Array<[number[], number[]]> = [];
    const it = [...items];
    const pr = [...professions];
    for (let i = 0; i < Math.max(it.length, pr.length, 1); i += 250) chunks.push([it.slice(i, i + 250), pr.slice(i, i + 250)]);
    for (const [ci, cp] of chunks) {
      if (!ci.length && !cp.length) continue;
      fetch(`/api/assets?size=${size}&items=${ci.join(',')}&professions=${cp.join(',')}`)
        .then((r) => (r.ok ? r.json() : { items: {}, professions: {} }))
        .catch(() => ({ items: {}, professions: {} }))
        .then((j: any) => {
          const done = (k: Kind, ids: number[], map: Record<number, Asset>) => {
            for (const id of ids) {
              const kk = key(k, id, size);
              const a = map?.[id] ?? null;
              cache.set(kk, a);
              for (const cb of waiting.get(kk) ?? []) cb(a);
              waiting.delete(kk);
            }
          };
          done('item', ci, j.items);
          done('profession', cp, j.professions);
        });
    }
  }
}

function request(k: Kind, id: number, s: Size, cb: (a: Asset | null) => void) {
  const kk = key(k, id, s);
  const list = waiting.get(kk);
  if (list) { list.push(cb); return; }
  waiting.set(kk, [cb]);
  if (!queue) {
    queue = { small: { items: new Set(), professions: new Set() }, medium: { items: new Set(), professions: new Set() }, large: { items: new Set(), professions: new Set() } };
    setTimeout(flush, 0);
  }
  (k === 'item' ? queue[s].items : queue[s].professions).add(id);
}

export function useAsset(kind: Kind, id: number | null | undefined, size: Size): Asset | null | undefined {
  const kk = id ? key(kind, id, size) : '';
  const [a, setA] = useState<Asset | null | undefined>(() => (id ? cache.get(kk) : null));
  useEffect(() => {
    if (!id) { setA(null); return; }
    if (cache.has(kk)) { setA(cache.get(kk)); return; }
    let alive = true;
    setA(undefined);
    request(kind, id, size, (x) => alive && setA(x));
    return () => { alive = false; };
  }, [kk]);
  return a;
}

const QUALITY_CLASS: Record<string, string> = {
  POOR: 'q-poor', COMMON: 'q-common', UNCOMMON: 'q-uncommon', RARE: 'q-rare', EPIC: 'q-epic', LEGENDARY: 'q-legendary',
};

/** Marcador neutro (sin imagen): mismo tamaño que el icono, para no mover el diseño. */
function Placeholder() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
      <path d="M9 10.2a3 3 0 1 1 3.8 2.9c-.5.2-.8.6-.8 1.1v.6M12 17.2v.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Icono de un objeto o profesión de WoW Forever por id. Es decorativo (alt vacío): el nombre
 * va siempre al lado en texto. `px` es el tamaño mostrado; se descarga la imagen más pequeña que lo cubre.
 */
export function WowIcon({ kind = 'item', id, px = 28, quality, className = '' }: { kind?: Kind; id: number | null | undefined; px?: number; quality?: string | null; className?: string }) {
  const size: Size = px <= 18 ? 'small' : px <= 36 ? 'medium' : 'large';
  const a = useAsset(kind, id, size);
  const [stage, setStage] = useState<0 | 1 | 2>(0); // 0 principal, 1 respaldo de Blizzard, 2 marcador neutro
  useEffect(() => setStage(0), [a?.src]);
  const src = !a ? null : stage === 0 ? a.src : stage === 1 ? a.fallback : null;
  const onError = () => setStage((s) => (s === 0 && a?.fallback ? 1 : 2));
  const q = quality ? QUALITY_CLASS[quality] ?? '' : '';
  return (
    <span className={`wow-icon ${q} ${className}`} style={{ width: px, height: px }} data-source={a?.source ?? (a === undefined ? 'cargando' : 'ninguno')}>
      {src ? (
        <img src={src} width={px} height={px} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={onError} />
      ) : a === undefined ? null : (
        <Placeholder />
      )}
    </span>
  );
}

/** Nombre con icono: el texto siempre está presente aunque la imagen falle. */
export function ItemLabel({ id, name, quality, href, px = 28, sub }: { id: number | null | undefined; name: React.ReactNode; quality?: string | null; href?: string; px?: number; sub?: React.ReactNode }) {
  const label = href ? <a href={href}>{name}</a> : <span>{name}</span>;
  // Como en el juego, el nombre toma el color de la calidad del objeto (si se conoce).
  const q = quality ? QUALITY_CLASS[quality] ?? '' : '';
  return (
    <span className={`item-label ${q}`.trim()}>
      <WowIcon id={id} px={px} quality={quality} />
      <span className="item-label-text">
        {label}
        {sub && <span className="small muted">{sub}</span>}
      </span>
    </span>
  );
}
