/**
 * «Cambios del juego»: mejoras (buffs), empeoramientos (nerfs) y correcciones de clases y razas de WoW Forever.
 * Fuente: hilos oficiales de Blizzard en los foros de EE. UU. (Discourse, `/t/{id}.json`), publicados por personal
 * de Blizzard. Solo se guardan los mensajes del personal. El texto de cada cambio es el original en inglés; la
 * clasificación (mejora / empeora / corrección / cambio) es automática a partir de ese texto.
 */
import type { Db } from './db.js';

export const FORUM_BASE = 'https://us.forums.blizzard.com/en/wow';
export const GAME_CHANGE_SOURCES = [
  { topicId: 2403040, kind: 'hotfix', label: 'Hotfixes de WoW Forever', firstPostOnly: true },
  { topicId: 2360696, kind: 'beta', label: 'Notas de desarrollo de la beta', firstPostOnly: false },
] as const;
export type SourceKind = (typeof GAME_CHANGE_SOURCES)[number]['kind'];

const CACHE_HOURS = 1;
const FETCH_TIMEOUT_MS = 10_000;

export const CLASS_ES: Record<string, string> = {
  Druid: 'Druida', Hunter: 'Cazador', Mage: 'Mago', Paladin: 'Paladín', Priest: 'Sacerdote',
  Rogue: 'Pícaro', Shaman: 'Chamán', Warlock: 'Brujo', Warrior: 'Guerrero',
};
export const RACE_ES: Record<string, string> = {
  Human: 'Humano', Dwarf: 'Enano', 'Night Elf': 'Elfo de la noche', Gnome: 'Gnomo', Orc: 'Orco',
  Undead: 'No-muerto', Tauren: 'Tauren', Troll: 'Trol', Skyborne: 'Skyborne',
};
export const SPEC_ES: Record<string, string> = {
  Balance: 'Equilibrio', Feral: 'Feral', Restoration: 'Restauración', 'Beast Mastery': 'Dominio de bestias',
  Marksmanship: 'Puntería', Survival: 'Supervivencia', Pets: 'Mascotas', Arcane: 'Arcano', Fire: 'Fuego',
  Frost: 'Escarcha', Holy: 'Sagrado', Protection: 'Protección', Retribution: 'Reprensión', Discipline: 'Disciplina',
  Shadow: 'Sombra', Assassination: 'Asesinato', Combat: 'Combate', Subtlety: 'Sutileza', Elemental: 'Elemental',
  Enhancement: 'Mejora', Affliction: 'Aflicción', Demonology: 'Demonología', Destruction: 'Destrucción',
  Arms: 'Armas', Fury: 'Furia',
};

export type Effect = 'mejora' | 'empeora' | 'mixto' | 'correccion' | 'cambio';
export interface GameChange {
  id: string;
  source: SourceKind;
  date: string; // YYYY-MM-DD
  section: string | null;
  /** Etiquetas de los niveles de la lista (clase, especialización, raza…), en inglés como en el original. */
  path: string[];
  text: string;
  /** Notas de los desarrolladores y detalles que cuelgan del cambio. */
  notes: string[];
  /** Cambio del que es un detalle (si va dentro de otro punto). */
  context: string | null;
  kind: 'clase' | 'raza';
  className: string | null;
  spec: string | null;
  race: string | null;
  effect: Effect;
  url: string;
}

// ---------- HTML mínimo (solo lo que usa el foro: p, h*, ul/ol, li, strong, em, a) ----------

interface Node { tag: string; children: Array<Node | string> }
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source']);

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

export function parseHtml(html: string): Node {
  const root: Node = { tag: 'root', children: [] };
  const stack: Node[] = [root];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|<!--[\s\S]*?-->|([^<]+)|</g;
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { top.children.push(decodeEntities(m[4])); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.map((n) => n.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    if (VOID.has(tag) || m[3]) { if (tag === 'br') top.children.push(' '); continue; }
    const n: Node = { tag, children: [] };
    top.children.push(n);
    stack.push(n);
  }
  return root;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
function textOf(n: Node | string, skip?: (n: Node) => boolean): string {
  if (typeof n === 'string') return n;
  if (skip?.(n)) return '';
  return n.children.map((c) => textOf(c, skip)).join('');
}
const elems = (n: Node) => n.children.filter((c): c is Node => typeof c !== 'string');
const isList = (n: Node) => n.tag === 'ul' || n.tag === 'ol';
/** Primer hijo con contenido (ignora espacios). */
function firstContent(n: Node): Node | string | undefined {
  return n.children.find((c) => typeof c !== 'string' || c.trim() !== '');
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export function parseDateHeading(s: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(clean(s));
  if (!m) return null;
  const mo = MONTHS.indexOf(m[1].toLowerCase());
  if (mo < 0) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

export interface RawChange { date: string; section: string | null; path: string[]; text: string; notes: string[]; context: string | null }

/**
 * Convierte un mensaje del foro en una lista de cambios. Los encabezados son `<p><strong>…</strong></p>` o `<h2>`:
 * una fecha («November 17, 2026») cambia la fecha; el nombre de una clase o raza abre un grupo dentro de la sección;
 * cualquier otro abre una sección. En las listas, `<li><strong>Nombre</strong><ul>…` es un grupo; un punto que solo
 * tiene cursiva es una nota de los desarrolladores del cambio anterior.
 */
export function parsePost(html: string, defaultDate: string): RawChange[] {
  const out: RawChange[] = [];
  let date = defaultDate;
  let section: string | null = null;
  let group: string | null = null;

  const walkList = (list: Node, path: string[], context: string | null) => {
    let prev: RawChange | null = null;
    for (const li of elems(list).filter((n) => n.tag === 'li')) {
      const sub = elems(li).filter(isList);
      const own = clean(textOf(li, isList));
      const first = firstContent(li);
      // «<li><strong>Druid</strong><ul>» o «<li><p><strong>Druid</strong></p><ul>».
      const lead = typeof first !== 'string' && first?.tag === 'p' ? firstContent(first) : first;
      const strongOnly = typeof lead !== 'string' && lead?.tag === 'strong' && clean(textOf(lead)) === own;
      const emOnly = typeof first !== 'string' && first?.tag === 'em' && clean(textOf(first)) === own;
      if (!own) { for (const l of sub) walkList(l, path, context); continue; }
      if (strongOnly && sub.length) { prev = null; for (const l of sub) walkList(l, [...path, own], context); continue; }
      if (emOnly) { if (prev) prev.notes.push(own); else if (context && out.length) out[out.length - 1].notes.push(own); continue; }
      const c: RawChange = { date, section, path, text: own, notes: [], context };
      out.push(c);
      prev = c;
      for (const l of sub) {
        // Los puntos de dentro: notas (cursiva) van al cambio; los demás son cambios con este como contexto.
        for (const s of elems(l).filter((n) => n.tag === 'li')) {
          const t = clean(textOf(s, isList));
          const f = firstContent(s);
          if (t && typeof f !== 'string' && f?.tag === 'em' && clean(textOf(f)) === t) c.notes.push(t);
          else if (t) out.push({ date, section, path, text: t, notes: [], context: own });
          for (const deeper of elems(s).filter(isList)) walkList(deeper, path, own);
        }
      }
    }
  };

  const heading = (n: Node): string | null => {
    if (/^h[1-6]$/.test(n.tag)) return clean(textOf(n));
    if (n.tag !== 'p') return null;
    const t = clean(textOf(n));
    const f = firstContent(n);
    return t && t.length <= 80 && typeof f !== 'string' && f?.tag === 'strong' && clean(textOf(f)) === t ? t : null;
  };

  for (const n of elems(parseHtml(html))) {
    if (isList(n)) { walkList(n, group ? [group] : [], null); continue; }
    const h = heading(n);
    if (!h) continue;
    const d = parseDateHeading(h);
    if (d) { date = d; section = null; group = null; }
    else if (CLASS_ES[h] || RACE_ES[h]) group = h;
    else { section = h; group = null; }
  }
  return out;
}

// ---------- Clasificación ----------

/** Cosas en las que un número más bajo es mejor para el jugador (se mira el texto de antes del número). */
const LOWER_IS_BETTER = /\b(cooldown|cost|costs|cast time|casting time|mana cost|delay|penalty|recharge|damage taken|at level|requires? level)\b/i;
/** «Reducción de coste», «de espera», «de daño»: aquí subir es mejor. */
const REDUCTION = /\b(cost|cooldown|damage|threat|mana cost|cast time) reduction\b|\breduction (to|of|in) [^.]{0,30}?(cooldown|cost|cast time)\b/gi;
const FIX = /\b(fixed|corrected|resolved)\b|\bbug\b|\bissue\b|now correctly|now properly|should now|should no longer|incorrectly|as intended|is intended/i;
const UP = /\b(increased|increases? to|raised|up from|buffed|doubled|tripled)\b/i;
const DOWN = /\b(reduced|decreased|lowered|down from|nerfed|halved)\b/i;
const LOSES = /\bremoved\b|\bno longer (provides|grants|increases|benefits|affects|applies|deals|generates|gives|stacks)\b/i;
const GAINS = /\bno longer (requires|costs|has a cooldown|breaks|triggers the global cooldown|consumes)\b/i;
const IS_NEW = /^(new|added|re-added)\b|^[^.:]{1,40}:\s*(new|added)\b/i;

const UNIT: Record<string, number> = { sec: 1, second: 1, seconds: 1, min: 60, minute: 60, minutes: 60, hour: 3600, hours: 3600 };
const unitKind = (u: string | undefined) => (!u ? null : u === '%' ? '%' : 'tiempo');
/** Un valor («6.6», «4/8/12/16/20») y su unidad opcional. */
const VAL = String.raw`(\d[\d,]*(?:\.\d+)?(?:\s*\/\s*\d[\d,]*(?:\.\d+)?)*)\s*(%|seconds?|sec|minutes?|min|hours?)?`;
const RE_WAS = new RegExp(VAL + String.raw`[^()\d]{0,60}\((?:was|from)\s+(?:incorrectly\s+)?` + VAL, 'i');
const RE_FROM_TO = new RegExp(String.raw`\bfrom\s+` + VAL + String.raw`\s*(?:\w+\s+)?to\s+` + VAL, 'i');
const RE_TO_FROM = new RegExp(String.raw`\bto\s+` + VAL + String.raw`\s*(?:\w+\s+)?from\s+` + VAL, 'i');
/** Valor de «4/8/12%» (el último rango), pasado a segundos si es un tiempo. */
function val(v: string, unit: string | undefined): number {
  const last = v.split('/').pop()!.trim().replace(/,/g, '');
  return Number(last) * (unit ? UNIT[unit.toLowerCase()] ?? 1 : 1);
}
/** Valor nuevo y anterior si el texto los da: «… 6.6% (was 3.3%)», «from 50% to 115%», «to 200% from 155%». */
export function numbersOf(t: string): { now: number; was: number; index: number } | null {
  if (/\brows?\b|\btier\b|\bcolumn\b/i.test(t)) return null; // mover un talento de sitio no es mejor ni peor
  const tries: Array<[RegExp, (m: RegExpExecArray) => [string, string | undefined, string, string | undefined]]> = [
    [RE_WAS, (m) => [m[1], m[2], m[3], m[4]]],
    [RE_FROM_TO, (m) => [m[3], m[4], m[1], m[2]]],
    [RE_TO_FROM, (m) => [m[1], m[2], m[3], m[4]]],
  ];
  for (const [re, get] of tries) {
    const m = re.exec(t);
    if (!m) continue;
    const [a, ua, b, ub] = get(m);
    const ka = unitKind(ua?.toLowerCase()), kb = unitKind(ub?.toLowerCase());
    if (ka && kb && ka !== kb) continue; // «4% con 3 s de espera (era 6%)»: no se comparan cosas distintas
    // Si solo un lado dice la unidad, se supone la misma en los dos.
    return { now: val(a, ua ?? ub), was: val(b, ub ?? ua), index: m.index };
  }
  return null;
}

const lowerBetter = (before: string) => LOWER_IS_BETTER.test(before.replace(REDUCTION, ''));

/** +1 mejora, -1 empeora, 0 sin señal, para una frase. */
function sentenceSignal(s: string): number {
  if (GAINS.test(s)) return 1;
  const lost = LOSES.exec(s);
  if (lost) return lowerBetter(s.slice(0, lost.index)) ? 1 : -1; // «cooldown removed» es una mejora
  const n = numbersOf(s);
  if (n && n.now !== n.was) return (n.now > n.was ? 1 : -1) * (lowerBetter(s.slice(0, n.index)) ? -1 : 1);
  const up = UP.exec(s), down = DOWN.exec(s);
  const kw = up && down ? (up.index < down.index ? up : down) : up ?? down;
  if (!kw) return 0;
  return (kw === up ? 1 : -1) * (lowerBetter(s.slice(0, kw.index)) ? -1 : 1);
}

/**
 * Mejora o empeora para el jugador de esa clase o raza, a partir del texto. Es una estimación: «Corrección» si
 * arregla un fallo; una habilidad o talento nuevo es una mejora; si no, cada frase da una señal por la dirección del
 * número (o de «increased/reduced», «removed»…), teniendo en cuenta que en esperas, costes y tiempos de lanzamiento
 * bajar es mejor. Si unas frases mejoran y otras empeoran, «Mixto». Sin señal, «Cambio».
 */
export function classify(text: string): Effect {
  if (FIX.test(text)) return 'correccion';
  if (IS_NEW.test(text)) return 'mejora';
  const signals = text.split(/(?<=[.;])\s+|\.\s*$/).map((s) => s.trim()).filter(Boolean).map(sentenceSignal).filter((x) => x !== 0);
  if (!signals.length) return 'cambio';
  if (signals.every((x) => x > 0)) return 'mejora';
  if (signals.every((x) => x < 0)) return 'empeora';
  return 'mixto';
}

// ---------- Filtrado a clases y razas ----------

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function toGameChange(c: RawChange, source: SourceKind, url: string): GameChange | null {
  if (c.section && /known issues/i.test(c.section)) return null;
  if (CLASS_ES[c.text] || RACE_ES[c.text] || SPEC_ES[c.text]) return null; // un título de grupo sin lista debajo
  const className = c.path.find((p) => CLASS_ES[p]) ?? null;
  const race = c.path.find((p) => RACE_ES[p]) ?? null;
  const sec = c.section ?? '';
  let kind: GameChange['kind'] | null = null;
  // Un hechizo racial de una clase (p. ej. Sacerdote > No-muerto) cuenta como de clase, con la raza indicada.
  if (className) kind = 'clase';
  else if (race || /\brac(e|es|ial)\b/i.test(sec)) kind = 'raza';
  else if (/^class(es)?\b/i.test(sec)) kind = 'clase';
  if (!kind) return null;
  const ci = className ? c.path.indexOf(className) : -1;
  const spec = ci >= 0 && c.path[ci + 1] && SPEC_ES[c.path[ci + 1]] ? c.path[ci + 1] : null;
  const effect = classify(c.text);
  return {
    id: hash(`${source}|${c.date}|${c.path.join('/')}|${c.context ?? ''}|${c.text}`),
    source, date: c.date, section: c.section, path: c.path, text: c.text, notes: c.notes, context: c.context,
    kind, className, spec, race, effect, url,
  };
}

export interface ForumPost { n: number; created: string; cooked: string }
export interface ForumTopic { topicId: number; title: string; posts: ForumPost[]; fetchedAt: string }

/** Cambios de clase y raza de un hilo, sin repetidos (el mismo texto el mismo día, o en la beta, el mismo texto). */
export function changesOfTopic(t: ForumTopic, src: { kind: SourceKind; firstPostOnly: boolean }): GameChange[] {
  const posts = src.firstPostOnly ? t.posts.filter((p) => p.n === 1) : t.posts;
  const seen = new Set<string>();
  const out: GameChange[] = [];
  for (const p of posts) {
    const url = `${FORUM_BASE}/t/${t.topicId}/${p.n}`;
    for (const raw of parsePost(p.cooked, p.created.slice(0, 10))) {
      const g = toGameChange(raw, src.kind, url);
      if (!g) continue;
      const key = src.kind === 'beta' ? `${g.path.join('/')}|${g.text}` : `${g.date}|${g.path.join('/')}|${g.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(g);
    }
  }
  return out;
}

// ---------- Descarga y copia en la base de datos ----------

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export async function fetchTopic(topicId: number, fetcher: Fetcher): Promise<ForumTopic> {
  const r = await fetcher(`${FORUM_BASE}/t/${topicId}.json`);
  if (!r.ok) throw new Error(`El foro de Blizzard respondió ${r.status}.`);
  const j = await r.json();
  const posts: ForumPost[] = (j?.post_stream?.posts ?? [])
    .filter((p: any) => p?.staff === true && typeof p.cooked === 'string' && p.cooked.length > 0)
    .map((p: any) => ({ n: Number(p.post_number), created: String(p.created_at), cooked: p.cooked }));
  return { topicId, title: String(j?.title ?? ''), posts, fetchedAt: new Date().toISOString() };
}

const defaultFetcher: Fetcher = (url) =>
  fetch(url, { headers: { accept: 'application/json', 'user-agent': 'mercado-wow-profesiones (web de consulta)' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

/** Hilo desde la copia guardada; si tiene más de una hora, se vuelve a pedir al foro (y si falla, se usa la copia). */
async function loadTopic(db: Db, topicId: number, fetcher: Fetcher, now: number): Promise<{ topic: ForumTopic | null; error: string | null; stale: boolean }> {
  const [row] = await db.query<{ title: string; posts: any; fetched_at: any }>(`select title, posts, fetched_at from forum_topic_cache where topic_id=$1`, [topicId]);
  const cached: ForumTopic | null = row
    ? { topicId, title: row.title, posts: typeof row.posts === 'string' ? JSON.parse(row.posts) : row.posts, fetchedAt: new Date(row.fetched_at).toISOString() }
    : null;
  if (cached && now - Date.parse(cached.fetchedAt) < CACHE_HOURS * 3600_000) return { topic: cached, error: null, stale: false };
  try {
    const t = await fetchTopic(topicId, fetcher);
    if (!t.posts.length) throw new Error('El hilo no tiene mensajes de Blizzard.');
    await db.query(
      `insert into forum_topic_cache(topic_id, title, posts, fetched_at) values ($1,$2,$3::text::jsonb,now())
       on conflict (topic_id) do update set title=excluded.title, posts=excluded.posts, fetched_at=excluded.fetched_at`,
      [topicId, t.title, JSON.stringify(t.posts)],
    );
    return { topic: t, error: null, stale: false };
  } catch (e) {
    return { topic: cached, error: (e as Error).message || 'No se pudo leer el foro de Blizzard.', stale: !!cached };
  }
}

export async function gameChanges(db: Db, opts: { fetcher?: Fetcher; now?: number } = {}) {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const now = opts.now ?? Date.now();
  const sources = [];
  const changes: GameChange[] = [];
  const loaded = await Promise.all(GAME_CHANGE_SOURCES.map((s) => loadTopic(db, s.topicId, fetcher, now)));
  for (const [i, s] of GAME_CHANGE_SOURCES.entries()) {
    const { topic, error, stale } = loaded[i];
    const list = topic ? changesOfTopic(topic, s) : [];
    changes.push(...list);
    sources.push({
      kind: s.kind, label: s.label, topicId: s.topicId, title: topic?.title ?? null,
      url: `${FORUM_BASE}/t/${s.topicId}`, fetchedAt: topic?.fetchedAt ?? null, changes: list.length, error, stale,
    });
  }
  changes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    sources, changes,
    classes: Object.entries(CLASS_ES).map(([en, es]) => ({ en, es })),
    races: Object.entries(RACE_ES).map(([en, es]) => ({ en, es })),
    specs: SPEC_ES,
    note: 'Texto original de Blizzard (en inglés). «Mejora» y «Empeora» se deducen del texto y pueden equivocarse: revisa el original.',
  };
}
