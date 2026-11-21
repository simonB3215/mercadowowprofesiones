/**
 * Idioma de la web: español (por defecto) o inglés. El texto en español es la clave; `EN` da su traducción.
 * El idioma se guarda en este navegador ('mw-idioma'); al cambiarlo se recarga la página para que todo se pinte de nuevo.
 * Uso: t('Se usa en {n} recetas', { n: 3 }). Un texto sin traducción se muestra en español (nunca vacío).
 */
import { EN } from './i18n-en.js';

export type Lang = 'es' | 'en';
const KEY = 'mw-idioma';

function initial(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'es' || v === 'en') return v;
  } catch { /* sin almacenamiento */ }
  return 'es';
}

let current: Lang = typeof window === 'undefined' ? 'es' : initial();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const lang = (): Lang => current;
export const isEn = () => current === 'en';
/** Locale para fechas y números. */
export const locale = () => (current === 'en' ? 'en-US' : 'es-ES');

export function setLang(l: Lang, reload = true) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* sin almacenamiento */ }
  if (reload && typeof location !== 'undefined') location.reload();
}

/** Solo para pruebas: cambia el idioma sin recargar. */
export function _setLangForTest(l: Lang) { current = l; }

/** Nombres de datos del juego en inglés ({español → inglés}), de /api/names. Solo se cargan con la web en inglés. */
let NAMES: Record<string, string> = {};
export async function loadGameNames(version = 'forever') {
  if (current !== 'en') return;
  try {
    const r = await fetch(`/api/names?version=${encodeURIComponent(version)}`);
    if (r.ok) NAMES = ((await r.json()) as any).names ?? {};
  } catch { /* sin red: se quedan en español */ }
}
export function _setNamesForTest(n: Record<string, string>) { NAMES = n; }

/** Campos de las respuestas de la API que llevan nombres de datos del juego. */
const NAME_KEY = /^(name|profession|tier|category|label|title|zone|realmLabel)$|Name$/;
/** Campos con frases del servidor (motivos, notas, avisos): se traducen con el diccionario o las plantillas. */
const TEXT_KEY = /^(reasons|reason|notes|warnings|blockers|errors|error|detail|channelReason|staleDetail|sellableReason|notIncluded|algorithm|message)$/;
/** Respuesta de la API con los nombres del juego en el idioma elegido (en español no cambia nada). */
export function translateData<T>(x: T): T {
  if (current !== 'en') return x;
  const walk = (v: any, key: string | null): any => {
    if (typeof v === 'string') {
      if (key && NAME_KEY.test(key)) return NAMES[v] ?? EN[v] ?? patterned(v) ?? v;
      if (key && TEXT_KEY.test(key)) return EN[v] ?? patterned(v) ?? v;
      return v;
    }
    if (Array.isArray(v)) return v.map((e) => walk(e, key));
    if (v && typeof v === 'object') {
      if ('n' in v && 'd' in v && Object.keys(v).length === 2) return v; // importes {n,d}
      const out: any = {};
      for (const [k, e] of Object.entries(v)) out[k] = walk(e, k);
      return out;
    }
    return v;
  };
  return walk(x, null);
}

/** Textos con datos dentro que llegan del servidor (casas de subastas, etc.). */
const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^(Normal|JcJ|Rol|Rol JcJ) — (Alianza|Horda|Aguasnegras \(neutral\))$/, (m) => `${({ Normal: 'Normal', JcJ: 'PvP', Rol: 'RP', 'Rol JcJ': 'RP PvP' } as any)[m[1]]} — ${({ Alianza: 'Alliance', Horda: 'Horde', 'Aguasnegras (neutral)': 'Blackwater (neutral)' } as any)[m[2]]}`],
  [/^Casa de subastas (.+)$/, (m) => `Auction house ${patterned(m[1]) ?? m[1]}`],
  // Duraciones del motor (cooldownLabel / durationLabel).
  [/^(\d+) (min|h|días|día)(?: y (\d+) h)?$/, (m) => `${m[1]} ${({ min: 'min', h: 'h', 'días': 'days', 'día': 'day' } as any)[m[2]]}${m[3] ? ` and ${m[3]} h` : ''}`],
  [/^Falta precio de (\d+) material\(es\): (.+)\.$/, (m) => `Missing price for ${m[1]} material(s): ${m[2].split(', ').map(tn).join(', ')}.`],
  [/^La ganancia por lote es (cero|negativa) con el precio utilizado\.$/, (m) => `Profit per batch is ${m[1] === 'cero' ? 'zero' : 'negative'} at the price used.`],
  [/^Beneficio positivo, pero (.+)\.$/, (m) => `Positive profit, but ${m[1].split(' y ').map(tn).join(' and ')}.`],
  [/^Tasa de venta regional (\S+) por debajo del mínimo (\S+)\.$/, (m) => `Regional sale rate ${m[1]} below the minimum ${m[2]}.`],
  [/^Volumen diario regional (\S+) por debajo del mínimo (\S+)\.$/, (m) => `Regional daily volume ${m[1]} below the minimum ${m[2]}.`],
  [/^precios de la casa de subastas con (\S+) h \(máx\. (\S+) h\)$/, (m) => `auction house prices ${m[1]} h old (max. ${m[2]} h)`],
  [/^estadísticas regionales con (\S+) h \(máx\. (\S+) h\)$/, (m) => `regional statistics ${m[1]} h old (max. ${m[2]} h)`],
  [/^Datos fuera de vigencia: (.+)\.$/, (m) => `Stale data: ${m[1].split('; ').map(tn).join('; ')}.`],
  [/^Las señales de demanda tienen (\S+) h, por encima del máximo configurado\.$/, (m) => `Demand signals are ${m[1]} h old, above the configured maximum.`],
  [/^Reutilización de (.+?) \(Wowhead\): como máximo una fabricación cada (.+?)\. La ganancia es por fabricación; no se puede repetir seguida\.$/, (m) => `${tn(m[1])} cooldown (Wowhead): at most one craft every ${tn(m[2])}. Profit is per craft; it cannot be repeated back to back.`],
  [/^Variante asumida manualmente: (.+)$/, (m) => `Variant assumed manually: ${m[1]}`],
  [/^Precio de venta atípico: (\S+) veces el valor regional de TSM\. Probablemente una publicación aislada; no se toma como ganancia fiable\.$/, (m) => `Atypical sale price: ${m[1]} times the TSM regional value. Probably a single listing; not taken as reliable profit.`],
  [/^Precio de venta sin confirmar: ROI de más del (\S+) % y TSM no tiene precio regional para comparar\. Puede ser una sola publicación\.$/, (m) => `Unconfirmed sale price: ROI above ${m[1]} % and TSM has no regional price to compare. It may be a single listing.`],
  [/^El resultado se liga al recogerlo \((.+)\)\.$/, (m) => `The result binds on pickup (${m[1]}).`],
  [/^El resultado está ligado a la cuenta \((.+)\)\.$/, (m) => `The result is account-bound (${m[1]}).`],
  [/^Vinculación "(.+)" sin observaciones en subasta para este mercado\.$/, (m) => `Binding "${m[1]}" with no auction observations for this market.`],
  [/^La diferencia es menor del (\S+) %: elige lo que te sea más cómodo\.$/, (m) => `The difference is under ${m[1]} %: pick whichever is easier for you.`],
  [/^Ruta más rápida entre (\d+) evaluadas que cabe en el presupuesto \(heurística; no se garantiza el óptimo global\)\.$/, (m) => `Fastest route among ${m[1]} evaluated that fits the budget (heuristic; the global optimum is not guaranteed).`],
  [/^(.+): hace falta nivel de personaje (\d+) antes de pasar de (\d+) \(según las reglas de Classic\)\.$/, (m) => `${tn(m[1])}: character level ${m[2]} needed before going past ${m[3]} (based on Classic rules).`],
  [/^Descargado hace (\d+) min; las fuentes se actualizan cada hora o más\.$/, (m) => `Downloaded ${m[1]} min ago; sources update every hour or more.`],
  [/^(.+): no vendible en subasta\.$/, (m) => `${tn(m[1])}: not sellable on the auction house.`],
  [/^(.+): reutilización de (.+?)\. (\d+) fabricaciones necesitan al menos (.+?) \(una cada (.+?)\)\.$/, (m) => `${tn(m[1])}: ${tn(m[2])} cooldown. ${m[3]} crafts need at least ${tn(m[4])} (one every ${tn(m[5])}).`],
  [/^Cantidad inválida para (.+)\.$/, (m) => `Invalid quantity for ${tn(m[1])}.`],
  [/^(.+): la cantidad debe ser un entero mayor que 0\.$/, (m) => `${tn(m[1])}: the quantity must be a whole number greater than 0.`],
  [/^(.+): rendimiento desconocido o inválido\.$/, (m) => `${tn(m[1])}: unknown or invalid yield.`],
];
/** Trozo de una frase: nombre del juego, texto del diccionario o plantilla. */
function tn(x: string): string { return NAMES[x] ?? EN[x] ?? patterned(x) ?? x; }
function patterned(s: string): string | null {
  for (const [re, f] of PATTERNS) { const m = s.match(re); if (m) return f(m); }
  return null;
}

/** Texto traducido. `{x}` se sustituye por vars.x. */
export function t(es: string, vars?: Record<string, string | number>): string {
  let s = current === 'en' ? EN[es] ?? NAMES[es] ?? patterned(es) ?? es : es;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Plural sencillo: tp(n, 'receta', 'recetas') → «1 receta» / «3 recetas» (traducido). */
export function tp(n: number, one: string, many: string): string {
  return `${n.toLocaleString(locale())} ${t(n === 1 ? one : many)}`;
}

/** Nombre de un dato del juego en el idioma elegido: el inglés si existe y el idioma es inglés. */
export function nm(es: string | null | undefined, en: string | null | undefined): string {
  return (current === 'en' ? en || es : es || en) ?? '';
}
