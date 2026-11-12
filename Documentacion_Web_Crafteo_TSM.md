# Documentación para una web de rentabilidad de crafteo en WoW
Fecha de revisión: 11 de noviembre de 2026.
Documento funcional y técnico para entregar a un desarrollador, Claude o Codex.

## 1. Objetivo y alcance
Crear una página en español que muestre los objetos fabricables de todas las profesiones y permita decidir cuáles conviene fabricar para vender. Cada resultado debe explicar materiales, costo, precio de venta utilizado, ganancia después de comisiones, demanda y limitaciones.

Esto es una especificación de desarrollo propia basada en fuentes oficiales; no es documentación oficial de TSM ni una aplicación ya implementada. Se propone comenzar por Retail, manteniendo versión, expansión, región y reino como dimensiones separadas. Classic requiere un adaptador y catálogo propios: no se debe presentar como soportado hasta comprobar sus datos.

No se ha elegido el reino del usuario. Area 52 aparece únicamente como ejemplo de conexión.

## 2. Qué proporciona TSM y qué hay que construir
La documentación actual ofrece CSV públicos sin clave ni inicio de sesión. Para integraciones adicionales o datos ausentes, TSM indica contactar con su equipo. No basar un proyecto nuevo en tutoriales antiguos que exijan claves de la API anterior. [1][2]

TSM aporta referencias de mercado. El proyecto necesita además un catálogo de recetas, cantidades, resultados y restricciones. La fuente Crafting del addon depende de recetas conocidas y precios de materiales configurados; no equivale a disponer de un catálogo universal de crafteos en una web. [3]

| Componente | Procedencia propuesta | Validación necesaria |
|---|---|---|
| Precios y estadísticas | CSV públicos de TSM | Cabeceras reales, cobertura, antigüedad |
| Profesiones, recetas y objetos | API oficial de Blizzard | Campos y cobertura por versión |
| Materiales, resultados y calidades | Recetas oficiales; complemento versionado cuando falten datos | Cantidades y variantes comprobadas |
| Habilidad y recetas del personaje | Entrada manual inicial; importación posterior si es viable | No asumir que la API proporciona todos los detalles |
| Ganancia y clasificación | Motor propio | Fórmulas y supuestos visibles |
| Inventario y compras personales | Entrada o importación autorizada | Separar costo histórico y costo de reposición |

## 3. Conexión con TSM
Base: https://public-data.tradeskillmaster.com

Rutas de interés:
- /{gameType}/{regionSlug}/realm/{realmSlug}/items.csv
- /{gameType}/{regionSlug}/commodities.csv
- /{gameType}/{regionSlug}/region/items.csv

Ejemplo:
https://public-data.tradeskillmaster.com/retail/us/realm/area-52/items.csv

Los archivos de reino corresponden a objetos no commodity; commodities es regional en Retail. Precios: aproximadamente cada tres horas; estadísticas regionales: aproximadamente diarias. Los importes están en cobre. updatedAt corresponde al escaneo de origen. [1]

Implementación propuesta:
1. Descargar desde el servidor y conservar el archivo original con fecha de recepción.
2. Leer con un parser CSV, nunca separando líneas por comas manualmente.
3. Verificar cabeceras, tipos y contexto antes de activar el lote.
4. Convertir a un esquema interno estable.
5. Conservar el último lote correcto si falla la siguiente actualización.
6. Mostrar tanto antigüedad de origen como última sincronización.

No se han descargado ni validado muestras CSV en esta revisión. El contrato exacto de columnas debe verificarse en la integración. Los nombres internos de la sección 10 son una propuesta, no una reproducción del esquema de TSM.

## 4. Referencias de precio y demanda
Las siguientes son fuentes conceptuales del addon; deben mapearse explícitamente a campos disponibles en la descarga, sin asumir que comparten nombre. [3][4]

| Fuente | Significado para la web |
|---|---|
| DBMinBuyout | Menor precio de compra observado; no garantiza disponibilidad |
| DBMarket | Referencia de mercado calculada por TSM |
| DBRegionMarketAvg | Referencia promedio entre reinos de la región |
| DBRegionSaleAvg | Promedio regional de precios de compras y ventas registrados |
| DBRegionSaleRate | Frecuencia regional de venta por publicación |
| DBRegionSoldPerDay | Volumen medio diario por casa de subastas de la región, según definición de TSM |

Una tasa de venta de 0,4 no significa que el usuario venderá el 40 % de sus unidades hoy. El volumen regional tampoco es la cantidad que venderá su personaje. Son señales comparativas, no predicciones personales. [4]

La interfaz debe distinguir:
- Precio observado: referencia de publicaciones.
- Precio utilizado: valor elegido para calcular el escenario.
- Ganancia estimada: resultado condicionado a vender a ese precio.
- Beneficio realizado: solo existe si se registran compras, ventas y gastos efectivos.

## 5. Cobertura de profesiones
Esta es la cobertura exigida al producto; la disponibilidad de cada receta depende de la versión y del catálogo verificado.

| Profesión | Tratamiento requerido |
|---|---|
| Alquimia | Consumibles y transformaciones; rendimientos y restricciones por receta |
| Herrería | Equipo, herramientas y otros resultados comercializables |
| Encantamiento | Encantamientos comercializables; conversiones y desencantado como procesos separados |
| Ingeniería | Componentes y productos; restricciones de uso y vinculación |
| Inscripción | Tintas, componentes y productos finales; molienda separada |
| Joyería | Gemas y equipo; prospección con resultados probabilísticos cuando estén documentados |
| Peletería | Equipo, componentes y mejoras |
| Sastrería | Telas, bolsas y equipo |
| Cocina | Comidas y otros resultados, respetando unidades por fabricación |
| Minería | Recolección y transformaciones disponibles en la versión elegida |
| Herboristería | Materiales recolectados; alimentar costos de otras profesiones |
| Desuello | Materiales recolectados; alimentar costos de otras profesiones |
| Pesca | Capturas y materiales; alimentar costos de cocina y otras recetas |
| Arqueología y profesiones históricas | Mostrar solo si existen en la versión; evaluar únicamente resultados comercializables |

No inventar recetas para profesiones de recolección. Ofrecer un módulo distinto de materiales y valor de recolección. Incluir expansiones antiguas en el catálogo; permitir filtrarlas sin mezclarlas con las recetas actuales.

Los productos vinculados, servicios y pedidos de fabricación deben tener estados propios. No compararlos automáticamente con una venta normal en subasta.

## 6. Motor de costos
Calcular por ejecución de receta y luego por unidad producida. Para una receta determinista:

C_materiales = suma(cantidad_i × precio_i)
C_lote = C_materiales + C_adicional
C_unidad = C_lote / unidades_producidas

C_adicional permite incluir consumibles, desplazamiento o un costo de oportunidad elegido por el usuario. No introducir esos costos silenciosamente.

Reglas:
- Material propio no significa material gratuito. Mostrar costo de reposición y desembolso adicional como métricas distintas.
- Precio ausente se representa con null, nunca con cero.
- Respetar calidad, cantidad y variante de cada ingrediente.
- Si se requieren 100 materiales, el mínimo observado para una sola unidad no prueba que se puedan comprar 100 a ese precio.
- Sin profundidad de mercado, etiquetar el costo como estimado y dejar editar el precio.
- Si existe una alternativa de vendedor, verificar su disponibilidad y restricciones.
- Comparar comprar un componente con fabricarlo solo si la receta es accesible y el modelo tiene datos completos.
- Detectar ciclos en recetas encadenadas y no descontar dos veces materiales intermedios.

## 7. Ganancia y precio mínimo
Definir:
- Q: unidades vendibles producidas por lote.
- P: precio de venta por unidad.
- t: comisión aplicable, expresada como decimal.
- C: costo total del lote.
- D: depósitos que se estiman perdidos por cancelaciones o publicaciones sin venta.
- G: ganancia objetivo por lote.

Ingreso_neto_lote = Q × P × (1 − t)
Ganancia_lote = Ingreso_neto_lote − C − D
Ganancia_unidad = Ganancia_lote / Q
ROI = Ganancia_lote / C × 100
Precio_equilibrio = (C + D) / (Q × (1 − t))
Precio_para_objetivo = (C + D + G) / (Q × (1 − t))

Si C = 0, ROI es no definido; no mostrar infinito. Exigir Q > 0 y 0 ≤ t < 1.

La comisión debe configurarse según mercado y versión y verificarse antes de publicar. El 5 % del siguiente ejemplo es un supuesto ilustrativo, no una regla universal documentada aquí. D representa pérdidas, no todo depósito inicial: separar fondos inmovilizados de gastos definitivos.

Ejemplo ficticio:
- 10 materiales a 20 oro: 200 oro.
- 2 materiales a 50 oro: 100 oro.
- C = 300 oro, Q = 2, P = 200 oro, t = 0,05, D = 0.
- Ingreso neto = 2 × 200 × 0,95 = 380 oro.
- Ganancia por lote = 80 oro; por unidad = 40 oro.
- ROI exacto = 80/3 %.
- Precio de equilibrio exacto = 3000/19 oro por unidad.

Guardar precios observados en cobre entero y usar decimal exacto o racional en operaciones derivadas. No redondear silenciosamente: el precio publicable mínimo es el siguiente cobre entero que cumpla el objetivo, mientras que la fórmula exacta debe seguir disponible.

## 8. Calidades, especialización y resultados variables
El motor debe aceptar reglas versionadas por receta y parche. Antes de activar un cálculo avanzado, verificar su funcionamiento en la versión elegida; no transportar fórmulas antiguas sin validación.

Considerar como entradas, cuando correspondan:
- Calidad de materiales y resultado.
- Habilidad, equipo y especialización del personaje.
- Concentración consumida y disponibilidad.
- Producción adicional y ahorro de materiales.
- Reactivos opcionales y de acabado.
- Enfriamientos y materiales vinculados.

No aplicar automáticamente un porcentaje de producción adicional a todas las recetas. Un porcentaje de activación no es necesariamente el porcentaje de unidades extra. El ahorro también requiere conocer qué materiales y cantidades pueden recuperarse.

Para resultados aleatorios documentados:
Ingreso_esperado = suma(probabilidad_escenario × ingreso_neto_escenario)
Ganancia_esperada = Ingreso_esperado − costo_esperado − pérdidas_esperadas

Mostrar base sin bonificaciones y escenario esperado por separado. Si faltan las reglas, permitir un escenario manual rotulado como tal y excluirlo de recomendaciones automáticas.

Para concentración, mostrar ganancia incremental respecto a fabricar sin ella, dividida por concentración consumida, cuando ambas alternativas sean válidas. No tratarla como recurso ilimitado.

## 9. Decisión: ¿conviene fabricar?
La decisión debe separar rentabilidad, demanda y posibilidad de ejecución.

| Estado | Condición propuesta |
|---|---|
| Candidato rentable | Datos suficientes, fabricación viable, ganancia y ROI superiores a los objetivos |
| Rentable con demanda incierta | Beneficio positivo, sin evidencia suficiente de rotación |
| Margen insuficiente | Beneficio positivo por debajo del objetivo |
| No rentable en este escenario | Ganancia igual o inferior a cero |
| Datos insuficientes | Falta un precio, rendimiento, variante o regla indispensable |
| No fabricable por este personaje | No cumple requisitos o no conoce la receta |
| No vendible en subasta | Canal de venta incompatible |

Los umbrales de ganancia, ROI, antigüedad y demanda son preferencias del usuario, no reglas oficiales de TSM. No multiplicar ganancia por sale rate y llamarlo beneficio diario.

Presentar escenarios editable, base y con caída de precio. Una baja de precio definida por el usuario permite comprobar cuánto margen resiste el crafteo.

No recomendar grandes cantidades solo por tener ROI alto. La primera versión puede permitir cantidad manual y calcular el presupuesto; un planificador automático de cantidades requiere datos adicionales de oferta, rotación y comportamiento personal.

## 10. Modelo de datos propuesto
Estos nombres pertenecen a la aplicación.

| Entidad | Campos principales |
|---|---|
| market_context | game_version, region, realm, connected_realm, faction_if_applicable |
| item_variant | item_id, variant_key, name, quality, item_level, commodity_flag, tradeability |
| profession | profession_id, name |
| recipe | recipe_id, profession_id, expansion, patch, output_variant, output_quantity, requirements |
| recipe_reagent | recipe_id, slot, item_variant, quantity, optional_flag, alternatives |
| price_snapshot | context_id, item_variant, source, price_type, value_copper, source_time, fetched_at |
| demand_snapshot | context_id, item_variant, sale_rate, sold_per_day, source_time |
| character_profile | professions, known_recipes, skill_inputs, inventory, input_provenance |
| calculation | recipe_id, scenario, snapshot_ids, cost, proceeds, profit, roi, status, assumptions |
| ingestion_run | provider, context, status, checksum, rows_valid, rows_rejected, error |

La clave de un objeto debe incluir contexto y variante relevante. No unir dos rangos de calidad solo por compartir nombre. Si la fuente no distingue una variante, marcar la limitación.

Guardar referencias al lote de datos usado permite reproducir por qué una receta aparecía rentable en un momento determinado.

## 11. Pantallas
**Configuración inicial:** versión, región, reino, profesión, expansión y personaje opcional. No deducir región del país del usuario.

**Comparador:** búsqueda, filtros y tabla con objeto/calidad, profesión, unidades por lote, costo unitario, precio de venta, comisión, ganancia, ROI, demanda, antigüedad y estado. Ordenar por ganancia neta o ROI; permitir ocultar recetas no conocidas y resultados no vendibles.

**Detalle de receta:** materiales, cantidades, procedencia del precio, costo desglosado, requisitos y comparación entre comprar y fabricar. Permitir editar escenarios y ver por qué se asignó el estado.

**Lista de fabricación:** cantidades, materiales agregados, inventario disponible, compras pendientes, costo total e ingreso estimado. Mostrar el capital necesario antes de fabricar.

**Calidad de datos:** cobertura por profesión y expansión, recetas incompletas y fecha de actualización. “Todas las profesiones” no debe ocultar lagunas del catálogo.

## 12. Arquitectura e integración
Propuesta tecnológica: frontend React/Next.js, backend TypeScript o Python, PostgreSQL y tareas programadas. Es una elección de implementación, no una exigencia de TSM.

Separar cuatro módulos:
1. Adaptadores TSM/Blizzard.
2. Catálogo y normalización de variantes.
3. Motor puro de cálculo.
4. API y presentación.

Blizzard documenta rutas de profesiones y recetas, entre ellas: [5]
- /data/wow/profession/index
- /data/wow/profession/{id}
- /data/wow/profession/{profession-id}/skill-tier/{skill-tier-id}
- /data/wow/recipe/{id}

Revisar autenticación, namespaces, cobertura y contratos actuales en el portal oficial antes de implementar. La página dinámica de referencia no permitió inspeccionar el esquema completo durante esta revisión; no se garantiza que incluya todas las mecánicas modernas. [6]

API interna propuesta:
- GET /api/professions
- GET /api/recipes?professionId=...&expansion=...
- GET /api/opportunities?contextId=...&minProfit=...
- GET /api/recipes/{id}
- POST /api/calculate
- POST /api/crafting-plan

El servidor conserva credenciales de proveedores que las requieran. El navegador consulta la API interna. Validar tamaño de archivos, valores numéricos y contexto. Usar importaciones atómicas y no mezclar versiones incompatibles.

## 13. Orden de implementación y aceptación
**Paso 1 — Validar fuentes:** inspeccionar CSV reales y varias recetas representativas; documentar correspondencias y ausencias. Elegir versión, región y reino antes de mostrar resultados reales.

**Paso 2 — Catálogo completo:** incorporar todas las profesiones aplicables y expansiones disponibles, con cobertura visible. Los registros incompletos permanecen visibles con su motivo.

**Paso 3 — Cálculo básico:** recetas deterministas, comisiones configurables, búsqueda, filtros y detalle. No prometer mecánicas avanzadas aún no verificadas.

**Paso 4 — Personaje y escenarios:** recetas conocidas, inventario, calidades, restricciones y parámetros de fabricación.

**Paso 5 — Optimización:** subcrafteos, concentración, procesos probabilísticos y seguimiento de resultados reales.

Criterios de aceptación:
- Una receta con material sin precio no aparece como rentable.
- Dos unidades producidas no cargan el costo completo del lote a cada unidad.
- Un resultado vinculado no aparece como venta normal en subasta.
- La calidad del resultado coincide con la calidad del precio.
- Un mercado regional no se presenta como observación exclusiva de un reino.
- Una actualización fallida conserva el último dato válido y muestra su antigüedad.
- La tasa regional no se presenta como ventas diarias del usuario.
- Los cambios manuales recalculan todas las métricas y quedan identificados.
- El ejemplo de la sección 7 devuelve 80 oro por lote.
- Recetas cíclicas, C = 0 y cantidades inválidas se manejan sin resultados engañosos.

## 14. Fuentes oficiales y límites de verificación
Consultadas el 11 de noviembre de 2026.

[1] TradeSkillMaster — Public Pricing Data:
https://tradeskillmaster.com/public-data

[2] TradeSkillMaster — What is the TSM Public Web API and how do I use it?
https://support.tradeskillmaster.com/api-documentation/tsm-public-web-api

[3] TradeSkillMaster — Which Price Sources can I use and what do they mean?
https://support.tradeskillmaster.com/custom-strings/which-price-sources-can-i-use-and-what-do-they-mean

[4] TradeSkillMaster — Which Value Sources can I use and what do they mean?
https://support.tradeskillmaster.com/which-value-sources-can-i-use-and-what-do-they-mean

[5] Blizzard — World of Warcraft API Patch Notes, introducción de rutas de profesiones y recetas:
https://us.forums.blizzard.com/en/blizzard/t/world-of-warcraft-api-patch-notes-20200414/5680

[6] Blizzard — Portal de referencia actual:
https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis

Las fuentes respaldan las interfaces y definiciones indicadas. El diseño, las fórmulas generales, los estados, el esquema interno y la planificación son propuestas para este proyecto. No se ejecutaron consultas autenticadas a Blizzard ni un análisis de rentabilidad real de un reino.

