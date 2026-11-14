/**
 * Ficha del personaje como el panel del juego: retrato de Blizzard en el centro y el equipo puesto alrededor, tal como
 * estaba al pulsar «Actualizar desde Blizzard». Cada pieza muestra su información al pasar el ratón, enfocarla o tocarla.
 * Debajo, las profesiones como tarjetas con barra de progreso que llevan directamente a su ruta.
 */
import React, { useEffect, useRef, useState } from 'react';
import { dt, age, hoursSince } from '../lib.js';
import { WowIcon } from '../icons.js';
import { ArrowsClockwise, Lightning, PencilSimple, Warning, UserCircle } from '@phosphor-icons/react';

const SLOT_ES: Record<string, string> = {
  HEAD: 'Cabeza', NECK: 'Cuello', SHOULDER: 'Hombros', BACK: 'Espalda', CHEST: 'Pecho', SHIRT: 'Camisa', TABARD: 'Tabardo', WRIST: 'Muñecas',
  HANDS: 'Manos', WAIST: 'Cintura', LEGS: 'Piernas', FEET: 'Pies', FINGER_1: 'Dedo', FINGER_2: 'Dedo', TRINKET_1: 'Abalorio', TRINKET_2: 'Abalorio',
  MAIN_HAND: 'Mano derecha', OFF_HAND: 'Mano izquierda', RANGED: 'A distancia', AMMO: 'Munición',
};
const LEFT = ['HEAD', 'NECK', 'SHOULDER', 'BACK', 'CHEST', 'SHIRT', 'TABARD', 'WRIST'];
const RIGHT = ['HANDS', 'WAIST', 'LEGS', 'FEET', 'FINGER_1', 'FINGER_2', 'TRINKET_1', 'TRINKET_2'];
const BOTTOM = ['MAIN_HAND', 'OFF_HAND', 'RANGED', 'AMMO'];
/** Ranuras que no cuentan para el nivel de objeto medio (como en el juego). */
const NO_ILVL = new Set(['SHIRT', 'TABARD', 'AMMO']);

/** Nombres en español por id de profesión de Blizzard (la API de Forever los da en inglés). */
export const PROFESSION_NAME_ES: Record<number, string> = {
  171: 'Alquimia', 164: 'Herrería', 333: 'Encantamiento', 202: 'Ingeniería', 182: 'Herboristería', 165: 'Peletería',
  186: 'Minería', 393: 'Desuello', 197: 'Sastrería', 185: 'Cocina', 129: 'Primeros auxilios', 356: 'Pesca',
};

const QUALITY_ES: Record<string, string> = { POOR: 'Pobre', COMMON: 'Común', UNCOMMON: 'Poco común', RARE: 'Raro', EPIC: 'Épico', LEGENDARY: 'Legendario' };
const factionEs = (f: string | null) => (f === 'HORDE' ? 'Horda' : f === 'ALLIANCE' ? 'Alianza' : f);

function ItemTip({ it, side }: { it: any; side: 'right' | 'left' | 'up' }) {
  const q = it.quality ? `q-${String(it.quality).toLowerCase()}` : '';
  return (
    <div className={`pc-tip pc-tip-${side}`} role="tooltip">
      <p className={`pc-tip-name ${q}`}>{it.name ?? `Objeto ${it.itemId}`}</p>
      {it.itemLevel !== null && <p className="pc-tip-ilvl">Nivel de objeto {it.itemLevel}</p>}
      {it.binding && <p>{it.binding}</p>}
      <p className="pc-tip-row"><span>{it.slotName ?? SLOT_ES[it.slot]}</span><span>{it.subclass ?? ''}</span></p>
      {it.armor && <p>{it.armor}</p>}
      {it.stats.map((s: string, i: number) => <p key={i} className="pc-tip-stat">{s}</p>)}
      {it.durability && <p>{it.durability}</p>}
      {it.requirement && <p>{it.requirement}</p>}
      {it.quantity > 1 && <p>Cantidad: {it.quantity}</p>}
      {it.quality && <p className="small muted">{QUALITY_ES[it.quality] ?? it.quality}</p>}
    </div>
  );
}

function Slot({ slot, it, side, open, setOpen }: { slot: string; it: any | undefined; side: 'right' | 'left' | 'up'; open: string | null; setOpen: (s: string | null) => void }) {
  const label = SLOT_ES[slot] ?? slot;
  if (!it) {
    return <li className="pc-slot pc-slot-empty" title={`${label}: vacío`}><span className="pc-slot-frame" aria-hidden="true" /><span className="sr-only">{label}: vacío</span></li>;
  }
  const isOpen = open === slot;
  const lastPointer = useRef('');
  return (
    <li
      className={`pc-slot${isOpen ? ' open' : ''}`}
      // Ratón: se abre al pasar por encima. Toque: el primer toque abre la ficha y el segundo abre Wowhead.
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(slot); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(null); }}
      onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
    >
      <a
        href={`https://www.wowhead.com/forever/item=${it.itemId}`} target="_blank" rel="noreferrer"
        aria-label={`${label}: ${it.name ?? `objeto ${it.itemId}`}${it.itemLevel !== null ? `, nivel de objeto ${it.itemLevel}` : ''} (abre Wowhead)`}
        onFocus={() => setOpen(slot)} onBlur={() => { if (lastPointer.current !== 'touch') setOpen(null); }}
        onClick={(e) => { if (lastPointer.current !== 'mouse' && lastPointer.current !== '' && !isOpen) { e.preventDefault(); setOpen(slot); } }}
      >
        <WowIcon id={it.itemId} px={44} quality={it.quality} className="pc-slot-icon" />
      </a>
      {isOpen && <div onClick={() => setOpen(null)}><ItemTip it={it} side={side} /></div>}
    </li>
  );
}

export function CharacterSheet({ c, busy, onSync }: { c: any; busy: boolean; onSync: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => setImgOk(true), [c.media?.main]);
  const bySlot = new Map<string, any>((c.equipment ?? []).map((it: any) => [it.slot, it]));
  const counted = (c.equipment ?? []).filter((it: any) => !NO_ILVL.has(it.slot) && it.itemLevel !== null);
  const avgIlvl = counted.length ? Math.round(counted.reduce((s: number, it: any) => s + it.itemLevel, 0) / counted.length) : null;
  const neverRead = !c.profileSyncedAt;
  return (
    <section className="card pc-sheet" aria-label={`Ficha de ${c.name}`}>
      <header className="pc-sheet-head">
        <div>
          <h2 className="pc-sheet-name">{c.name}{c.surname ? ` ${c.surname}` : ''}</h2>
          <p className="pc-sheet-sub">
            {[c.level !== null ? `Nivel ${c.level}` : null, c.raceName, c.className].filter(Boolean).join(' · ')}
            {c.faction && <span className={`pc-faction ${c.faction === 'HORDE' ? 'horde' : c.faction === 'ALLIANCE' ? 'alliance' : ''}`}>{factionEs(c.faction)}</span>}
          </p>
          {c.guild && <p className="pc-guild">&lt;{c.guild}&gt;</p>}
        </div>
        <div className="pc-sheet-sync">
          <button type="button" className="primary" onClick={onSync} disabled={busy}>
            <ArrowsClockwise size={18} aria-hidden="true" className={busy ? 'spin' : ''} />{busy ? 'Leyendo de Blizzard…' : 'Actualizar desde Blizzard'}
          </button>
          <span className="small muted">
            {neverRead ? 'Aún no se ha leído la ficha.' : <>Equipo y retrato de hace {age(hoursSince(c.profileSyncedAt))} <span className="sr-only">({dt(c.profileSyncedAt)})</span></>}
          </span>
        </div>
      </header>
      {c.profileDetail && <p className="small lv-warn-text"><Warning size={14} aria-hidden="true" /> {c.profileDetail}</p>}

      <div className="pc-doll" onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}>
        <ul className="pc-slots pc-left" aria-label="Equipo: lado izquierdo">
          {LEFT.map((s) => <Slot key={s} slot={s} it={bySlot.get(s)} side="right" open={open} setOpen={setOpen} />)}
        </ul>
        <figure className="pc-portrait">
          {c.media?.main && imgOk ? (
            <img src={c.media.main} alt={`Retrato de ${c.name} con su equipo actual`} onError={() => setImgOk(false)} referrerPolicy="no-referrer" />
          ) : (
            <div className="pc-portrait-empty">
              <UserCircle size={72} weight="thin" aria-hidden="true" />
              <span className="small muted">{neverRead ? 'Pulsa «Actualizar desde Blizzard» para ver el retrato y el equipo.' : 'Blizzard no dio retrato para este personaje.'}</span>
            </div>
          )}
          {avgIlvl !== null && <figcaption className="pc-ilvl"><span>{avgIlvl}</span> nivel de objeto medio</figcaption>}
        </figure>
        <ul className="pc-slots pc-right" aria-label="Equipo: lado derecho">
          {RIGHT.map((s) => <Slot key={s} slot={s} it={bySlot.get(s)} side="left" open={open} setOpen={setOpen} />)}
        </ul>
        <ul className="pc-slots pc-bottom" aria-label="Armas">
          {BOTTOM.map((s) => <Slot key={s} slot={s} it={bySlot.get(s)} side="up" open={open} setOpen={setOpen} />)}
        </ul>
      </div>
      {!neverRead && <p className="small muted pc-doll-note">Pasa el ratón o toca una pieza para ver sus datos. El equipo es el que tenía el personaje la última vez que lo actualizaste.</p>}
    </section>
  );
}

/** Profesiones como tarjetas: nivel / máximo con barra; las de fabricación llevan a su ruta. */
export function ProfessionTiles({ c, plannable, onPlan, onEdit }: { c: any; plannable: Set<number>; onPlan: (pid: number) => void; onEdit: (p: any | null) => void }) {
  const list = [...c.professions].sort((a: any, b: any) => Number(plannable.has(b.professionId)) - Number(plannable.has(a.professionId)));
  return (
    <ul className="pc-tiles">
      {list.map((p: any) => {
        const skill = p.effective.skillPoints;
        const max = p.effective.maxSkillPoints;
        const ratio = skill !== null && max ? Math.min(1, skill / max) : 0;
        const can = plannable.has(p.professionId);
        const name = PROFESSION_NAME_ES[p.professionId] ?? p.name ?? `Profesión ${p.professionId}`;
        return (
          <li key={p.professionId} className="pc-tile">
            <div className="pc-tile-head">
              <WowIcon kind="profession" id={p.professionId} px={36} />
              <div>
                <p className="pc-tile-name">{name}</p>
                <p className="pc-tile-skill"><strong>{skill ?? '—'}</strong> / {max ?? '—'} {p.effective.source === 'manual' && <span className="badge b-info">Manual</span>}</p>
              </div>
            </div>
            <div className="pc-bar" role="progressbar" aria-label={`${name}: ${skill ?? 'sin dato'} de ${max ?? 'sin dato'}`} aria-valuemin={0} aria-valuemax={max ?? 0} aria-valuenow={skill ?? 0}>
              <span style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            {skill !== null && max !== null && skill >= max && max < 300 && <p className="small lv-warn-text">Tope alcanzado: aprende el siguiente rango en el instructor.</p>}
            <div className="pc-tile-actions">
              {can
                ? <button type="button" className="primary" onClick={() => onPlan(p.professionId)}><Lightning size={16} aria-hidden="true" />Ruta para subirla</button>
                : <span className="small muted">Se sube recolectando: sin ruta de fabricación.</span>}
              <button type="button" className="link" onClick={() => onEdit(p)}><PencilSimple size={14} aria-hidden="true" />Corregir</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Desplaza la vista a un elemento cuando cambia `trigger`. */
export function useScrollTo<T extends HTMLElement>(trigger: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => { if (trigger) ref.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }, [trigger]);
  return ref;
}

