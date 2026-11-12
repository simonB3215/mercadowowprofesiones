# Mercado de profesiones (WoW Forever)

Web en español para consultar los crafteables de las profesiones de **World of Warcraft: Forever** (solo esta versión) y decidir si conviene fabricarlos para vender. Compara materiales, costo de fabricación, precio de venta, comisión, ganancia neta, ROI y señales de demanda.

- **Precios de la casa de subastas:** [Blizzard Game Data API](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis) (`dynamic-forever-us`, foto de cada casa, incluida la neutral de Aguasnegras). Si falla o no hay credenciales, los CSV públicos de [TradeSkillMaster](https://tradeskillmaster.com/public-data) (`/forever/…`), que no publican Aguasnegras.
- **Demanda:** estadísticas regionales de TSM (tasa de venta y ventas por día).
- **Catálogo:** [Blizzard Game Data API](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis), namespace `static-forever-us`. Necesita credenciales.
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
5. **Cron:** `/api/cron/sync-prices` se ejecuta a diario (límite del plan Hobby) y actualiza los mercados usados recientemente. Entre ejecuciones, el botón «Actualizar precios» descarga bajo demanda, como máximo una vez por hora y archivo.

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
| CRUD | `/api/profiles`, `/api/scenarios`, `/api/plans`, `/api/ledger`, `/api/settings` | Datos del usuario |
| POST | `/api/tools/expected` | Calculadora manual de valor esperado |
