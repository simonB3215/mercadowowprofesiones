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
| D9 | Identidad del objeto = `itemId`; nunca el nombre | Puede haber objetos distintos con el mismo nombre. |
| D10 | La vendibilidad se deduce de la vinculación (Blizzard) **o** de la observación en datos de subasta de TSM; si no hay ninguna de las dos, es «desconocida» | Evita clasificar como vendible algo sin evidencia. |
| D11 | Resultado con otro objeto del mismo nombre → bloqueo salvo que el usuario asuma la variante manualmente | No se puede saber cuál se obtiene. |
| D12 | Sin expansiones: todo el catálogo es «WoW Forever» | Forever tiene un único rango por profesión. |
| D13 | El catálogo de Blizzard se sincroniza con un **script local** (`npm run sync:catalog`), no desde Vercel | Son miles de peticiones y superan el límite de tiempo de una función. Es reanudable. |
| D14 | Precios: sincronización bajo demanda (botón, sin repetir en menos de 60 min) más **Vercel Cron diario** | El plan Hobby de Vercel solo permite cron diario. Con Pro se puede cambiar a cada 3 h en `vercel.json`. |
| D15 | Se conservan como máximo 2 lotes con filas por archivo y contexto; los intentos fallidos se registran sin filas | Mantiene la base de datos dentro del plan gratuito de Supabase y permite reproducir resultados recientes. |
| D16 | Sin modo demo en la aplicación. Los datos ficticios solo existen en las pruebas automáticas (`tests/helpers/seed.ts`, PGlite en memoria) | El usuario pidió que solo exista WoW Forever. |
| D17 | Acceso con una contraseña compartida (`APP_PASSWORD`) | Aplicación de un solo usuario; ver `src/server/auth.ts`. |
| D18 | Las importaciones relativas usan la extensión `.js` | Vercel compila cada archivo TS por separado; Node resuelve `.js` en tiempo de ejecución. Se verificó compilando con `tsc` y ejecutando la función con Node. |
| D19 | **Solo World of Warcraft: Forever** (decisión del usuario, 12-11-2026) | Se retiraron del código y de Supabase Retail, Classic y el modo demo. Forever no tiene reinos ni commodities: se usan las casas de subastas de TSM por modo de juego y facción. |
| D20 | Parámetros jsonb con `$n::text::jsonb` | Con postgres.js un `JSON.stringify` en una columna jsonb se guardaba como cadena (doble codificación). La migración `20261112000000` corrige las filas existentes. |
| D21 | Precios de la casa de subastas desde la **API de Blizzard**; TSM como respaldo y para la demanda regional | Blizzard publica las 15 casas de Forever, incluida la neutral de Aguasnegras, que TSM no tiene. Su foto se resume por objeto en el formato CSV de TSM para reutilizar la ingesta. El modo de cada grupo de casas se verificó contra TSM (`docs/VALIDACION_FUENTES.md`). |
| D22 | Comisión de Aguasnegras separada (`commissionNeutral`, 15 %) | Las casas neutrales cobran más en Classic. Supuesto configurable, no verificado en Forever. |
