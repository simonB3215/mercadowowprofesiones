# Validación de fuentes (PB-01): World of Warcraft: Forever

Fecha: 12 de noviembre de 2026. La aplicación trabaja **solo con WoW Forever**.

World of Warcraft: Forever se lanzó el 4 de noviembre de 2026. No tiene reinos: cada personaje elige un modo de juego (Normal, JcJ, Rol, Rol-JcJ; Hardcore más adelante), con un mundo por región.

## TSM: CSV públicos

Base: `https://public-data.tradeskillmaster.com/forever/…`. No requiere clave, pero aplica un límite de peticiones (Cloudflare 429 / error 1015) si se hacen muchas seguidas.

| Ruta | Estado | Cabecera |
|---|---|---|
| `/forever/us/region/items.csv` | 200, 6 653 objetos | `itemId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt` |
| `/forever/us/realm/{normal,pvp,roleplay,roleplay-pvp}-{alliance,horde}/items.csv` | 200 | `itemId,name,marketValue,minBuyout,recent,historical,updatedAt` |
| `/forever/us/commodities.csv` | 404 | no hay commodities |
| `/forever/us/realm/{normal,pvp,roleplaying,rp}/items.csv` (sin facción); `rp-*`, `rppvp-*`, `roleplaying-*` | 404 | |
| Casas de Aguasnegras (neutral) | no publicadas | solo están en la API de Blizzard |
| Regiones EU, KR y TW | sin verificar | TSM devolvió 429 durante la prueba |

- Cada «casa de subastas» de TSM es un modo de juego más una facción. La lista fija está en `src/server/config.ts` (`FOREVER_REALMS`), y la facción se usa en las recetas con resultado distinto por facción. TSM es el respaldo de Blizzard para las casas de facción.
- Importes en cobre (1 oro = 10 000 cobre). `updatedAt` corresponde al escaneo de origen.
- Los nombres pueden ir entrecomillados con comas, así que hace falta un parser CSV.
- `minBuyout` = 0 con `marketValue` > 0 se interpreta como «sin publicación actual» y se guarda como `null`.
- `saleRate` y `soldPerDay` solo existen en el archivo regional: no hay demanda por casa de subastas.

Evidencia: las muestras reales están en `tests/fixtures/forever_*.csv` y las usa `tests/market.test.ts`.

## Blizzard Game Data API

- Token: `POST https://oauth.battle.net/token` con `grant_type=client_credentials` y autenticación básica. Uso: `Authorization: Bearer <token>`. Host `{región}.api.blizzard.com`.
- **Namespace `static-forever-us`**, verificado con respuestas reales (`docs/muestras/forever/`):
  - 13 profesiones: Alquimia, Herrería, Encantamiento, Ingeniería, Peletería, Sastrería, Cocina, Primeros auxilios, Minería, Herboristería, Desuello, Pesca y una interna «Test Profession [DNT]», que se omite. No hay Inscripción ni Joyería.
  - Un único rango por profesión (p. ej. «Alchemy», 196 recetas), sin expansiones.
  - Las recetas traen `crafted_item`, `crafted_quantity.value` y `reagents[].{reagent.id, quantity}` completos. Por ejemplo, la 1378 («Elixir of Minor Strength») produce 1 × objeto 2454 con los reactivos 2449 × 1, 765 × 1 y 3371 × 1.
  - Sin `locale`, los nombres llegan con todos los idiomas; se usa `es_ES` o `es_MX` y, si falta, `en_US`.
- `dynamic-forever-us` no tiene índice de reinos ni de reinos conectados (404): Forever no tiene reinos. Solo existe `region/index`.

### Casas de subastas (`dynamic-forever-us`, no documentado; verificado el 12-11-2026)

- `/data/wow/ruleset/index` → ids 1 (JcJ), 2 (Normal), 3 (Rol), 15 (Rol JcJ).
- `/data/wow/ruleset/{r}/auctions/` → las mismas 15 casas para cualquier `r` («Casa de subastas: Alianza / Horda / Aguasnegras»). El contenido de cada casa tampoco depende de `r`.
- `/data/wow/ruleset/{r}/auctions/{casa}` → `auctions[].{item.id, buyout, quantity, bid?, bonus_lists?}` (≈ 12–15 MB; `quantity` = 1 en todas las de la muestra).
- `/data/wow/ruleset/{r}/auctions/{casa}/commodities` → `auctions[].{item.id, unit_price, quantity}`.
- La cabecera `Last-Modified` da el momento de la foto (≈ cada hora).

La API no nombra el modo de cada grupo de casas. Se asignó comparando el `minBuyout` de cada casa con los CSV de TSM (coincidencias exactas entre objetos comunes):

| Casas Alianza / Horda / Aguasnegras | Modo | Evidencia |
|---|---|---|
| 111 / 114 / 117 | Normal | 111 ↔ `normal-alliance`: 61 % (con `pvp-alliance`: 11 %) |
| 110 / 113 / 116 | JcJ | 110 ↔ `pvp-alliance`: 60 % (con `normal-alliance`: 10 %) |
| 119 / 120 / 121 | Rol | 119 ↔ `roleplay-alliance`: 76 % (123: 10 %) |
| 123 / 124 / 125 | Rol JcJ | por descarte; TSM `roleplay-pvp-alliance` existe |
| 112 / 115 / 118 | — | vacías (¿Hardcore, aún sin lanzar?) |

Resumen por objeto (`src/server/providers/blizzardAuctions.ts`): `minBuyout` = precio unitario mínimo; `marketValue` = media ponderada por cantidad del 15 % más barato del volumen publicado; `historical` sale del historial propio (media de los promedios diarios de 14 días). Las subastas sin compra inmediata se ignoran. Las variantes con `bonus_lists` del mismo `item.id` se agrupan.
- Otros namespaces probados (`static-classic-forever-us`, `static-forever1x-us`…) → 403.

## Lo que falta y cómo afecta al cálculo

| Laguna | Efecto |
|---|---|
| Comisión de subasta | 5 % en Alianza y Horda y 15 % en Aguasnegras (los valores de Classic) son supuestos configurables en «Ajustes». No están verificados para Forever. |
| Historial | Blizzard solo da la foto actual y TSM no publica Aguasnegras: `historical` se calcula con el historial propio (`price_history`) y los primeros días se basa en pocas fotos. |
| Profundidad de mercado | El costo siempre se marca como estimado; no se supone disponibilidad ilimitada. |
| Disponibilidad en vendedor | `purchase_price` de Blizzard no prueba que un vendedor venda el objeto. No se usa automáticamente; se puede introducir un precio manual. |
| Depósitos | No vienen en las fuentes; los introduce el usuario (perdidos o recuperables). |
| Habilidad requerida por receta | No se valida el nivel del personaje; se indica en las notas. |
| Desencantado y otros resultados aleatorios | Sin tablas verificadas: solo hay una calculadora manual de valor esperado. |
| Objetos con el mismo nombre y distinto ID | Se marcan como «datos insuficientes» salvo que el usuario asuma la variante manualmente. Nunca se unen precios por nombre. |
