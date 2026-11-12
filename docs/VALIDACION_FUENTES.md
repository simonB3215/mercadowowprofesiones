# Validación de fuentes (PB-01)

Fecha: 11 de noviembre de 2026.

## TSM: CSV públicos (verificado con descargas reales)

Base: `https://public-data.tradeskillmaster.com`. No requiere clave, inicio de sesión ni tiene límite de peticiones según su documentación.

| Ruta | Estado | Cabecera real |
|---|---|---|
| `/retail/us/commodities.csv` | 200, 10 905 filas | `itemId,name,marketValue,minBuyout,recent,historical,updatedAt` |
| `/retail/us/realm/area-52/items.csv` | 200, 18 147 filas | `itemId,name,marketValue,minBuyout,recent,historical,updatedAt` |
| `/retail/us/region/items.csv` | 200, 29 901 filas | `itemId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt` |
| `/retail/us/region/pets.csv` | 200 | `petSpeciesId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt` |
| `/retail/{eu,kr,tw}/…` | 200 | iguales |
| `/classic/us/…`, `/classic-progression/us/…`, `/forever/us/…` | 200 | no integrados (PB-26) |
| `/retail/us/realm/area52/items.csv` (slug sin guion) | 404 | el slug debe coincidir exactamente con el de TSM |
| Índice de reinos o regiones | 404 | TSM no publica una lista: el slug se copia de la URL del reino en tradeskillmaster.com |

Hechos comprobados:

- Importes en cobre (1 oro = 10 000 cobre). `updatedAt` es el mismo en todo el archivo y corresponde al escaneo de origen.
- Hay nombres con comas y comillas entrecomillados (por ejemplo `"Vantus Rune: Aberrus, the Shadowed Crucible"`), así que hace falta un parser CSV.
- Un commodity aparece solo en `commodities.csv` y nunca en el archivo de reino: hubo 0 coincidencias entre los 10 905 commodities y los 18 147 objetos de Area 52.
- `region/items.csv` sí incluye commodities (10 901 de 10 905) con su tasa y su volumen.
- **Las calidades de reactivo tienen `itemId` propios con el mismo nombre.** Ejemplo: `Bismuth` aparece con los IDs 210930, 210931 y 210932. La aplicación nunca une precios por nombre.
- **El equipo con calidad de fabricación no se distingue:** cada `itemId` tiene una sola fila, sin bonus IDs ni rango de calidad.
- `minBuyout` = 0 aparece en filas con `marketValue` > 0. Se interpreta como «sin publicación actual» y se guarda como `null`.
- Las columnas `saleRate` y `soldPerDay` solo existen en el archivo regional. No hay demanda por reino.
- Frecuencia según TSM: reino y commodities cada pocas horas, región a diario. Lo observado: commodities con 5 h y región con 22 h en el momento de la prueba.

Evidencia: las muestras están en `tests/fixtures/`. Las pruebas de `tests/market.test.ts` usan esas filas reales. La sincronización real con US/Area 52 se comprobó en la aplicación local: los tres archivos quedaron en estado `ok`.

## Blizzard: Game Data API (documentación verificada; respuestas pendientes)

Comprobado en el portal oficial con un navegador, porque la página es dinámica:

- Token: `POST https://oauth.battle.net/token` con `grant_type=client_credentials` y autenticación básica `client_id:client_secret`. La respuesta incluye `expires_in` (≈ 86 399 s).
- Uso del token: cabecera `Authorization: Bearer <token>`.
- Host: `{region}.api.blizzard.com`, con `region` = us | eu | kr | tw. China usa `gateway.battlenet.com.cn`, que no está soportado.
- Namespace obligatorio en cada petición, como parámetro o como cabecera `Battlenet-Namespace`. Profesiones, recetas y objetos usan `static-{region}`; los reinos, `dynamic-{region}`.
- Rutas confirmadas:
  - `/data/wow/profession/index`
  - `/data/wow/profession/{id}`
  - `/data/wow/profession/{id}/skill-tier/{skillTierId}`
  - `/data/wow/recipe/{id}`
  - `/data/wow/item/{id}`
  - `/data/wow/realm/index`
  - `/data/wow/connected-realm/index`

**Sin verificar (requiere credenciales):** los campos exactos de las respuestas, como `crafted_item`, `crafted_quantity`, `reagents`, `modified_crafting_slots`, `preview_item.binding` o `categories[].recipes[]`. Por eso:

- `src/server/catalog/sync.ts` usa parsers tolerantes. Un campo no reconocido marca la receta como incompleta, con su motivo en `recipe.fetch_error`, y nunca se rellena con un supuesto.
- `npm run probe:blizzard -- us` guarda respuestas reales en `docs/muestras/` para cerrar esta validación.

## Lo que falta y cómo afecta al cálculo

| Laguna | Efecto |
|---|---|
| Campos de Blizzard sin verificar | Catálogo Retail vacío hasta configurar credenciales. Las recetas mal interpretadas aparecen como incompletas y sin recomendación. |
| Calidad del equipo (bonus IDs) en TSM | Las recetas de Dragonflight o posteriores, y los resultados con variantes del mismo nombre, quedan como «datos insuficientes» salvo que el usuario asuma la calidad manualmente. |
| Profundidad de mercado | El costo siempre se marca como estimado; no se supone disponibilidad ilimitada. |
| Disponibilidad en vendedor | `purchase_price` de Blizzard no prueba que un vendedor venda el objeto. No se usa automáticamente; se puede introducir un precio manual. |
| Comisión de subasta | El 5 % es un supuesto configurable que hay que verificar para cada mercado. |
| Depósitos | No vienen en las fuentes; los introduce el usuario (perdidos o recuperables). |
| Habilidad requerida por receta | No se valida el nivel del personaje; se indica en las notas. |
| Reglas de calidad, producción adicional, ahorro y concentración | Sin reglas verificadas: solo hay calculadoras manuales etiquetadas. |
