# Mercado de profesiones (WoW Forever)

Web en español para consultar los crafteables de las profesiones de **World of Warcraft: Forever** (solo esta versión) y decidir si conviene fabricarlos para vender. Compara materiales, costo de fabricación, precio de venta, comisión, ganancia neta, ROI y señales de demanda.

- **Precios de la casa de subastas:** [Blizzard Game Data API](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis) (`dynamic-forever-us`, foto de cada casa, incluida la neutral de Aguasnegras). Si falla o no hay credenciales, los CSV públicos de [TradeSkillMaster](https://tradeskillmaster.com/public-data) (`/forever/…`), que no publican Aguasnegras.
- **Demanda:** estadísticas regionales de TSM (tasa de venta y ventas por día).
- **Catálogo:** [Blizzard Game Data API](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis), namespace `static-forever-us`. Necesita credenciales.
- **Subida de nivel:** recetas, niveles de aprendizaje y umbrales de dificultad de [Wowhead (WoW Forever)](https://www.wowhead.com/forever), guardados en `data/leveling/forever-wowhead.json` (copiados a mano; ver `docs/VALIDACION_FUENTES.md`).
- **Base de datos:** Supabase (PostgreSQL). **Despliegue:** Vercel.

Especificación: [Documentacion_Web_Crafteo_TSM.md](Documentacion_Web_Crafteo_TSM.md) · Backlog: [Product_Backlog_Web_Crafteo_TSM.md](Product_Backlog_Web_Crafteo_TSM.md) · Estado: [ESTADO_PROYECTO.md](ESTADO_PROYECTO.md)

## Requisitos

- Node.js 22.13 o superior (probado con 24.19).
- Para producción: un proyecto de Supabase y una cuenta de Vercel.
- Para el catálogo real: un cliente de la API de Battle.net.

## Instalación y ejecución local

```bash
npm install
```

```bash
npm run dev
```

- Interfaz: http://localhost:5173. API: http://127.0.0.1:8787 (Vite le reenvía `/api`).
- Si no hay `DATABASE_URL`, se usa **PostgreSQL embebido (PGlite)** en `./data/pglite` y las migraciones se aplican solas.

Con Supabase en local: copia `.env.example` a `.env`, rellena `DATABASE_URL` y aplica las migraciones:

```bash
npm run migrate
```

## Datos reales

1. **Precios.** WoW Forever no tiene reinos. En la interfaz elige la **casa de subastas**: modo de juego (Normal, JcJ, Rol, Rol JcJ) y lado (Alianza, Horda o Aguasnegras), con slugs como `normal-alliance`, `pvp-horde`, `roleplay-aguasnegras` o `roleplay-pvp-alliance`. Pulsa «Actualizar precios»: la casa se descarga de Blizzard (o de TSM si falla) y las estadísticas regionales de TSM. Desde la terminal:

   ```bash
   npm run sync:prices -- us normal-alliance
   ```

2. **Catálogo de Blizzard.** Necesita `BLIZZARD_CLIENT_ID` y `BLIZZARD_CLIENT_SECRET` en `.env`.

   Primero guarda muestras reales para validar el contrato de la API (PB-01):

   ```bash
   npm run probe:blizzard -- us
   ```

   Después sincroniza el catálogo de WoW Forever (namespace `static-forever-us`). Es reanudable:

   ```bash
   npm run sync:catalog -- us
   ```

   Para una prueba corta de una sola profesión:

   ```bash
   npm run sync:catalog -- us --prof=171 --limit=50
   ```

   Por último, resuelve los iconos de objetos y profesiones (Wowhead, entorno WoW Forever, con respaldo de Blizzard; ver `docs/SISTEMA_VISUAL.md`). Omite los ya resueltos; `--refresh` los vuelve a comprobar y `--limit=N` hace una prueba corta:

   ```bash
   npm run sync:icons
   ```

## Pruebas

```bash
npm test
```

```bash
npm run typecheck
```

Las pruebas cubren:
- **Motor exacto:** caso de referencia de 80 oro, varias unidades, precio ausente, costo cero, cantidades inválidas, ciclos, plan con inventario compartido.
- **Ingesta de TSM con filas reales de WoW Forever:** cabeceras, comillas, fallo de sincronización que conserva el último lote, aislamiento por casa de subastas y región.
- **API completa sobre PGlite** con un catálogo de prueba ficticio que solo existe en las pruebas (`tests/helpers/seed.ts`).
- **Acceso con contraseña** (`APP_PASSWORD`).

## Servidor MCP (consultar los datos desde Claude)

`src/mcp/server.ts` expone los datos de la aplicación como herramientas MCP **de solo lectura**: no sincroniza precios ni escribe nada. Usa la base de datos de `DATABASE_URL` en `.env` y llama a la misma API dentro del proceso (si hay `APP_PASSWORD`, la sesión se genera localmente; la contraseña no sale del equipo).

| Herramienta | Qué devuelve |
|---|---|
| `estado_mercado` | Antigüedad de los precios de la casa y de TSM, y si están desactualizados |
| `profesiones` | Ids de profesión y número de recetas |
| `recetas_rentables` | Recetas con costo, venta, ganancia, ROI, demanda, estado y motivos (filtros y orden) |
| `detalle_receta` | Materiales con precio y procedencia, equilibrio, precio mínimo publicable, estado |
| `buscar_material` | Id de un material por nombre |
| `vender_o_usar_material` | Vender el material frente a usarlo en cada receta |
| `ruta_subir_nivel` | Ruta más barata para subir una profesión y lista de compra |

Importes en oro con 4 decimales; `null` = sin datos (nunca 0). Casa por defecto: JcJ — Horda (parámetro `casa`).

- **Claude Code:** `.mcp.json` ya lo registra como `mercado-wow`. Al abrir el proyecto, Claude Code pide aprobarlo una vez.
- **Otro cliente MCP (Claude Desktop…):** comando `node`, argumentos `["<ruta>/node_modules/tsx/dist/cli.mjs", "<ruta>/scripts/mcp-server.ts"]`.
- A mano: `npm run mcp` (habla MCP por stdin/stdout).

## Mi personaje: Battle.net y rutas de subida (`#/personaje`)

Flujo:
1. Conectar con Battle.net (inicio de sesión oficial; la web no pide la contraseña).
2. Elegir un personaje propio y ver sus profesiones.
3. Calcular la ruta **más rápida** (o la más barata), con presupuesto opcional.
4. Guardar la ruta y registrar el progreso para recalcular.

Sin conexión, la misma pantalla calcula la ruta con el nivel escrito a mano.

Configuración (una vez):
1. En https://community.developer.battle.net/access/clients, en el cliente que ya usa `BLIZZARD_CLIENT_ID`, añade como *Redirect URLs*:
   - `https://mercadowowprofesiones.vercel.app/api/auth/battlenet/callback`
   - `http://localhost:5173/api/auth/battlenet/callback` (desarrollo)
2. Aplica la migración `supabase/migrations/20261115000000_battlenet.sql` con `npm run migrate`. Ya está aplicada en Supabase desde el 13-11-2026.
3. Opcional, en Vercel y en `.env`: `BNET_TOKEN_KEY` (clave propia para cifrar los tokens) y `BNET_PROFILE_NAMESPACES` (ver `.env.example`). Los secretos se escriben solo ahí, nunca en el código ni en el chat.

Qué está verificado y qué no:
- La API de Blizzard **no documenta profesiones en Classic** y Forever no aparece en la documentación de perfiles (`docs/VALIDACION_FUENTES.md`). Si Blizzard no las da, se indican a mano y quedan etiquetadas «Manual».
- El flujo completo se ha probado con respuestas **simuladas** de Blizzard, no con una cuenta real.
- Tiempos: solo el de fabricación (lanzamiento de Wowhead × fabricaciones esperadas). Viajes, compras y aprendizaje se muestran como «no incluido».
- Con presupuesto, la ruta es «la más rápida entre las evaluadas» (D34), no un óptimo garantizado.

Rutas de la API:
- `GET /api/route`: ruta sin cuenta.
- `GET /api/battlenet/status`, `GET /api/battlenet/start`, `GET /api/auth/battlenet/callback` y `POST /api/battlenet/disconnect`.
- `GET|POST /api/me/characters[/sync]`, `POST /api/me/characters/:id/professions/sync`, `PUT|DELETE /api/me/characters/:id/professions/:pid` y `POST /api/me/characters/:id/route`.
- `GET|POST /api/me/plans`, `GET|DELETE /api/me/plans/:id` y `POST /api/me/plans/:id/progress`.

Datos:
- `npm run sync:spells` regenera los tiempos de lanzamiento.
- `npm run probe:profile` vuelve a comprobar los namespaces de perfil.

## Despliegue en Supabase y Vercel

1. **Supabase:** crea el proyecto. En *Project Settings → Database* copia la cadena del **Transaction pooler** (puerto 6543) y aplica las migraciones.
   - Con este proyecto: `DATABASE_URL=… npm run migrate`.
   - Con la CLI de Supabase: `npx supabase link` y `npx supabase db push`. Las migraciones están en `supabase/migrations/`.
2. **Vercel:** importa el repositorio. `vercel.json` ya define el build (`npm run build` → `dist/web`), la función `api/index.ts`, las reescrituras y el cron.
3. **Variables en Vercel** (*Settings → Environment Variables*):
   - `APP_PASSWORD`: contraseña de acceso a la web. Sin ella, cualquiera con la URL podría usar y modificar la app.
   - `DATABASE_URL`
   - `BLIZZARD_CLIENT_ID` y `BLIZZARD_CLIENT_SECRET`
   - `CRON_SECRET`
   - opcionales: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, para guardar los CSV originales en Storage.
4. **Catálogo:** se sincroniza desde tu equipo apuntando `DATABASE_URL` a Supabase (`npm run sync:catalog -- us`). No se hace desde Vercel por el límite de tiempo de las funciones.
5. **Cron:** `/api/cron/sync-prices` actualiza las casas de subastas usadas recientemente. Vercel lo llama a diario (límite del plan Hobby) y GitHub Actions cada hora (`.github/workflows/sync-prices.yml`, necesita el secreto de repositorio `CRON_SECRET`, con el mismo valor que en Vercel). Las casas se descargan como máximo cada 50 min y las estadísticas regionales de TSM cada 6 h. El botón «Actualizar precios» descarga bajo demanda.
6. **Historial:** cada foto de Blizzard se suma al día en `price_history`; el campo `historical` de la casa es la media de los promedios diarios de los últimos 14 días (se guardan 60). Los primeros días refleja pocos datos.

## Estructura

```
api/index.ts                 Función de Vercel (todas las rutas /api/*)
src/engine/                  Motor puro: racionales exactos, costos, ganancia, clasificación, plan, comprar/fabricar
src/server/providers/        Adaptadores TSM (CSV), Blizzard (OAuth + Game Data) y subastas de Blizzard
src/server/catalog/          Reglas versionadas y sincronización del catálogo
src/server/market.ts         Ingesta atómica de precios y lectura del lote activo
src/server/evaluate.ts       Evaluación de recetas contra un mercado
src/server/router.ts         API interna
supabase/migrations/         Esquema SQL (RLS activado)
web/src/                     Interfaz React
src/server/leveling.ts       Ruta de subida de nivel (datos de Wowhead + precios)
data/leveling/               Recetas y umbrales de dificultad de Wowhead (WoW Forever)
src/mcp/server.ts            Servidor MCP de solo lectura (scripts/mcp-server.ts lo arranca por stdio)
scripts/                     Servidor local, migraciones, sincronizaciones, sonda de Blizzard
tests/                       Vitest (motor, ingesta, API)
docs/                        Validación de fuentes y decisiones técnicas
```

## API interna

| Método | Ruta | Uso |
|---|---|---|
| GET/POST | `/api/auth/status`, `/api/auth/login`, `/api/auth/logout` | Acceso con `APP_PASSWORD` (cookie HttpOnly; el resto de rutas devuelve 401 sin sesión) |
| GET | `/api/meta` | Versión (WoW Forever), regiones, ajustes, estado del catálogo |
| GET/POST | `/api/realms` | Casas de subastas de WoW Forever; añadir otra validada contra TSM |
| GET | `/api/market/status` | Lotes activos, antigüedad y último intento |
| POST | `/api/sync/prices` | Sincronizar precios del contexto (casa: Blizzard, o TSM de respaldo; región: TSM) |
| GET | `/api/cron/sync-prices` | Cron de Vercel (requiere `CRON_SECRET`) |
| GET | `/api/professions`, `/api/coverage` | Catálogo y cobertura |
| GET | `/api/opportunities` | Comparador con filtros, orden y paginación |
| GET | `/api/recipes/{id}` | Detalle, desglose y comparación comprar/fabricar |
| POST | `/api/calculate` | Escenario con valores manuales |
| POST | `/api/crafting-plan` | Lista de fabricación y compras |
| GET | `/api/materials`, `/api/materials/{id}` | Vender un material frente a usarlo |
| GET | `/api/leveling/professions` | Profesiones con datos de subida de nivel |
| GET | `/api/leveling?profession=&from=&to=&trainerOnly=&manual=id:oro,…` | Ruta más barata de subida de nivel con costos y lista de compra |
| CRUD | `/api/profiles`, `/api/scenarios`, `/api/plans`, `/api/ledger`, `/api/settings` | Datos del usuario |
| POST | `/api/tools/expected` | Calculadora manual de valor esperado |
