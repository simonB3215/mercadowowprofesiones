# Estado del proyecto

Última actualización: 13 de noviembre de 2026.

## Resumen

La aplicación trabaja **solo con World of Warcraft: Forever**. Está desplegada en Vercel (https://mercadowowprofesiones.vercel.app), abierta para consultar (la contraseña `APP_PASSWORD` solo protege los cambios en datos compartidos), y conectada a **Supabase**. El código está en GitHub (repositorio público `simonB3215/mercadowowprofesiones`). Comprobado:
- 148 pruebas automáticas en verde, `tsc` sin errores y `npm run build` correcto (14-11-2026).
- Catálogo real de Forever en Supabase: 12 profesiones, 2 493 recetas y 2 358 objetos (recetas completas).
- Precios reales: casas de subastas desde la API de Blizzard (incluida Aguasnegras) y estadísticas regionales de TSM. Casa por defecto: JcJ — Horda.
- Rediseño visual (12-11-2026): estilo del propio juego (paneles oscuros tipo tooltip, títulos dorados, colores de calidad y monedas de oro, plata y cobre) e iconos de WoW por id. Revisado en el navegador a 1440, 800 y 375 px (ver «Interfaz» abajo y `docs/SISTEMA_VISUAL.md`).

## Funciones terminadas (verificadas)

- **Motor de cálculo exacto:** costo por ejecución, lote y unidad; ingreso neto; ganancia; ROI (no definido si C = 0); equilibrio; precio objetivo; mínimo publicable; depósitos perdidos frente a recuperables; reposición frente a desembolso; caída de precio. El caso de referencia da 80 o por lote y 40 o por unidad.
- **Ingesta de precios:** casa de subastas desde Blizzard (resumen por objeto) con TSM de respaldo; parser CSV con validación de cabeceras; precios 0 → `null`; unidades en venta y número de publicaciones por objeto (solo Blizzard; migración `20261118000000`); activación atómica; el fallo conserva el último lote; poda de lotes antiguos; registro de intentos.
- **Casas de subastas:** 4 modos (Normal, JcJ, Rol, Rol JcJ) × Alianza, Horda y Aguasnegras; comisión separada para Aguasnegras.
- **Evaluación de recetas:**
  - Canal de venta: subasta, vinculado, servicio o desconocido.
  - Rendimiento variable y facción.
  - Bloqueo por variantes con el mismo nombre.
  - Antigüedad de los datos.
  - Demanda regional con advertencias.
  - Perfil del personaje.
  - Siete estados con sus motivos.
- **Interfaz:**
  - Selector de mercado y personaje.
  - Comparador con búsqueda, filtros, orden (los valores ausentes van al final) y paginación.
  - Detalle con fórmulas, procedencia y fecha de cada precio.
  - Historial de precio (gráfico de 7 a 60 días con ficha por día y tabla) en la receta y en Materiales; «N en venta · M publicaciones» junto a cada precio de la casa de subastas. Revisado en el navegador a 800 y 375 px con datos reales.
  - Las rutas sin ningún tramo con precio muestran «Sin datos» en lugar de 0 c.
  - Página de inicio (`#/inicio`, la que se abre sin ruta), menú en tres grupos (Ganar oro, Subir profesión, Herramientas) con «Cerrar sesión» dentro, calidades en español con su color, página de privacidad (`#/privacidad`), aviso de web de fans en el pie, icono propio y vista previa al compartir (`og.png`, 1200×630). Revisado en el navegador a 1440, 1024 y 375 px.
  - Comparador: favoritas y alertas por umbral de ganancia por unidad (`web/src/favorites.tsx`, guardadas en el navegador en `favRecipes`, máx. 200; parámetro `ids` en `/api/opportunities`); exportar CSV de toda la lista filtrada (`export=1`, hasta 5000 filas; utilidades en `web/src/csv.ts`); órdenes por margen, ventas al día y tasa de venta; `marginPct` = ganancia por unidad ÷ precio de venta. Revisado en el navegador a 800 y 375 px.
  - Rutas de subida (`web/src/RouteTools.tsx`, en «Subir nivel» y «Mi personaje»): casilla «Hecho» por paso con progreso guardado en el navegador (`routeDone:<clave>`); lista de compra con «Solo lo que falta», «Copiar lista» y CSV (`;`, coma decimal); columna «Dónde» y enlace a Wowhead «sold-by» para materiales de vendedor; fuente de cada receta (patrón de vendedor, botín, misión) con «ver dónde»; hasta 3 recetas alternativas por paso con costo por punto en el nivel de inicio, y «Evitar esta receta» (parámetro `exclude`, máx. 50, también guardado en los planes). Revisado en el navegador a 800 y 375 px.
  - Aviso «Hay una versión nueva» con «Actualizar ahora» y tarjeta «Novedades de la web» tras actualizar.
  - Apartado «Changelog» (`#/changelog`) con todas las actualizaciones; el menú lo marca con un punto si hay novedades sin ver. Cada actualización visible añade su entrada al principio de `web/src/changelog.ts` en el mismo commit.
  - Simulador de escenarios (guardar, cargar, restaurar).
  - Comprar o fabricar con detección de ciclos.
  - Catálogo y cobertura.
  - Calidad de datos.
  - Perfil (profesiones, recetas conocidas, inventario).
  - Lista de fabricación y compras con inventario compartido.
  - Materiales: vender o usar, y oro por hora con datos del usuario.
  - Subir de nivel (`#/nivel`, D27): ruta más barata por profesión (9 de fabricación; las de recolección no), receta por tramo, color de dificultad, fabricaciones estimadas, materiales, costo con precios de la casa de subastas, costo del instructor, lista de compra y precios manuales para materiales sin precio. Comprobado con datos reales: Sastrería 1→300 ≈ 463 o con tramos sin datos desde 250; Alquimia 1→300 ≈ 38 o completa. Las recetas con tiempo de reutilización (transmutaciones, Tela lunar, Fogata básica) no se usan (D29). Los materiales que solo venden los vendedores (hilos, tintes, lejía…) usan el precio del vendedor si es más barato que la subasta, con la etiqueta «vendedor» (D35).
  - Reutilización (PB-22, D31): las 13 transmutaciones y Tela lunar llevan la etiqueta «1 cada X» en el comparador y el detalle; el plan de fabricación avisa del tiempo mínimo para repetirlas.
  - Registro real con correcciones sin duplicar.
  - Ajustes.
  - Calculadoras manuales avanzadas.
- **Sistema visual** (`docs/SISTEMA_VISUAL.md`):
  - Generado con la skill UI UX Pro Max (`design-system/mercado-wow/MASTER.md`): estilo del juego: paneles oscuros translúcidos con respaldo sólido, títulos dorados en Cinzel, botón principal rojo con borde dorado, Fira Sans y Fira Code, iconos de interfaz Phosphor, sin emojis.
  - Barra lateral y encabezado con el selector de mercado; tarjetas de indicadores con recuentos reales en el comparador.
  - Ganancia, pérdida, equilibrio y «sin datos» con icono, texto y color; las cifras del comparador y del detalle son **estimadas** y lo indican.
  - Estados de carga (esqueleto), error (con «Reintentar») y vacío en todas las páginas.
  - Tableta: barra lateral solo con iconos. Móvil: navegación horizontal y tablas convertidas en tarjetas.
  - Teclado con foco visible, contraste AA medido y `prefers-reduced-motion`.
  - Páginas secundarias cargadas bajo demanda: paquete inicial de 281 kB (83 kB comprimido; 13-11-2026).
- **Iconos de WoW:** tabla `visual_asset`, `GET /api/assets` y `npm run sync:icons`. 2 452 recursos de Wowhead Forever (12 profesiones + 2 440 objetos) y 263 objetos con el icono oficial de Blizzard; ninguno sin icono. Si una imagen falla: Blizzard y, después, un marcador neutro.
- **Robustez de la base de datos:** las lecturas de más de 30 s fallan con un error visible y renuevan el pool (D26).
- **Mi personaje** (`#/personaje`, PC-01 a PC-16, D32 a D34; estado por PC en el backlog, sección «Ampliación»):
  - Conexión con Battle.net (inicio de sesión oficial, `state` de un solo uso, token cifrado en el servidor, desconectar y borrar datos).
  - Personajes propios con aislamiento por cuenta.
  - Ficha del personaje como el panel del juego: retrato de Blizzard, equipo puesto con la información de cada pieza (ratón, teclado o toque), nivel de objeto medio, nivel y hermandad, tal como estaban al pulsar «Actualizar desde Blizzard» (se lee solo la primera vez). Profesiones en tarjetas con barra de progreso; «Ruta para subirla» calcula la ruta desde el nivel actual. Revisado en el navegador a 1280 y 375 px con datos reales de Blizzard (base local de prueba).
  - Profesiones de Blizzard o manuales, con procedencia.
  - Ruta **más rápida** (tiempo activo = fabricaciones × tiempo de lanzamiento de Wowhead) o más barata, con presupuesto, «solo naranja» y recetas conocidas.
  - Por paso: fabricaciones esperadas frente al mínimo garantizado, requisitos de rango (reglas de Classic, sin verificar), bloqueos, recuperación hipotética por venta.
  - Rutas guardadas con progreso y recálculo.
  - Sin cuenta, calcula con el nivel escrito a mano. Revisado en el navegador a 1024 y 375 px en ese modo.
  - Con datos reales: Alquimia 1→300 rápida = 15,4 min y 53,90 o; barata = 23,7 min y 38,59 o; con 45 o de presupuesto = 16,1 min.
  - **Probado con una cuenta real (13-11-2026):** inicio de sesión y lista de personajes en producción. Forever no da reino: el personaje se identifica como `nombre-apellido` y las profesiones responden en `…/character/{nombre-apellido}/professions` (comprobado). La lectura de profesiones con esa ruta está corregida pero falta desplegarla y probarla desde la web.
- **Servidor MCP** (D30): 8 herramientas de solo lectura para consultar desde Claude el estado del mercado, recetas rentables, detalle, materiales, rutas de subida de nivel y transmutaciones. Probado por stdio con los datos reales de Supabase (13-11-2026) y con pruebas automáticas.
- **Acceso (16-11-2026):** se entra sin contraseña. `isOpenRequest` en `src/server/auth.ts`: GET, cálculos por POST que no guardan (`/api/calculate`, `/api/crafting-plan`, `/api/tools/expected`) y Battle.net/`/api/me` (sesión propia por cuenta) son abiertos; el resto (ajustes, sincronizar precios, casas, perfiles, escenarios, planes, registro) exige la cookie de administrador (`APP_PASSWORD`, HttpOnly firmada). La web pide la contraseña en un diálogo al pulsar «Entrar como administrador» o al recibir un 401 de un cambio. Los datos compartidos (perfiles, planes, registro, ajustes) se pueden ver sin contraseña. El cron usa `CRON_SECRET`.
- **Rutas por tramos (15-11-2026):** `segmentPicks` en `src/engine/leveling.ts` reparte la subida en tramos de una sola receta (programación dinámica O(puntos × recetas)): costo esperado + instructor + penalización por tramo (`SEGMENT_PENALTY_SHARE` = 1 % del costo de la ruta punto a punto, mínimo 1 de plata; en la rápida, 1 % del tiempo). Elegido probando 0, 0,5 %, 1 % y 3 % con precios reales de 8 profesiones: con 1 % los pasos bajan a la mitad (Ingeniería 22→9, Herrería 19→10) con 0–3 % más de costo; con 3 % aparecían tramos muy caros en profesiones caras. `assemblePlan` reutiliza lo fabricado en pasos anteriores (`creates` de Wowhead, cantidad mínima) y lo marca en `fromSteps`. Pestaña «Resumen» tipo guía (`RouteGuide` en `web/src/RouteTools.tsx`). Tope del 3 % (`MAX_SEGMENT_EXTRA`): `planLeveling` compara con la ruta punto a punto y, si la agrupada sale más de un 3 % peor (tiempo en la rápida, oro en la barata), baja la penalización (1 % → 0,5 % → 0,25 % → 0,1 %) y si nada cabe usa la punto a punto; así Ingeniería barata queda en 185,9 o (11 pasos). «Subir nivel» calcula por defecto la más rápida (`/api/leveling?mode=rapida|barata`, selector «Prioridad», `modo=barata` en el enlace). Limitación: la ruta rápida con presupuesto conserva el ajuste fino punto a punto y puede tener algún tramo corto.
- **Huecos del instructor (15-11-2026):** `fillTrainerGaps` en `src/engine/leveling.ts`: con «solo instructor», los niveles donde ninguna receta del instructor da puntos se cubren con recetas de patrón limitadas a esos niveles (`onlyAt`, comprobado en `skillUpChance`); lo usan `planLeveling` y `planRoute`. La API devuelve `patternLevels` y `fillsTrainerGap` por paso. Minería (186) muestra un motivo propio en sus huecos (se sube recogiendo).
- **Rutas de guía (16-11-2026):** `data/leveling/forever-guides.json` (fijo, no se actualiza): ruta principal de wowforeverguides.com por profesión (Minería no tiene), con `spellId` resuelto. `planGuide` en `src/engine/leveling.ts` usa la receta de la guía en cada nivel; dentro de la guía, si aún no da puntos se sigue con la anterior; fuera, la ruta más rápida (`filledLevels`). Recetas `otra` con naranja 0 (misión, botín) se usan desde donde empieza el paso. `/api/leveling` sin `mode` usa la guía si existe (`mode: guia`, `guide`, `inGuide` por paso, `unpricedSteps`). Las guías de Classic no sirven: Forever cambia niveles y nombres (p. ej. Seda 100-120, «Elixir of Defense» = 195).
- **Objetos de receta (16-11-2026):** `data/leveling/forever-recipe-items.json` (`npm run sync:recipe-items`, buscador de Wowhead; 1607 de 1723 recetas con objeto). `recipeItemFor` añade `recipeItem` (objeto, cómo se consigue, precio al vendedor) a pasos y alternativas; `/api/recipes/:id` devuelve `learn` (`learnInfo`) y el detalle muestra «¿Necesita receta?». Wowhead bloquea las páginas HTML: el vendedor concreto se ve con el enlace «quién la vende y dónde».
- **Transmutaciones (17-11-2026, PT-01 a PT-04 y PT-10):** `cooldownRecipes` en `src/server/leveling.ts` lista las recetas de Wowhead con espera que crean objeto (14: 13 transmutaciones y Tela lunar; Fogata básica se excluye); `src/server/transmutations.ts` las enlaza con el catálogo por objeto + materiales (las 14 coinciden), las evalúa con `evaluateRecipe` y calcula `goldPerDay` = ganancia × `craftsPerDay` (24 h ÷ espera, máximo 10; `src/engine/cooldown.ts`). `GET /api/transmutations`; página `#/transmutaciones` (`web/src/pages/Transmutations.tsx`). PT-02: Wowhead no da la categoría de reutilización; un jugador confirmó (17-11-2026) que en Forever todas las transmutaciones comparten la espera (grupo `transmutaciones`, `groupOf`), y la Tela lunar va aparte. Con precios de JcJ — Horda: arcanita ≈ 22,9 o/día, legionita ≈ 21,1 (ventas inciertas), Tela lunar ≈ 9,3, vida a tierra ≈ 3,8. Revisado en el navegador a 1024 y 375 px.
- **Transmutaciones, segunda parte (17-11-2026, PT-05 a PT-09):** `bestPerGroup` elige la mejor de cada espera (primero «candidato», luego más oro al día; nunca una que pierda oro) y `plan`/`planTotal` suman solo esas (con precios reales: arcanita ≈ 22,9 + Tela lunar ≈ 9,3 = 32,2 o/día). `buyOrMake`: comprar cada resultado frente a la receta más barata que lo crea (un solo paso; sin cadenas de varias transmutaciones). `daysPerSale` cuando se vende menos de una al día. «La hice ahora» guarda la hora en `localStorage` (`mw-transmutaciones-hechas`), no en la cuenta, y bloquea todo el grupo. Herramienta MCP `transmutaciones` (casa, soloConGanancia, profesionId).
- **Mejoras del 21-11-2026:**
  - **Ganancia por hora:** `catalogCastSeconds` (`src/server/cooldowns.ts`) enlaza el tiempo de lanzamiento de Wowhead (`forever-spell-details.json`) con el catálogo por objeto + materiales, como las esperas. `evaluateRecipe` da `castSeconds` y `profitHour` = ganancia por lote × 3600 ÷ (lanzamiento × ejecuciones), solo sin espera (`cooldown === 0`); sin tiempo o con espera, `null`. Orden `sort=profitHour` en `/api/opportunities`. No cuenta compras, viajes ni demanda.
  - **«La hice ahora» con el personaje:** tabla `character_cooldown` (migración `20261120000000`, en cascada con el personaje y la cuenta), rutas `/api/me/characters/{id}/cooldowns` con `requireSession` + `ownedCharacter` + `checkSameOrigin`. Sin conexión sigue en `localStorage`; al conectar, las marcas del navegador aún en espera pasan al personaje. `web/src/myCharacters.ts` comparte los personajes y el elegido (`mw-personaje`) con «Mi personaje».
  - **Gastar lo que tienes al marcar un paso:** `useStepsDone(key, bagKey)` en `web/src/RouteTools.tsx`: al marcar, `consumeForStep` descuenta de `mw-bolsa:<bolsa>` lo que el paso compra (no lo fabricado en pasos anteriores) y lo apunta en `routeUsed:<ruta>`; al desmarcar o «Desmarcar todo», `restoreForStep` lo devuelve.
  - **Tu clase en Cambios del juego:** `matchKey` reconoce la clase y la raza que da Blizzard (inglés exacto o español por las 3 primeras letras, admite femenino); filtro `quien=mio:*` y marca «Te afecta».
  - **Hotfix nuevo:** `useHotfixUnseen` (`web/src/main.tsx`) compara la fecha del último hotfix (`/api/patch-notes?days=1`) con `mw-hotfix-visto`; la primera visita no marca nada.
  - **Buscador global:** `web/src/GlobalSearch.tsx` + `GET /api/search`; recetas → detalle, objetos material → «Materiales», si no la receta que lo fabrica. Atajo «/».
  - **Qué hago hoy:** `web/src/Today.tsx` (inicio): 3 «Buena opción» sin espera, el plan de Transmutaciones con su disponibilidad y `favoriteChanges` frente a una foto diaria (`mw-favoritas-foto`; cambios ≥ 5 % y ≥ 1 plata).
  - **Avisos de precio:** `web/src/priceAlerts.tsx` (`mw-avisos-precio`, «baja de» / «sube de», límite incluido) con `GET /api/prices` (precio de compra de Ajustes). Panel en «Materiales», botón en materiales y recetas, aviso en el inicio.
  - **Comisiones:** 5 % y 15 % (Aguasnegras) confirmados por una guía de Forever que comprobó el cliente el 13-11-2026 (Conquest Capped); explicado en «Ajustes».
- **Cambios del juego (18-11-2026):** `src/server/gameChanges.ts` lee dos hilos oficiales de los foros de Blizzard (Discourse, `/t/{id}.json`, solo mensajes con `staff`): «WoW: Forever Hotfixes» (2403040, solo el primer mensaje, que acumula todas las fechas) y las notas de desarrollo de la beta (2360696, cada mensaje con su fecha). Copia en la tabla `forum_topic_cache` (migración `20261119000000`), renovada si tiene más de 1 h; si el foro falla se usa la copia (`stale`). `parsePost` saca fecha, sección, ruta (clase › especialización, raza) y notas de los desarrolladores; solo se quedan los cambios de clase y raza. `classify` (estimación, por frase): corrección, nuevo = mejora, número nuevo frente a «was» (con unidades y rangos «4/8/12%»), «increased/reduced», «removed»; en espera, coste, tiempo de lanzamiento o nivel, bajar es mejor; frases opuestas = «mixto». Con los hilos del 18-11: 693 cambios (100 hotfixes, 593 beta). `GET /api/game-changes`; página `#/cambios` (`web/src/pages/GameChanges.tsx`). Blizzard no publica estas notas en español: el texto va en inglés.
- **Lo que ya tienes y el Salero (18-11-2026):**
  - `web/src/shopping.ts` (`applyOwned`) descuenta de la lista de compra de las rutas lo que el usuario dice que tiene: columna «Tienes» en `ShoppingPanel`. Se guarda en `localStorage` (`mw-bolsa:<clave>`): `general` en «Subir nivel» y una por personaje o plan en «Mi personaje». La ruta y su costo no cambian, porque lo que tienes vale su precio de mercado. Sin precio: 0 si lo tienes todo y desconocido si falta algo.
  - El Salero (`ITEM_USES` en `src/server/transmutations.ts`) aparece en `itemUses`, con espera de 71 h (tooltip de Wowhead del hechizo 19566), Peletería 250 y margen por unidad (venta neta de la refinada menos la sal). Como no se sabe cuánto da cada uso, `minGoldPerDay` supone una por uso y no se suma al plan.
- **Descripción al pasar el ratón (17-11-2026):** `buildItemTooltip` en `src/server/itemTooltip.ts` arma las líneas del tooltip del juego desde `item.raw.preview_item` de Blizzard (es_MX): vinculación, ranura, armadura/daño, estadísticas, efectos de uso, requisitos, durabilidad y precio al vendedor; sin ficha (345 de 2703 objetos), solo la clase. `GET /api/items/{id}/tooltip` (con casa: precio y oferta). En la web, `ItemTipHost` (`web/src/ItemTooltip.tsx`) es una sola ventana para toda la app; `WowIcon` y `ItemLabel` la abren con `itemTipProps` (`web/src/itemTip.ts`) al pasar el ratón, enfocar o tocar (`tip={false}` la desactiva: ficha del personaje y buscador). Revisado con el ratón en el navegador (abrir, contenido, posición, cerrar); el toque en móvil no se probó.
- **Comprar o fabricar (16-11-2026):** `buyOrCraft` en `src/engine/buyOrCraft.ts` compara comprar el objeto terminado (precio de compra × cantidad, sin comisión, aviso si hay menos en venta) con fabricarlo (materiales al mejor precio entre comprar y fabricar con `resolveSourcing`, más la receta si el perfil no la conoce); «da igual» por debajo del 5 %, `breakEvenQty` para amortizar la receta, ligado al recoger = solo fabricar. `/api/buy-or-craft` por `recipeId` o `itemId` (todas las recetas que lo fabrican); `/api/items?craftable=1`. Página `#/comprar` y bloque en el detalle de receta (`web/src/BuyOrCraft.tsx`). Revisado en el navegador con datos reales (Poción de maná, Protección contra la Naturaleza). Tarda como el detalle de receta (~4-5 s con Supabase remoto: carga el mercado completo).
- **Claridad de la interfaz (15-11-2026):** estados con nombres sencillos y explicación (`STATUS_LABEL` y `STATUS_HELP` en `src/engine/calc.ts`); nombres de origen del precio en español (`PRICE_FIELD_LABEL` y `priceSource()` en `web/src/lib.tsx`). Comparador: tarjetas por estado que filtran (el recuento `counts` de `/api/opportunities` se calcula sin el filtro de estado), «Quitar filtros», «Cómo leer la tabla», columna «Ventas» y filtros plegados en el móvil. Ficha de receta con «En resumen»; simulador y fórmulas plegados. Nuevo `/api/items` (búsqueda por nombre o `ids`) y `web/src/ItemPicker.tsx` en Registro real y en el inventario de los perfiles. Revisado en el navegador a 1280 y 375 px sin cuenta conectada.

## En curso o bloqueado

| Elemento | Situación | Qué hace falta |
|---|---|---|
| Comisiones | 5 % (facción) y 15 % (Aguasnegras), confirmados por una guía de Forever (cliente comprobado el 13-11-2026); no por Blizzard | Si Blizzard las cambia, ajustarlas en «Ajustes». El depósito mínimo y su fórmula en Forever siguen sin confirmar. |
| Objetos sin ficha en Blizzard | 345 objetos devuelven 404 (sobre todo recetas de «Temporada de descubrimiento») | Aparecen sin nombre; sus precios se usan por id. |
| Desencantado y transformaciones aleatorias (PB-23) | Parcial | Calculadora manual de valor esperado; faltan tablas verificadas. |
| Cron horario | **Resuelto el 13-11-2026.** Fallaba porque `CRON_SECRET` estaba vacío en Vercel (el servidor rechaza todo con un secreto vacío, también el cron diario) y faltaba en GitHub. Se configuró en los dos y la ejecución manual de GitHub Actions salió correcta (casa con datos de hace < 1 h). | Si vuelve a fallar, la anotación del workflow dice la causa («Falta CRON_SECRET», «no coincide», sin respuesta). |
| Estadísticas regionales de TSM | TSM tarda a veces más de un día en publicar el archivo regional (11-11 → 12-11-2026); la descarga funciona | Pasan a «Desactualizado» a las 48 h (ajustable en «Ajustes»). La página distingue «comprobado hace poco» de «datos viejos de la fuente». |
| Historial | En marcha desde el 12-11-2026 para JcJ — Horda | `historical` gana fiabilidad a partir de unos 7–14 días. |
| Hardcore | Las casas 112/115/118 existen pero están vacías | Añadirlas cuando el modo se lance. |
| Consultas colgadas con el pooler | Mitigado (límite de 30 s y renovación del pool) | Si se repite en producción, probar el pooler de sesión (puerto 5432) para el servidor local. Causa exacta sin confirmar. |
| Iconos de objetos nuevos | Hay que ejecutar `npm run sync:icons` tras cada `sync:catalog` | Los objetos sin resolver se muestran con un marcador neutro. |
| Subida de nivel: tramos altos | Por encima de ≈ 250 algunas profesiones necesitan recetas de patrón o materiales de vendedor sin precio en la casa de subastas | Marcar «Incluir recetas de patrón…» o indicar precios manuales. La probabilidad en amarillo y verde es una estimación de la comunidad. |
| Subida de nivel: datos de Wowhead | Copiados a mano el 13-11-2026 (Wowhead bloquea descargas automáticas) | Repetir la copia si Forever cambia recetas o umbrales. |
| Battle.net (Mi personaje) | Conexión y lista de personajes **probadas con una cuenta real** (13-11-2026). Forever no da reino: el personaje es `nombre-apellido` y `/professions` responde con nivel, máximo y recetas conocidas (comprobado). Migraciones `20261115000000` y `20261116000000` aplicadas. | Desplegar la corrección y pulsar «Actualizar personajes» y luego «Leer de Blizzard» para comprobarlo desde la web. |
| Rutas: tiempos no incluidos | Solo se cuenta el tiempo de fabricación | Sin datos verificados de viajes, compras, aprendizaje ni recolección (PC-17). |
| Tema claro | Sustituido por el estilo del juego (oscuro) a petición del usuario | Recuperable con los tokens de la primera iteración (historial de git). |

## Decisiones

Ver [docs/DECISIONES.md](docs/DECISIONES.md). Las principales:
- Supabase y Vercel.
- Una sola función de API.
- RLS sin políticas.
- Racionales exactos.
- PGlite para desarrollo y pruebas.
- El catálogo se sincroniza con un script local.
- Cron diario (plan Hobby).
- Sistema visual e iconos por id (D25); límite de tiempo de las consultas (D26); subida de nivel con datos de Wowhead (D27); precios de venta atípicos (D28); sin recetas con reutilización en la subida de nivel (D29); servidor MCP (D30); reutilización en comparador y plan (D31); conexión con Battle.net (D32), datos del personaje con procedencia (D33), ruta más rápida (D34) y precio de vendedor en la subida de nivel (D35).

## Siguientes pasos

1. Battle.net: desplegar la lectura por `nombre-apellido`, comprobar desde la web que se leen las profesiones y que las recetas conocidas se enlazan con Wowhead.
2. PC-14 y PC-08: descontar inventario y registrar fabricaciones y consumo en el progreso.
3. Verificar las comisiones en el juego.
4. PB-23: tablas verificadas de desencantado, prospección y molienda para Forever.
5. PB-20 y PB-21: confirmar que no aplican en Forever (sin calidades de fabricación ni producción adicional) y cerrarlos.
6. Revisar la cobertura del catálogo en «Calidad de datos».

## Cómo continuar sin empezar de nuevo

- Código y arquitectura: `README.md`, sección «Estructura».
- Contrato de las fuentes y lagunas: `docs/VALIDACION_FUENTES.md`.
- Estado por requisito con evidencia: `Product_Backlog_Web_Crafteo_TSM.md`, sección «Estado de implementación».
- Verificación rápida: `npm test`, `npm run typecheck` y `npm run dev`.
