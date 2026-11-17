/**
 * Abrir y cerrar la ventana con la descripción de un objeto (ItemTipHost en ItemTooltip.tsx la dibuja).
 * Sin dependencias: lo usan los iconos (icons.tsx) sin crear importaciones circulares.
 */
import type React from 'react';

export type TipAnchor = { id: number; rect: DOMRect };
let listener: ((a: TipAnchor | null) => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function setItemTipListener(fn: ((a: TipAnchor | null) => void) | null) { listener = fn; }

/** Muestra la descripción del objeto junto a `el` (con retraso para no abrirla al cruzar la página con el ratón). */
export function showItemTip(id: number | null | undefined, el: Element, delay = 250) {
  clearTimeout(timer);
  if (!id) return;
  timer = setTimeout(() => listener?.({ id, rect: el.getBoundingClientRect() }), delay);
}
export function hideItemTip() {
  clearTimeout(timer);
  listener?.(null);
}

/** Propiedades para que un elemento abra la ventana: ratón (al pasar), toque (al tocar) y teclado (al enfocar). */
export function itemTipProps(id: number | null | undefined) {
  if (!id) return {};
  return {
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') showItemTip(id, e.currentTarget); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') hideItemTip(); },
    onPointerUp: (e: React.PointerEvent) => { if (e.pointerType !== 'mouse') showItemTip(id, e.currentTarget, 0); },
    onFocus: (e: React.FocusEvent) => showItemTip(id, e.currentTarget, 0),
    onBlur: () => hideItemTip(),
  };
}
