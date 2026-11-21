/**
 * Buscador global de la cabecera: escribe una receta o un objeto y salta a su página desde cualquier sección.
 * Recetas → detalle de la receta; objetos que se usan de material → «Materiales»; si no, la receta que lo fabrica.
 * Atajo: «/» (fuera de un campo de texto) pone el cursor en el buscador.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { api, useApp } from './lib.js';
import { WowIcon } from './icons.js';
import { MagnifyingGlass } from '@phosphor-icons/react';

interface Hit { key: string; href: string; name: string; sub: string; itemId: number | null; quality: string | null; kind?: 'profession' }

export function GlobalSearch() {
  const { ctx } = useApp();
  const [text, setText] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) { setHits(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api<any>(`/api/search?version=${ctx.version}&q=${encodeURIComponent(q)}`).then((r) => {
        if (!live) return;
        const list: Hit[] = [
          ...r.recipes.map((x: any) => ({ key: `r${x.id}`, href: `#/receta/${x.id}`, name: x.name, sub: `Receta · ${x.profession}`, itemId: x.itemId, quality: x.quality })),
          ...r.items.map((x: any) => ({
            key: `i${x.itemId}`, name: x.name, itemId: x.itemId, quality: x.quality,
            href: x.reagent || !x.recipeId ? `#/materiales/${x.itemId}` : `#/receta/${x.recipeId}`,
            sub: x.reagent ? 'Objeto · material' : x.recipeId ? 'Objeto · se fabrica' : 'Objeto',
          })),
        ];
        setHits(list); setActive(0);
      }).catch(() => live && setHits([]));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [text, ctx.version]);

  const go = (h: Hit) => { location.hash = h.href.slice(1); setText(''); setHits(null); setOpen(false); input.current?.blur(); };
  const show = open && hits !== null;
  return (
    <div className="gsearch" role="search">
      <label className="sr-only" htmlFor={`${listId}-in`}>Buscar una receta o un objeto</label>
      <span className="input-icon">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <input id={`${listId}-in`} ref={input} type="search" value={text} placeholder="Buscar receta u objeto  ( / )" autoComplete="off"
          role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={show && hits!.length ? `${listId}-${active}` : undefined}
          onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); return; }
            if (!show || !hits!.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits!.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); go(hits![active]); }
          }} />
      </span>
      {show && (
        <ul className="item-picker-list gsearch-list" role="listbox" id={listId}>
          {!hits!.length && <li className="gsearch-empty muted small" role="presentation">Nada con «{text.trim()}».</li>}
          {hits!.map((h, i) => (
            <li key={h.key} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); go(h); }} onMouseEnter={() => setActive(i)}>
              <WowIcon id={h.itemId} px={22} quality={h.quality} tip={false} />
              <span className="gsearch-text">
                <span style={h.quality ? { color: `var(--q-${h.quality.toLowerCase()})` } : undefined}>{h.name}</span>
                <span className="small muted">{h.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
