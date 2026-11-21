/**
 * Personajes de Battle.net del usuario conectado, para las páginas que los usan sin ser «Mi personaje»
 * (Transmutaciones, Cambios del juego, Inicio). Sin conexión devuelve una lista vacía: nada se pide a Blizzard desde aquí.
 * El personaje elegido (solo su identificador interno) se recuerda en este navegador y se comparte con «Mi personaje».
 */
import { useEffect, useState } from 'react';
import { api } from './lib.js';

const KEY = 'mw-personaje';
const EVENT = 'personaje-elegido';

export function readChosen(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}
export function writeChosen(id: string) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENT));
}

export interface MyCharacter { id: string; name: string; className: string | null; raceName: string | null; level: number | null; surname?: string | null }

// Una sola petición por carga de página aunque varios componentes usen el hook.
let cache: Promise<{ connected: boolean; characters: MyCharacter[] }> | null = null;
function load() {
  cache ??= (async () => {
    try {
      const s = await api<any>('/api/battlenet/status');
      if (!s.connected) return { connected: false, characters: [] };
      const r = await api<any>('/api/me/characters');
      return { connected: true, characters: (r.characters ?? []) as MyCharacter[] };
    } catch { return { connected: false, characters: [] }; }
  })();
  return cache;
}

/** Conexión, personajes y el elegido (el guardado si sigue existiendo; si no, el primero). */
export function useMyCharacters() {
  const [state, setState] = useState<{ loading: boolean; connected: boolean; characters: MyCharacter[] }>({ loading: true, connected: false, characters: [] });
  const [chosen, setChosen] = useState(readChosen);
  useEffect(() => { let on = true; load().then((r) => on && setState({ loading: false, ...r })); return () => { on = false; }; }, []);
  useEffect(() => {
    const f = () => setChosen(readChosen());
    window.addEventListener(EVENT, f);
    return () => window.removeEventListener(EVENT, f);
  }, []);
  const current = state.characters.find((c) => c.id === chosen) ?? state.characters[0] ?? null;
  return { ...state, current, choose: (id: string) => writeChosen(id) };
}
