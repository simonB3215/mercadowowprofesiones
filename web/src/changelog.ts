/**
 * Registro de cambios que se muestra en «Changelog». Cada actualización publicada añade una entrada AL PRINCIPIO
 * (la más reciente primero), con la fecha del día, en lenguaje para el usuario (qué cambia en la web, no detalles internos).
 */
export type ChangeKind = 'nuevo' | 'mejora' | 'arreglo';

export interface ChangeEntry {
  /** AAAA-MM-DD */
  date: string;
  kind: ChangeKind;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    date: '2026-11-14', kind: 'mejora', title: 'Aviso de versión nueva y novedades',
    items: [
      'Si se publica una actualización mientras tienes la web abierta, aparece arriba «Hay una versión nueva de la web» con el botón «Actualizar ahora».',
      'Después de actualizar, una tarjeta «Novedades de la web» resume lo que ha cambiado desde tu última visita. Se cierra con «Entendido».',
    ],
  },
  {
    date: '2026-11-14', kind: 'nuevo', title: 'Apartado «Changelog»',
    items: [
      'Nueva sección con todas las actualizaciones de la web, de la más reciente a la más antigua.',
      'El menú marca «Changelog» con un punto cuando hay novedades que aún no has visto.',
    ],
  },
  {
    date: '2026-11-14', kind: 'nuevo', title: 'Historial de precio y unidades en venta',
    items: [
      'Gráfico con el historial del precio (7, 14, 30 o 60 días) en la ficha de cada receta y de cada material. Muestra el detalle de cada día con el ratón, el teclado o tocando, y se puede ver como tabla.',
      'Junto a cada precio de la casa de subastas aparece cuántas unidades hay en venta y en cuántas publicaciones. Si solo hay una publicación se marca en naranja: ese precio es poco fiable.',
      'Las rutas para subir de nivel sin ningún precio muestran «Sin datos» en lugar de 0 c.',
    ],
  },
  {
    date: '2026-11-14', kind: 'nuevo', title: 'Ficha del personaje como en el juego',
    items: [
      '«Mi personaje» muestra el retrato de Blizzard con el equipo puesto, la información de cada pieza, el nivel de objeto medio, el nivel y la hermandad.',
      'Botón «Actualizar desde Blizzard»; la primera vez se lee solo.',
      'Profesiones en tarjetas con barra de progreso y botón «Ruta para subirla».',
    ],
  },
  {
    date: '2026-11-14', kind: 'arreglo', title: 'Personajes de Forever y precios de vendedor',
    items: [
      'Los personajes de WoW Forever (sin reino, con nombre y apellido) ya cargan sus profesiones desde Blizzard.',
      'La subida de nivel usa el precio del vendedor para los materiales que se compran a un PNJ cuando es más barato que la subasta.',
    ],
  },
  {
    date: '2026-11-13', kind: 'nuevo', title: 'Conexión con Battle.net y ruta más rápida',
    items: [
      'Inicia sesión con Battle.net para ver tus personajes y sus profesiones; puedes desconectar la cuenta cuando quieras.',
      'Ruta más rápida o más barata para subir una profesión desde tu nivel actual, con lista de compra y tiempo estimado.',
    ],
  },
  {
    date: '2026-11-13', kind: 'mejora', title: 'Tiempo de reutilización de recetas',
    items: ['El comparador, el detalle y el plan avisan de las recetas que solo se pueden fabricar cada cierto tiempo (por ejemplo, transmutaciones).'],
  },
  {
    date: '2026-11-13', kind: 'nuevo', title: 'Consultas desde Claude',
    items: ['Servidor MCP de solo lectura para preguntar a Claude por precios, recetas rentables y rutas de subida.'],
  },
  {
    date: '2026-11-13', kind: 'mejora', title: 'Mercado más claro y precios atípicos',
    items: [
      'El estado de los precios indica con claridad si están vigentes o desactualizados.',
      'Las recetas con un precio de venta atípico (una publicación aislada muy cara) se marcan y no cuentan como ganancia fiable.',
      'Las tablas ya no se desplazan hacia el lado.',
    ],
  },
  {
    date: '2026-11-13', kind: 'nuevo', title: 'Subir nivel de profesión',
    items: [
      'Guía por pasos para subir cada profesión con los precios de la casa de subastas.',
      'Se excluyen las recetas con tiempo de reutilización.',
    ],
  },
  {
    date: '2026-11-12', kind: 'mejora', title: 'Estilo visual del juego',
    items: ['Paneles oscuros tipo ficha del juego, títulos dorados, colores de calidad, monedas de oro, plata y cobre, e iconos de WoW.'],
  },
  {
    date: '2026-11-12', kind: 'nuevo', title: 'Precios de Blizzard e historial',
    items: [
      'Solo WoW Forever, con precios de las casas de subastas desde la API de Blizzard (incluida Aguasnegras).',
      'Casa JcJ — Horda por defecto, actualización automática cada hora y comienzo del historial de precios.',
    ],
  },
  {
    date: '2026-11-12', kind: 'nuevo', title: 'Primera versión',
    items: [
      'Comparador de rentabilidad de recetas con el catálogo real de Blizzard.',
      'Acceso privado con contraseña.',
    ],
  },
];

/** Clave de la entrada más reciente (para avisar de novedades sin ver). */
export const LATEST_CHANGE = CHANGELOG[0] ? `${CHANGELOG[0].date}|${CHANGELOG[0].title}` : '';
const SEEN_KEY = 'changelogSeen';
export function changelogUnseen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) !== LATEST_CHANGE; } catch { return false; }
}
/**
 * Entradas que este navegador aún no ha visto (como mucho `max`). Si nunca vio el changelog, solo la última:
 * no tiene sentido enseñar todo el historial a quien entra por primera vez.
 */
export function unseenEntries(max = 3): ChangeEntry[] {
  let seen: string | null = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch { return []; }
  if (seen === LATEST_CHANGE) return [];
  if (!seen) return CHANGELOG.slice(0, 1);
  const i = CHANGELOG.findIndex((e) => `${e.date}|${e.title}` === seen);
  return CHANGELOG.slice(0, i < 0 ? max : Math.min(i, max));
}
export function markChangelogSeen() {
  try { localStorage.setItem(SEEN_KEY, LATEST_CHANGE); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event('changelog-seen'));
}
