/**
 * Elegir un objeto escribiendo su nombre (o su ID, si se conoce). Sugiere hasta 20 objetos del catálogo.
 * Llama a `onPick` con el ID y el nombre elegidos; `onPick(null)` al borrar el texto.
 */
import React, { useEffect, useId, useState } from 'react';
import { api, useApp } from './lib.js';
import { WowIcon } from './icons.js';
import { MagnifyingGlass } from '@phosphor-icons/react';

interface Hit { item_id: number; name: string; quality: string | null }

export function ItemPicker({ label, value, onPick }: { label: string; value: { id: number; name: string } | null; onPick: (v: { id: number; name: string } | null) => void }) {
  const { ctx } = useApp();
  const [text, setText] = useState(value?.name ?? '');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  useEffect(() => { setText(value?.name ?? ''); }, [value?.id]);
  useEffect(() => {
    const q = text.trim();
    if (value && q === value.name) { setHits([]); return; }
    if (/^\d+$/.test(q)) { setHits([]); return; }
    if (q.length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => {
      api(`/api/items?version=${ctx.version}&search=${encodeURIComponent(q)}`).then((r) => { if (live) { setHits(r.items); setActive(-1); } }).catch(() => live && setHits([]));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [text, ctx.version]);

  const pick = (h: Hit) => { onPick({ id: h.item_id, name: h.name }); setText(h.name); setOpen(false); setHits([]); };
  const change = (v: string) => {
    setText(v); setOpen(true);
    const q = v.trim();
    if (!q) onPick(null);
    else if (/^\d+$/.test(q)) onPick({ id: Number(q), name: `Objeto ${q}` });
    else if (value) onPick(null);
  };
  const show = open && hits.length > 0;
  return (
    <label className="field item-picker">{label}
      <span className="input-icon">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <input type="text" value={text} placeholder="Escribe el nombre" autoComplete="off" role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => change(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!show) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(hits[active]); }
            else if (e.key === 'Escape') setOpen(false);
          }} />
      </span>
      {show && (
        <ul className="item-picker-list" role="listbox" id={listId}>
          {hits.map((h, i) => (
            <li key={h.item_id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(h); }}>
              <WowIcon id={h.item_id} px={20} quality={h.quality} /><span style={h.quality ? { color: `var(--q-${h.quality.toLowerCase()})` } : undefined}>{h.name}</span>
            </li>
          ))}
        </ul>
      )}
      {value && <span className="small muted">Elegido: {value.name}</span>}
    </label>
  );
}
