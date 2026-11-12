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

Ajustes propios sobre la propuesta de la skill: el acento ámbar se oscureció a `#B45309` para cumplir AA sobre blanco; Fira Code se usa solo para las cifras, no para los títulos, por legibilidad; el tema es solo claro (lo pedía la dirección visual).

## 2. Referencia visual (Glassy Dashboard v2)

La página pública (`topmate.io/code_xr/2374158`) es una ficha de venta: solo muestra una miniatura promocional, no el diseño completo. De ella se tomó la dirección general: fondo claro con degradados azules suaves, paneles blancos esmerilados, acento azul intenso, filas compactas. **No es una reproducción** de la plantilla: no se compró ni se inspeccionó su código.

## 3. Tokens (`web/src/styles.css`, `:root`)

- **Color:** `--color-primary`, `--color-fg`, `--color-muted-fg`, `--color-ok|warn|bad|info|neutral` con su `-bg`. Calidades del juego: `--q-poor` … `--q-legendary`.
- **Vidrio:** `--glass-bg` (72 % blanco), `--glass-bg-strong` (90 %, para tablas), `--glass-blur` (14 px). Si el navegador no admite `backdrop-filter`, o el usuario pide menos transparencia, los paneles pasan a blanco sólido.
- **Forma:** `--radius-sm|radius|radius-lg` (8/14/20 px), `--shadow-sm|shadow`.
- **Espaciado:** `--space-1` … `--space-6` (4–32 px, densidad alta).
- **Tipografía:** `--font-sans` (Fira Sans), `--font-num` (Fira Code, cifras tabulares), `--text-xs|sm|md`.
- **Movimiento:** `--dur-fast` 150 ms, `--dur` 220 ms. Con `prefers-reduced-motion` se desactivan.

Contraste medido (WCAG): texto 16,4:1; texto secundario 7,6:1; enlaces y botón primario 8,7:1; ganancia 7,1:1; pérdida 6,5:1; insignias entre 5,3:1 y 7,2:1; marcador de posición 4,8:1.

## 4. Componentes reutilizables

| Componente | Archivo | Uso |
|---|---|---|
| `WowIcon`, `ItemLabel`, `useAsset` | `web/src/icons.tsx` | Icono de objeto o profesión por id; nombre siempre en texto al lado. |
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

`docs/capturas/`: `escritorio-comparador.jpg`, `escritorio-cargando.jpg` (esqueleto de carga), `escritorio-receta.jpg`, `escritorio-catalogo.jpg`, `tablet-comparador.jpg` (barra lateral compacta), `movil-comparador.jpg`, `movil-tabla-tarjetas.jpg`.

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
- El tema oscuro, que se retiró.
