# Decisiones técnicas

| # | Decisión | Motivo |
|---|---|---|
| D1 | Base de datos **Supabase (PostgreSQL)** y despliegue en **Vercel** | Petición del usuario. |
| D2 | TypeScript en todo el proyecto: React + Vite para la interfaz y funciones de Vercel para la API | Un solo lenguaje. El motor de cálculo se comparte entre servidor e interfaz. |
| D3 | Una sola función `api/index.ts` y un router propio (`src/server/router.ts`) basado en `Request → Response` | El mismo código sirve en Vercel y en local (`scripts/dev-server.ts`). Las reescrituras de `vercel.json` envían `/api/*` a la función. |
| D4 | Conexión con `postgres.js` mediante el **pooler de transacciones** de Supabase (`prepare: false`) | Recomendado para funciones serverless; evita agotar conexiones. |
| D5 | **RLS activado sin políticas** en todas las tablas | La clave anónima de Supabase no puede leer ni escribir nada. Solo el servidor, con la conexión directa, accede a los datos. |
| D6 | **PGlite** (PostgreSQL embebido) para pruebas y desarrollo sin Supabase | Docker no estaba disponible. Ejecuta el mismo SQL de `supabase/migrations`. |
| D7 | Aritmética **racional exacta con BigInt** (`src/engine/rational.ts`) | Requisito de precisión: no hay redondeos silenciosos y el precio mínimo publicable se calcula con techo al cobre. |
| D8 | Precio desconocido = `null` en todo el sistema; `minBuyout`/`marketValue` = 0 de TSM → `null` | Requisito: un precio desconocido nunca equivale a cero. |
| D9 | Identidad del objeto = `game_version` + `itemId`; nunca el nombre | En TSM las calidades de reactivo comparten nombre con distintos IDs. |
| D10 | La vendibilidad se deduce de la vinculación (Blizzard) **o** de la observación en datos de subasta de TSM; si no hay ninguna de las dos, es «desconocida» | Evita clasificar como vendible algo sin evidencia. |
| D11 | Recetas de Dragonflight, The War Within y Midnight → bloqueo por calidad salvo que el usuario la asuma manualmente | TSM no distingue la calidad del equipo y no hay reglas verificadas (`src/server/catalog/rules.ts`). |
| D12 | Expansión deducida del prefijo del nombre del rango de habilidad (por ejemplo «Khaz Algar …»); si no coincide, «Sin clasificar», visible en la cobertura | La API no expone la expansión de forma verificada. |
| D13 | El catálogo de Blizzard se sincroniza con un **script local** (`npm run sync:catalog`), no desde Vercel | Son miles de peticiones y superan el límite de tiempo de una función. Es reanudable. |
| D14 | Precios: sincronización bajo demanda (botón, sin repetir en menos de 60 min) más **Vercel Cron diario** | El plan Hobby de Vercel solo permite cron diario. Con Pro se puede cambiar a cada 3 h en `vercel.json`. |
| D15 | Se conservan como máximo 2 lotes con filas por archivo y contexto; los intentos fallidos se registran sin filas | Mantiene la base de datos dentro del plan gratuito de Supabase y permite reproducir resultados recientes. |
| D16 | El modo demo vive en `game_version='demo'` y `provider='demo'` | Los datos ficticios no se mezclan nunca con los reales y se etiquetan en la interfaz. |
| D17 | Aplicación de un solo usuario, sin inicio de sesión | Todavía no se ha decidido. Cualquiera con la URL puede editar perfiles y el registro (ver los bloqueos en ESTADO_PROYECTO.md). |
| D18 | Las importaciones relativas usan la extensión `.js` | Vercel compila cada archivo TS por separado; Node resuelve `.js` en tiempo de ejecución. Se verificó compilando con `tsc` y ejecutando la función con Node. |
