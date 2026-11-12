# Sistema visual y procedencia de los recursos

Fecha: 12 de noviembre de 2026.

## 1. Cómo se usó la skill UI UX Pro Max

La skill está instalada como plugin de Claude Code (`ui-ux-pro-max-skill`, versión 2.13.0). Se siguió su flujo con su buscador local (`scripts/search.py`):

| Paso | Consulta | Resultado aplicado |
|---|---|---|
| Sistema de diseño (`--design-system`, densidad 8, movimiento 3, variación 4) | «gaming analytics dashboard glassmorphism light data-dense» | Estilo *Data-Dense Dashboard* (tablas, tarjetas de indicadores, poco relleno). Paleta: primario `#1E40AF`, secundario `#3B82F6`, acento ámbar, fondo `#F8FAFC`. Tipografía Fira Sans (texto) + Fira Code (cifras). Guardado en `design-system/mercado-wow/MASTER.md`. |
| Estilo (`--domain style`) | «glassmorphism light frosted» | Desenfoque de 10–20 px (se usa 14 px), bordes finos claros, capas con profundidad, y contraste de texto ≥ 4,5:1 obligatorio. |
| UX (`--domain ux`) | tablas, saltos de contenido, movimiento reducido | Tablas con desplazamiento o tarjetas en móvil; espacio reservado para contenido asíncrono; `prefers-reduced-motion`; animar 1–2 elementos por vista. |
| Iconos (`--domain icons`) | «decorative icon aria hidden» | Una sola familia de iconos de interfaz (Phosphor); iconos decorativos con `aria-hidden` junto a texto visible. |
| React (`--stack react`) | «lazy loading images» | `lazy()` para las rutas secundarias. |
| Lista previa a la entrega | MASTER.md | Sin emojis, cursor en clicables, transiciones de 150–300 ms, foco visible, movimiento reducido, pruebas a 375, 768, 1024 y 1440 px. |
| Segunda iteración: estilo (`--domain style`) | «fantasy MMORPG game dark gold medieval» | Reglas de *Dark Mode*: contraste de texto alto (se buscó ≥ 7:1 en el texto principal), brillo mínimo, foco visible, movimiento reducido. |
| Segunda iteración: color (`--domain color`) | «gaming fantasy dark gold» | De la paleta *Theater/Cinema*: fondo azul noche casi negro con acento dorado. Se descartó la de *Gaming* (morado neón y rosa), que no es el aspecto de WoW. |
| Segunda iteración: tipografía | «fantasy medieval game», reintento «games» | **Sin coincidencia útil**: la base solo tiene parejas de esports, píxel e infantiles. Cinzel (serifa de inscripción, Google Fonts) para los títulos es **decisión propia**, no de la skill. |

Ajustes propios sobre la propuesta de la skill: Fira Code se usa solo para las cifras; Fira Sans se mantiene para el texto largo y las tablas, por legibilidad.

## 2. Dirección visual

**Actual (12-11-2026, segunda iteración): estilo del propio juego**, a petición del usuario («tiene que ser más del mismo juego del WoW»):
- Paneles oscuros translúcidos con borde fino dorado claro, como los tooltips del juego.
- Títulos en dorado (`#FFD100`) con serifa Cinzel y sombra negra.
- Botón principal rojo con borde dorado; secundarios en piedra oscura.
- Nombres de objeto con el **color de calidad del juego** e iconos con marco negro y borde de calidad, como en las bolsas.
- Importes con **monedas de oro, plata y cobre**: la letra (o/p/c) se mantiene como texto y el color es un refuerzo.
- Esquinas cortas (4–8 px).

Es una interpretación con CSS propio: **no usa logotipos, fuentes ni texturas de la interfaz de Blizzard**, solo los iconos de objeto y profesión (ver §5).

**Anterior (primera iteración):** tema claro de vidrio inspirado en Glassy Dashboard v2 (`topmate.io/code_xr/2374158`, que solo muestra una miniatura promocional). El usuario lo sustituyó por el estilo del juego. `design-system/mercado-wow/MASTER.md` conserva la propuesta original de la skill; los tokens vigentes son los de `web/src/styles.css`.

## 3. Tokens (`web/src/styles.css`, `:root`)

- **Color:** `--gold` (`#FFD100`), `--gold-soft`, `--color-fg` (pergamino `#ECE4D0`), `--color-muted-fg`, `--btn-red*`, `--color-ok|warn|bad|info|neutral` con su `-bg`. Calidades del juego: `--q-poor` … `--q-legendary`.
- **Paneles:** `--glass-bg` (azul noche al 84 %), `--glass-bg-strong` (93 %, para tablas), `--glass-blur` (12 px), `--frame-inset`. Si el navegador no admite `backdrop-filter`, o el usuario pide menos transparencia, los paneles pasan a `#0B0D1C` sólido.
- **Forma:** `--radius-sm|radius|radius-lg` (4/6/8 px), `--shadow-sm|shadow`.
- **Espaciado:** `--space-1` … `--space-6` (4–32 px, densidad alta).
- **Tipografía:** `--font-title` (Cinzel), `--font-sans` (Fira Sans), `--font-num` (Fira Code, cifras tabulares), `--text-xs|sm|md`.
- **Movimiento:** `--dur-fast` 150 ms, `--dur` 220 ms. Con `prefers-reduced-motion` se desactivan.

Contraste medido (WCAG, sobre el panel `#0B0D1C`): texto 15,2:1; secundario 8,3:1; dorado 13,2:1; ganancia 11,6:1; pérdida 6,9:1; avisos entre 8,0:1 y 11,1:1; botón principal 6,1:1; marcador de posición 6,4:1. Calidades: pobre 7,1; común 19,3; poco común 14,1; épico 5,5; legendario 7,7. El azul «raro» original (`#0070DD`) da 4,0:1, así que el **nombre** usa `#3D9BFF` (6,7:1) y el borde del icono conserva el original.

## 4. Componentes reutilizables

| Componente | Archivo | Uso |
|---|---|---|
| `WowIcon`, `ItemLabel`, `useAsset` | `web/src/icons.tsx` | Icono de objeto o profesión por id; nombre siempre en texto al lado, con el color de su calidad si se conoce. |
| `Money`, `CoinText` | `web/src/lib.tsx` | Importe con monedas de oro, plata y cobre. Mismo texto que `formatMoney` (por ejemplo «≈ 1 o 99 p 80 c»), así que se copia y se lee igual. |
| `StatusBadge` | `web/src/lib.tsx` | Estado con icono + texto + color. |
| `Delta` | `web/src/lib.tsx` | Ganancia / pérdida / equilibrio / «sin datos» con icono y etiqueta de texto. Siempre es **estimada**; el beneficio realizado solo está en «Registro real». |
| `Loading` (con esqueleto), `ErrorBox` (con «Reintentar»), `Empty`, `PageHead` | `web/src/lib.tsx` | Estados de carga, error y vacío. |
| `Kpis` | `web/src/pages/Comparator.tsx` | Recuentos reales del servidor; no hay gráficos ni series inventadas. |

Estructura: barra lateral (≥ 1100 px con texto; 761–1100 px solo iconos con nombre accesible; ≤ 760 px en horizontal arriba), encabezado de controles de mercado y área principal. En móvil las tablas se convierten en tarjetas sin ocultar valores.

## 5. Iconos de WoW: procedencia

Capa central: `src/server/assets.ts` (servidor), tabla `visual_asset`, `GET /api/assets`, `web/src/icons.tsx` (interfaz). Se llena con `npm run sync:icons`.

| Recurso | Fuente | Cómo se relaciona |
|---|---|---|
| Objetos (resultados y reactivos) | Wowhead, entorno **WoW Forever** (`dataEnv=16`, el mismo que usa `wowhead.com/forever`): `https://nether.wowhead.com/tooltip/item/{id}?dataEnv=16` → campo `icon` | Por **id de objeto** de Blizzard (`static-forever-us`). |
| Imagen del icono | CDN de Wowhead: `https://wow.zamimg.com/images/wow/icons/{small|medium|large}/{icon}.jpg` (18/36/56 px) | Se pide el tamaño más pequeño que cubre el que se muestra (24–28 px → 36 px). |
| Respaldo | Blizzard Game Data API: `/data/wow/media/item/{id}` y `/data/wow/media/profession/{id}` (namespace `static-forever-us`) → `render.worldofwarcraft.com/forever-us/icons/56/{fileId}.jpg` | Mismo id. Se usa si Wowhead no tiene el objeto o si la imagen principal falla. |
| Profesiones | Wowhead: hechizo de la profesión (`/tooltip/spell/{id}?dataEnv=16`) | El id de profesión de Blizzard se traduce a su hechizo (`PROFESSION_SPELL`) y **se comprueba que el nombre devuelto coincida**; si no, se usa el icono de Blizzard. |

Resultado de la sincronización (12-11-2026): 2 452 recursos de Wowhead (12 profesiones + 2 440 objetos) y 263 objetos con el icono oficial de Blizzard (no figuran en Wowhead Forever, sobre todo los de «Temporada de descubrimiento»). Ninguno quedó sin icono.

Reglas:
- Nunca se asigna un icono por similitud de nombre.
- Si la imagen falla, se intenta **una vez** el respaldo de Blizzard y después un marcador neutro del mismo tamaño. No hay reintentos ni cambios de tamaño, y el nombre y los datos siguen visibles.
- Todas las imágenes tienen `width`/`height`, `loading="lazy"` y `decoding="async"`, y son decorativas (`alt=""`) porque el nombre va en texto al lado.
- Solo se usan iconos del juego (arte © Blizzard Entertainment), enlazados desde el CDN de Wowhead con atribución en el pie de página. No se usan capturas subidas por usuarios de Wowhead.
- El detalle de receta enlaza a la ficha de Wowhead Forever del objeto cuando está verificada.

Iconos de interfaz: `@phosphor-icons/react` 2.1.10 (buscar, filtrar, ordenar, navegación, estados). Sin emojis.

## 6. Capturas

`docs/capturas/` (estilo del juego): `escritorio-comparador.jpg`, `escritorio-cargando.jpg` (esqueleto de carga), `escritorio-receta.jpg`, `escritorio-catalogo.jpg`, `tablet-comparador.jpg` (barra lateral compacta), `movil-comparador.jpg`, `movil-tabla-tarjetas.jpg`.

## 7. Qué se verificó y qué no

Verificado en el navegador integrado, contra la API local conectada a Supabase:
- Las 11 rutas cargan sin errores de API: comparador, catálogo, detalle de receta, materiales y su detalle, lista de fabricación, perfil, registro, simulador, calidad de datos y ajustes.
- Los iconos coinciden con su objeto (muestras revisadas a mano) y con las 12 profesiones. La cadena de respaldo mantiene el tamaño y el nombre.
- Filtro por profesión con la URL actualizada, orden, foco visible con teclado y contraste (calculado con las fórmulas de WCAG).
- Anchos de 1440 px (escritorio), 800 px (tableta) y 375 px (móvil) sin desplazamiento horizontal.

No verificado:
- Lector de pantalla real.
- Safari, Firefox y dispositivos físicos.
- Navegadores sin `backdrop-filter` (el respaldo sólido solo se revisó en el CSS).
- Medición de Lighthouse o CLS.
- Segunda iteración (estilo del juego): revisados en el navegador el comparador (1440, 800 y 375 px), el detalle de receta, el catálogo, el foco con teclado y la ausencia de desplazamiento horizontal en móvil. El resto de páginas comparte tokens y componentes, pero no se capturó una por una.
