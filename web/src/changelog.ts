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
    date: '2026-11-18', kind: 'mejora', title: 'Botones que se iluminan al pasar el ratón',
    items: [
      'Los botones, pestañas, accesos del inicio y el menú se iluminan con un brillo dorado al pasar el ratón por encima (los botones rojos, con un brillo cálido), al estilo del juego.',
    ],
  },
  {
    date: '2026-11-18', kind: 'mejora', title: 'Inicio más corto: resumen del último parche',
    items: [
      'El inicio ya no muestra las notas del parche completas: solo un resumen del último hotfix, con cuántos cambios hay en cada sección y hasta 5 buffs y nerfs de clases y razas.',
      '«Ver todas las notas» lleva a la nueva pestaña «Notas del parche» de «Cambios del juego», con los hotfixes de los últimos 7 días.',
    ],
  },
  {
    date: '2026-11-18', kind: 'nuevo', title: 'Notas del parche del juego en el inicio',
    items: [
      'La página de inicio muestra, debajo de los accesos, las notas del parche de WoW Forever de los últimos 3 días: todos los hotfixes oficiales de Blizzard (clases, mazmorras, objetos, profesiones, misiones…), por sección.',
      'Los cambios de clases y razas llevan su etiqueta (Mejora, Empeora o Mixto), y cada nota tiene «Traducir» para verla en español con Google Translate.',
    ],
  },
  {
    date: '2026-11-18', kind: 'mejora', title: 'Cambios del juego: traducir con Google',
    items: [
      'Cada cambio tiene un enlace «Traducir» que lo abre en Google Translate (del inglés al español), con sus notas de los desarrolladores.',
    ],
  },
  {
    date: '2026-11-18', kind: 'nuevo', title: 'Cambios del juego: buffs y nerfs de clases y razas',
    items: [
      'Nueva sección «Cambios del juego» (menú El juego): todos los cambios de cada clase, especialización y raza de WoW Forever, de los hilos oficiales de Blizzard: los hotfixes desde el lanzamiento y las notas de la beta.',
      'Cada cambio lleva una etiqueta: Mejora (buff), Empeora (nerf), Mixto, Corrección o Cambio. Se deduce del texto (por ejemplo, que baje una espera es una mejora), así que puede equivocarse: cada uno enlaza al original.',
      'Filtra por clase o raza, efecto y origen, o busca una habilidad. El «Balance por clase y raza» cuenta cuántas mejoras y empeoramientos tiene cada una.',
      'El texto es el original de Blizzard, en inglés (no lo publican en español). Se actualiza solo: como mucho una hora después de que Blizzard añada algo.',
    ],
  },
  {
    date: '2026-11-18', kind: 'mejora', title: 'Lista de compra: lo que ya tienes, y el Salero',
    items: [
      'En la lista de compra de las rutas de subida («Subir nivel» y «Mi personaje») hay una columna «Tienes»: escribe lo que ya tienes en la bolsa o el banco y se descuenta de lo que hay que comprar, con el total a comprar y cuánto te ahorras.',
      'Si ya tienes todo lo de un material, aparece «Ya lo tienes». Copiar la lista y el CSV también lo tienen en cuenta.',
      'Se guarda solo en este navegador, y en «Mi personaje», por separado para cada personaje. El costo de la ruta no cambia: lo que tienes vale lo mismo que en la subasta.',
      'En «Transmutaciones» aparece el Salero de Peletería (Sal de roca → Sal de roca refinada, cada 2 días y 23 h), con el margen por unidad y su propio «La hice ahora». Wowhead no dice cuántas da cada uso, así que el oro al día es un mínimo (si da una por uso) y no se suma con las demás.',
    ],
  },
  {
    date: '2026-11-17', kind: 'mejora', title: 'Transmutaciones: cuál hacer y cuándo vuelve a estar disponible',
    items: [
      'Las transmutaciones de Alquimia comparten la espera en WoW Forever (al hacer una no puedes hacer otra hasta que pase): la página lo tiene en cuenta y destaca «La mejor transmutación», la que más oro da al día con ventas suficientes. La Tela lunar va aparte.',
      'Nuevo resumen arriba, «Qué hacer para sacar más oro»: la mejor transmutación y la Tela lunar, con el oro al día que suman juntas.',
      'Botón «La hice ahora»: guarda cuándo la hiciste y muestra «Hasta el …» en todas las transmutaciones hasta que pase la espera. Se guarda solo en este navegador (Blizzard no da las esperas del personaje).',
      'Nueva tabla «¿Lo necesitas para ti?»: si te sale más barato comprar cada resultado o transmutarlo, y cuánto ahorras.',
      'Si algo se vende menos de una vez al día, indica cada cuántos días se vende uno.',
      'También se puede preguntar a Claude qué transmutar (herramienta «transmutaciones»).',
    ],
  },
  {
    date: '2026-11-17', kind: 'nuevo', title: 'Transmutaciones',
    items: [
      'Nueva sección «Transmutaciones» (menú Ganar oro): todas las recetas que solo se pueden fabricar cada cierto tiempo, de cualquier profesión (las transmutaciones de Alquimia y la Tela lunar de Sastrería), con su espera, costo, precio de venta y ganancia por fabricación.',
      'Calcula el oro al día según la espera (por ejemplo, la arcanita se hace cada 47 h: media fabricación al día) y destaca arriba las que más dan.',
      'Indica cómo se aprende cada una, si tu perfil ya la conoce y si se vende poco. Se puede filtrar por «solo con ganancia» y «solo las que conoce el perfil».',
      'Aviso: no estaba confirmado si las transmutaciones comparten la espera (después se confirmó que sí; ver la entrada de arriba).',
    ],
  },
  {
    date: '2026-11-17', kind: 'nuevo', title: 'Descripción de los objetos al pasar el ratón',
    items: [
      'Al pasar el ratón por encima de cualquier objeto o material (icono o nombre) aparece su descripción, como en el juego: vinculación, ranura y tipo, armadura o daño, estadísticas, efecto de uso, nivel requerido y durabilidad.',
      'Debajo, lo que paga el vendedor por él y su precio en tu casa de subastas, con las unidades en venta.',
      'Con el teclado aparece al enfocar el nombre, y en el móvil al tocar el icono.',
    ],
  },
  {
    date: '2026-11-16', kind: 'mejora', title: 'Entrar sin contraseña',
    items: [
      'La web ya no pide contraseña al entrar: cualquiera puede consultar el comparador, las recetas, subir nivel, comprar o fabricar y conectar su personaje de Battle.net.',
      'La contraseña de administrador solo se pide para cambiar lo que es común para todos: los ajustes, sincronizar precios, añadir casas de subastas y editar perfiles manuales, la fabricación y el registro real. Se puede introducir con «Entrar como administrador» en el menú, o aparece sola al intentar uno de esos cambios.',
    ],
  },
  {
    date: '2026-11-16', kind: 'nuevo', title: '¿Comprarlo o fabricarlo?',
    items: [
      'Nueva sección «Comprar o fabricar» (menú Ganar oro): eliges un objeto que necesitas para usarlo (pociones, comida…) y cuántas unidades, y te dice si sale más barato comprarlo en la subasta o fabricarlo, cuánto te ahorras y por qué.',
      'Fabricar cuenta cada material por lo más barato entre comprarlo o fabricarlo tú; los que ya tienes valen lo que sacarías vendiéndolos. Si tu perfil no conoce la receta, se suma lo que cuesta (instructor, vendedor o subasta) y se indica desde cuántas unidades compensa.',
      'Avisa si hay menos unidades en venta de las que necesitas, y si el objeto se liga al recogerlo (solo se puede fabricar). Si la diferencia es menor del 5 %, dice que da igual.',
      'El detalle de cada receta incluye el mismo bloque, con la cantidad que quieras.',
      'Arreglado: en los buscadores de objetos se borraba lo escrito tras haber elegido uno, y la lista de resultados quedaba tapada por la tarjeta de abajo.',
    ],
  },
  {
    date: '2026-11-16', kind: 'nuevo', title: 'Rutas de guía para subir profesión',
    items: [
      'Subir nivel muestra por defecto la ruta de una guía publicada para WoW Forever (wowforeverguides.com): los mismos tramos y recetas, con las fabricaciones, la lista de compra y el costo calculados con los precios actuales. «Más rápida» y «Más barata» siguen disponibles como alternativas.',
      'Si la receta de la guía aún no da puntos en un nivel según los datos de Forever, se sigue con la anterior; lo que la guía no cubre (por ejemplo, Sastrería desde 265) se completa con la ruta más rápida y se marca «calculado». Minería no tiene guía: muestra la más rápida.',
      'Los pasos con recetas que no enseña el instructor dicen en el resumen qué receta hay que conseguir y dónde.',
    ],
  },
  {
    date: '2026-11-16', kind: 'nuevo', title: '¿Necesita receta? y dónde se consigue',
    items: [
      'El detalle de cada receta dice si la enseña el instructor (nivel y costo) o si hay que conseguir el objeto de receta (patrón, diseño, fórmula…): cuál es, si se compra a un vendedor y por cuánto, si cae de botín o es de misión, con enlace a Wowhead para ver quién la vende y dónde.',
      'Las rutas para subir de nivel muestran lo mismo en cada paso que usa una receta que no enseña el instructor.',
      'Las consultas desde Claude («detalle_receta» y «ruta_subir_nivel») también lo indican.',
    ],
  },
  {
    date: '2026-11-15', kind: 'mejora', title: 'Ruta más rápida sin gastar de más',
    items: [
      'La ruta más rápida sigue buscando el menor tiempo (casi una fabricación por punto, como las guías), pero entre recetas que tardan lo mismo elige la más barata. Antes podía elegir una más cara sin ganar tiempo.',
    ],
  },
  {
    date: '2026-11-15', kind: 'mejora', title: 'Rutas completas hasta el nivel máximo',
    items: [
      'Cuando el instructor no enseña ninguna receta que dé puntos (por ejemplo, Sastrería y Herrería a partir de 255-260, o Primeros auxilios desde 210), la ruta usa recetas de patrón, botín o misión solo en esos niveles en vez de dejarlos sin datos. Se marcan «patrón» y cada paso dice dónde se consiguen.',
      'Todas las profesiones de fabricación tienen ya ruta completa hasta 300 sin tener que activar «Incluir recetas de patrón».',
      'Minería explica que esos niveles se suben recogiendo mineral, porque fundir solo da puntos en algunos niveles.',
    ],
  },
  {
    date: '2026-11-15', kind: 'arreglo', title: 'Consultas desde Claude con prioridad',
    items: [
      'La consulta de rutas desde Claude devuelve por defecto la más rápida y permite pedir la más barata, igual que la web.',
      'Indica el tiempo de fabricación y marca los materiales que salen de pasos anteriores, que ya no se cuentan como compra.',
    ],
  },
  {
    date: '2026-11-15', kind: 'mejora', title: 'Rutas para subir profesión como una guía',
    items: [
      'Las rutas se reparten en tramos largos con una sola receta (por ejemplo, 165 → 195 Elixir de poder de fuego), en vez de cambiar de receta cada pocos puntos. Solo se cambia cuando el ahorro compensa; el costo del instructor también cuenta. Alquimia 1 → 300 (más barata) pasa de 16 a 9 pasos con el mismo costo.',
      'Lo que fabricas en un paso se usa en los siguientes antes de comprar: el Aceite de Fuego que haces de 130 a 165 sirve para el Elixir de poder de fuego. Se marca con «de pasos anteriores» y no entra en la lista de compra.',
      'Nueva pestaña «Resumen», la que se ve primero: una tabla con los niveles, la receta, las fabricaciones y los materiales por fabricación. Pulsa una receta para ver su paso en detalle.',
      'Subir nivel calcula por defecto la ruta más rápida (menos tiempo fabricando). Con «Prioridad: Más barata» eliges la que cuesta menos oro; la elección se guarda en el enlace.',
      'Agrupar en tramos nunca empeora la ruta más de un 3 % (de tiempo en la rápida, de oro en la barata) frente a elegir nivel a nivel.',
      'Se aplica a todas las rutas: «Subir nivel» y «Mi personaje», tanto la más barata como la más rápida.',
    ],
  },
  {
    date: '2026-11-15', kind: 'mejora', title: 'Toda la web más fácil de entender',
    items: [
      'Los estados de las recetas hablan claro: «Buena opción», «Rentable, ventas inciertas», «Gana poco», «No da ganancia», «Faltan precios»… Pasa el ratón por encima para leer qué significa cada uno.',
      'Comparador: las tarjetas de arriba filtran por estado con un clic, hay un botón «Quitar filtros», una ayuda «Cómo leer la tabla» y la columna «Ventas» dice cuántas se venden al día. En el móvil los filtros empiezan plegados para ver antes los resultados.',
      'Ficha de receta: nuevo bloque «En resumen» con lo que cuesta, por cuánto se vende, cuánto te queda y cuánto se vende, más el veredicto en una frase. El simulador y las fórmulas quedan plegados.',
      'Registro real y perfiles manuales: el objeto se elige escribiendo su nombre, ya no hace falta saber su ID. Los perfiles muestran los nombres de las recetas y materiales.',
      'Textos más sencillos en Fabricación, Catálogo, Materiales, Simulador, Calidad de datos y Ajustes (la comisión se muestra también en %). Fuera los términos técnicos como «marketValue» o «sin errores de descarga».',
      'Fabricación vacía explica paso a paso cómo añadir recetas. El catálogo enlaza también a «Subir de nivel» de cada profesión.',
      'El menú explica para qué sirve cada sección al pasar el ratón.',
    ],
  },
  {
    date: '2026-11-14', kind: 'nuevo', title: 'Favoritas, alertas y exportar el comparador',
    items: [
      'Marca recetas con la estrella (en el comparador o en la ficha de la receta) y síguelas en el panel «Favoritas». Con «Solo favoritas» el comparador muestra únicamente esas.',
      'Alertas: escribe la ganancia mínima por unidad que te interesa y, cuando una favorita llegue a ella, se avisa en el comparador y en la página de inicio. Se comprueba al abrir la web y con cada actualización de precios. Un precio atípico no avisa.',
      'Las favoritas se guardan en este navegador.',
      '«Exportar CSV» descarga la lista entera con los filtros y el orden que tengas, para abrirla en Excel.',
      'Nuevos órdenes: margen (%), ventas al día y tasa de venta de la región.',
      'La columna de estado muestra el margen en porcentaje de cada receta.',
    ],
  },
  {
    date: '2026-11-14', kind: 'nuevo', title: 'Seguir la ruta paso a paso y lista de compra para llevar',
    items: [
      'En «Subir nivel» y en «Mi personaje» cada paso tiene una casilla «Hecho». Arriba se ve cuántos pasos llevas y el nivel alcanzado; se guarda en este navegador.',
      'La lista de compra puede mostrar solo lo que falta (sin los pasos hechos), copiarse como texto con «Copiar lista» o descargarse en CSV para Excel.',
      'Nueva columna «Dónde»: casa de subastas, vendedor (con enlace a Wowhead para ver qué PNJ lo vende) o precio tuyo.',
      'Las recetas que no enseña el instructor dicen si son patrón de vendedor, botín o misión, con un enlace «ver dónde».',
      'Cada paso muestra otras recetas posibles con su costo por punto. Con «Evitar esta receta» la ruta se recalcula sin ella, y «Permitir» la vuelve a incluir.',
    ],
  },
  {
    date: '2026-11-14', kind: 'mejora', title: 'Menú más ordenado, página de inicio y privacidad',
    items: [
      'Nueva página de inicio con tres accesos: qué fabricar para ganar oro, subir una profesión y Mi personaje. Es lo que se ve al abrir la web.',
      'El menú se agrupa en «Ganar oro», «Subir profesión» y «Herramientas». «Cerrar sesión» está ahora en el propio menú.',
      '«Perfil manual» se explica mejor: el selector de arriba se llama así y la página aclara la diferencia con «Mi personaje».',
      'Las calidades de objeto salen en español y con su color (Pobre, Común, Poco común, Raro, Épico, Legendario).',
      'Nueva página de privacidad: qué se guarda al conectar Battle.net y cómo borrarlo. El pie indica que es una web de fans sin relación con Blizzard.',
      'Nuevo icono y vista previa con imagen al compartir el enlace en Discord, WhatsApp o redes.',
    ],
  },
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
