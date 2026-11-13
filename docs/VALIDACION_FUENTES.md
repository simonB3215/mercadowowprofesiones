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

## Subida de nivel: Wowhead (WoW Forever)

Fecha de extracción: 13 de noviembre de 2026. Archivo: `data/leveling/forever-wowhead.json`.

- El catálogo de Blizzard **no publica** el nivel de aprendizaje ni los umbrales de dificultad (naranja, amarillo, verde, gris) de las recetas. Además, `skill_tier` de Forever indica `max_skill` = 75 en todas las profesiones (solo el rango Aprendiz), así que no sirve como máximo.
- Fuente: los listados de hechizos de Wowhead `https://www.wowhead.com/forever/spells/professions/{tailoring, blacksmithing, leatherworking, alchemy, enchanting, engineering, mining}` y `/forever/spells/secondary-skills/{cooking, first-aid}`. Cada fila trae `learnedat`, `colors` (4 umbrales), `nskillup`, `source`, `trainingcost` (cobre), `creates` y `reagents`.
- Wowhead responde **HTTP 202 sin contenido** a peticiones automáticas desde Node (protección contra bots). No se ha eludido: los datos se copiaron desde un navegador normal abriendo cada listado. Para actualizarlos hay que repetir ese proceso a mano.
- La ruta `/forever/spells/professions/cooking` no es válida: devuelve un listado genérico limitado a 1000 filas. Cocina y Primeros auxilios están en `secondary-skills`.
- El id de la línea de habilidad (`skill`) de Wowhead coincide con el id de profesión de Blizzard (197 Sastrería, 164 Herrería, 165 Peletería, 171 Alquimia, 333 Encantamiento, 202 Ingeniería, 185 Cocina, 129 Primeros auxilios, 186 Minería).
- Recetas útiles por profesión: Sastrería 414, Herrería 442, Peletería 509, Alquimia 183, Encantamiento 230, Ingeniería 259, Cocina 130, Primeros auxilios 30, Minería 18.
- `source` contiene 6 para las recetas de instructor. Las recetas **iniciales** (las que se conocen al aprender la profesión) no tienen fuente en Wowhead: se deducen como «sin fuente, naranja desde 0 y aprendizaje ≤ 50» (en esas filas `learnedat` coincide con el umbral amarillo). Es una inferencia y se muestra como tal.
- Herboristería, Desuello y Pesca no se incluyen: se suben recolectando.
- Los nombres en español se toman del catálogo de Blizzard solo si la receta coincide de forma única por objeto creado y materiales exactos; si no, se muestra el nombre inglés de Wowhead.
- **Tiempo de reutilización** (`data/leveling/forever-cooldowns.json`): los listados no lo traen. Se leyó del tooltip de cada hechizo (`https://nether.wowhead.com/tooltip/spell/{id}?dataEnv=16&locale=0`, texto «… cooldown»), consultado desde una página de Wowhead en el navegador, para las 2 215 recetas (13-11-2026). 15 tienen reutilización: las 13 transmutaciones (de 10 min a ≈ 2 días), Tela lunar (≈ 4 días) y Fogata básica (5 min). Los segundos se derivan del texto redondeado de Wowhead («1.958 days» = 47 h).

## Battle.net: inicio de sesión y perfil del personaje (PC-01, comprobado el 13-11-2026)

Documentación oficial consultada: guía de OAuth, WoW Classic Profile APIs y namespaces de Classic (community.developer.battle.net).

| Elemento | Contrato | Comprobado |
|---|---|---|
| Autorización | `GET https://oauth.battle.net/authorize` con `response_type=code`, `client_id`, `redirect_uri`, `scope=openid wow.profile` y `state` | Documentado. Sin inicio de sesión real (lo tiene que hacer el usuario). |
| Token | `POST https://oauth.battle.net/token`, `grant_type=authorization_code`, Basic `client_id:secret`; devuelve `access_token`, `expires_in` (≈ 24 h) y `scope`. **Sin token de renovación.** | Documentado; probado con respuestas simuladas. |
| Usuario | `GET https://oauth.battle.net/userinfo` → `sub`, `id`, `battletag` | Documentado. El propietario se identifica por `sub`. |
| Personajes de la cuenta | `GET /profile/user/wow` con el token del usuario (ámbito `wow.profile`) → `wow_accounts[].characters[]` | Documentado en Classic: `profile-classic1x-{región}` (Era), `profile-classic-{región}` (MoP) y `profile-classicann-{región}` (Aniversario). **Forever no aparece.** Con el token de la aplicación responde 403 en `profile-forever-us`, `profile-classic1x-us`, `profile-classicann-us`, `profile-classic-us` y `profile-us` (`npm run probe:profile`). Hace falta un token de usuario para saber si `profile-forever-us` responde. |
| Profesiones | `GET /profile/wow/character/{reino}/{nombre}/professions` | Solo documentado en retail (`primaries`/`secondaries` con `tiers[].skill_points`, `max_skill_points`, `known_recipes`). **Las Profile APIs de Classic no incluyen profesiones.** Si responde 404, se guarda «no disponible» y se piden los datos a mano. |
| Datos dinámicos de Forever | `dynamic-forever-us` | Índices de reinos y de reinos conectados → 404 (13-11-2026). Solo responden las casas de subastas (D21). |

Consecuencias:
- La lista de personajes y las profesiones de Forever **no están verificadas** con una cuenta real.
- El módulo prueba el namespace configurable `BNET_PROFILE_NAMESPACES` (por defecto `profile-forever-{región}`) y registra el código HTTP de cada intento.
- Sin profesiones de la API, usa datos manuales con procedencia.
- Forever (Classic) no tiene bonificaciones de habilidad, conocimiento ni especializaciones de profesión, así que el planificador no los modela.

## Tiempos de lanzamiento y herramientas (Wowhead, 13-11-2026)

`npm run sync:spells` lee el tooltip de las 2 215 recetas (`nether.wowhead.com/tooltip/spell/{id}?dataEnv=16`; desde Node responde 200 desde el 13-11-2026) y guarda `data/leveling/forever-spell-details.json` con:
- el tiempo de lanzamiento: de 2 a 60 s, ninguna receta sin dato;
- las herramientas («Blacksmith Hammer», varillas rúnicas, etc.).

El tiempo activo de una ruta es fabricaciones esperadas × tiempo de lanzamiento. **No hay datos verificados** de desplazamiento, compra, aprendizaje ni recolección: se muestran como «no incluido».

Los rangos del instructor (Oficial hasta 150, Experto hasta 225 y Artesano hasta 300, con nivel de personaje 10, 20 y 35) son reglas de Classic **sin verificar en Forever** y sin costo conocido. Se muestran como requisito «según las reglas de Classic».

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
| Probabilidad de subir un punto en amarillo y verde | No la publica ninguna fuente oficial. Se usa la fórmula de la comunidad (gris − nivel) / (gris − amarillo); el número de fabricaciones de esos tramos es una estimación. |
| Materiales de vendedor en la subida de nivel | Si un material (p. ej. Hilo rúnico) no se publica en la casa de subastas, ese tramo queda «sin datos» hasta que el usuario indica un precio manual. |
| Objetos con el mismo nombre y distinto ID | Se marcan como «datos insuficientes» salvo que el usuario asuma la variante manualmente. Nunca se unen precios por nombre. |
