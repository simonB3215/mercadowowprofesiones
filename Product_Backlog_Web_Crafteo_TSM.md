# Product Backlog — Web de rentabilidad de crafteo con TSM

Fecha: 11 de noviembre de 2026.
Versión inicial del backlog. Actualizado el 11 de noviembre de 2026 con el estado de implementación y la evidencia de aceptación (ver «Estado de implementación y evidencia»). La web no está desplegada todavía.

## Objetivo del producto

Permitir que un jugador consulte los crafteables de todas las profesiones, compare el costo de fabricación con el ingreso neto de venta y entienda si conviene fabricarlos según su mercado, demanda y capacidad de producción.

Basado en [Documentacion_Web_Crafteo_TSM.md](https://chatgpt.com/library?file_id=libfile_aab81902b1d48191b1b36b55fdbdfb68&account_id=personal). Los criterios siguientes son requisitos propuestos para el proyecto, no funcionalidades prometidas por TSM.

## Cómo usar este backlog

- **P0 — Imprescindible:** necesario para una primera versión útil y verificable.
- **P1 — Alta:** completa la planificación y el cálculo personalizado.
- **P2 — Posterior:** amplía seguimiento o versiones del juego.
- **Historia:** necesidad de un usuario con resultado observable.
- **Tarea técnica:** trabajo que habilita o asegura las funciones del producto.

Las dependencias determinan el orden técnico. La prioridad no sustituye esas dependencias. El equipo debe estimar cada elemento tras validar las fuentes; no se asignan plazos o puntos sin conocer capacidad y dificultad real.

Estado inicial: **Pendiente**. Flujo propuesto: Pendiente → En desarrollo → En revisión → Terminado. Un bloqueo conserva su motivo y responsable de resolución.

## Alcance de la primera versión

Comenzar con Retail, según la propuesta de la documentación, y permitir seleccionar una región y un reino soportados. Incluir todas las profesiones aplicables en el catálogo y todas las expansiones que la fuente pueda identificar. Mostrar explícitamente las lagunas.

El cálculo inicial cubre recetas deterministas con materiales, resultados y precios verificados. Las recetas avanzadas permanecen visibles, pero sin recomendación automática si aún no puede calcularse su calidad o rendimiento. Las profesiones de recolección tienen su espacio en el catálogo; su comparador económico ampliado se entrega en PB-24.

No se afirmará que se evalúa toda receta existente mientras existan faltantes en el catálogo. La cobertura debe poder auditarse por profesión y expansión.

## Resumen priorizado

| ID | Elemento | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| PB-01 | Validar las fuentes | P0 | — | En revisión (Blizzard bloqueado: credenciales) |
| PB-02 | Elegir versión, región y reino | P0 | PB-01 | Terminado |
| PB-03 | Normalizar objetos y variantes | P0 | PB-01 | En revisión (campos Blizzard) |
| PB-04 | Importar precios de TSM | P0 | PB-02, PB-03 | Terminado |
| PB-05 | Actualizar sin perder datos válidos | P0 | PB-04 | Terminado |
| PB-06 | Catálogo de todas las profesiones | P0 | PB-01, PB-03 | Bloqueado (credenciales Blizzard) |
| PB-07 | Materiales y resultados por receta | P0 | PB-06 | Bloqueado (datos reales) |
| PB-08 | Comprobar canal de venta | P0 | PB-03, PB-07 | En revisión (vinculación Blizzard) |
| PB-09 | Calcular costo de fabricación | P0 | PB-04, PB-07 | Terminado |
| PB-10 | Calcular ganancia y punto de equilibrio | P0 | PB-08, PB-09 | Terminado |
| PB-11 | Mostrar señales de demanda | P0 | PB-04 | Terminado |
| PB-12 | Clasificar oportunidades con explicación | P0 | PB-05, PB-08, PB-10, PB-11 | Terminado |
| PB-13 | Comparador con filtros y orden | P0 | PB-06, PB-12 | Terminado |
| PB-14 | Desglose de una oportunidad | P0 | PB-07, PB-10, PB-12 | Terminado |
| PB-15 | Editar escenarios de precios | P1 | PB-14 | Terminado |
| PB-16 | Perfil y recetas conocidas | P1 | PB-06, PB-12 | Terminado |
| PB-17 | Inventario y costo de reposición | P1 | PB-09, PB-16 | Terminado |
| PB-18 | Lista de fabricación y compras | P1 | PB-13, PB-17 | Terminado |
| PB-19 | Comparar comprar y fabricar componentes | P1 | PB-09, PB-16, PB-18 | Terminado |
| PB-20 | Calcular con habilidad y calidades | P1 | PB-07, PB-16 | Bloqueado (reglas no verificadas) |
| PB-21 | Producción adicional y ahorro | P1 | PB-09, PB-20 | Bloqueado (reglas no verificadas) |
| PB-22 | Concentración y enfriamientos | P1 | PB-18, PB-20 | En desarrollo (solo manual) |
| PB-23 | Transformaciones y resultados aleatorios | P1 | PB-06, PB-21 | En desarrollo (solo manual) |
| PB-24 | Valor de materiales recolectados | P1 | PB-06, PB-09 | Terminado |
| PB-25 | Registrar resultados reales | P2 | PB-17, PB-18 | Terminado |
| PB-26 | Incorporar Classic y otras versiones | P2 | PB-01, PB-03, PB-06, PB-10 | Bloqueado (no validado) |
| PB-27 | Interfaz usable en móvil y teclado | P0 | PB-13, PB-14 | Terminado |
| PB-28 | Publicar una versión verificable | P0 | PB-01 a PB-14, PB-27 | En desarrollo (sin desplegar) |

## Estado de implementación y evidencia

Actualizado el 11 de noviembre de 2026. «Terminado» exige que se cumplan los criterios con una verificación reproducible; un elemento que solo tiene interfaz no cuenta como terminado. Las pruebas citadas están en `tests/` (`npm test`: 59 pruebas en verde). La revisión en el navegador se hizo con `npm run dev`.

| ID | Estado | Evidencia / bloqueo |
|---|---|---|
| PB-01 | En revisión | TSM: muestras reales guardadas y contrato documentado en `docs/VALIDACION_FUENTES.md`; pruebas en `tests/market.test.ts`. Blizzard: rutas y OAuth verificados en la documentación oficial, pero los campos de respuesta no, porque faltan credenciales. `npm run probe:blizzard` guardará muestras. No se ha probado una receta por profesión. |
| PB-02 | Terminado | Selector de versión, región y reino persistente; el reino se valida contra TSM (404 = no soportado). Cambiar de contexto recalcula (prueba «cambiar de contexto»; `tests/market.test.ts` «no mezcla datos»). No se usa geolocalización ni un reino por defecto. |
| PB-03 | En revisión | La clave es `game_version` + `itemId`; se detectan variantes por nombre sin unir precios (prueba «rangos de calidad tienen itemId propios»). Falta verificar los campos de calidad y vinculación de Blizzard. |
| PB-04 | Terminado | Parser CSV, validación de cabecera, cobre entero, `null` para ausentes, separación commodities/reino/región. Probado con datos reales (US/Area 52) en la app y en `tests/market.test.ts`. |
| PB-05 | Terminado | Activación atómica, conservación del último lote ante fallo o rechazo, registro de intentos y antigüedad (pruebas «fallo de sincronización», «cabecera incorrecta»). Programación: botón bajo demanda y Vercel Cron diario. |
| PB-06 | Bloqueado | El código de sincronización y la pantalla de cobertura están listos y probados con el catálogo demo. Faltan las credenciales de Blizzard. Las profesiones requeridas sin datos se muestran como laguna, no como ausencia. |
| PB-07 | Bloqueado | La lógica de ingredientes, cantidades, rendimiento y bloqueo está probada en demo (rendimiento variable, receta sin ingredientes). Falta el catálogo real. Los ingredientes opcionales no se suman (prueba del motor). |
| PB-08 | En revisión | Canales subasta / vinculado / servicio / desconocido (pruebas «resultado ligado», «servicio sin objeto», «vendibilidad desconocida»). La vinculación real depende de un campo de Blizzard aún no verificado. |
| PB-09 | Terminado | `computeCost`: precio ausente → `null`; reposición frente a desembolso; precisión exacta; costo marcado como estimado (pruebas del motor y «material sin precio»). |
| PB-10 | Terminado | Caso de referencia 80/40 o, C = 0 → ROI no definido, validación de Q y t (`tests/engine.test.ts`). |
| PB-11 | Terminado | Tasa y volumen regionales con fecha y ámbito, con advertencia de que no son ventas personales; no se calcula «beneficio diario». |
| PB-12 | Terminado | Siete estados con motivos; umbrales configurables; los datos desactualizados o los valores manuales impiden un candidato automático (pruebas de clasificación y «datos desactualizados»). |
| PB-13 | Terminado | Comparador con búsqueda, profesión, expansión, calidad, estado, orden por ganancia/ROI/costo y paginación; los ausentes van al final (prueba «ordena sin tratar ausentes como cero»). Revisado en el navegador. |
| PB-14 | Terminado | Detalle con materiales, procedencia y fecha de cada precio, comisión, fórmulas y estado explicado; la vuelta al comparador conserva los filtros. Revisado en el navegador. |
| PB-15 | Terminado | Escenarios con precios manuales, comisión, depósitos, objetivo y caída de precio; los datos de origen no se modifican; marca «Editado»/«Valores manuales»; restaurar y guardar (prueba «escenario con caída de precio»). Revisado en el navegador. |
| PB-16 | Terminado | Perfil manual con profesiones, recetas e inventario; estados no fabricable / conoce / sin confirmar (prueba «perfil»). La habilidad se registra, pero no se valida (sin regla verificada). |
| PB-17 | Terminado | Inventario por ID de objeto; reposición separada del desembolso; sin doble asignación (prueba «plan con inventario compartido»). No se registra el costo histórico de compra. |
| PB-18 | Terminado | Ejecuciones o unidades con excedente, agregación de materiales, compras, desembolso, total incompleto si falta un precio. Revisado en el navegador (12 unidades → 3 ejecuciones, excedente 3). |
| PB-19 | Terminado | Comprar o fabricar recursivo solo con recetas accesibles; ciclos detectados y marcados (pruebas «comprar o fabricar» y «ciclo barra ↔ polvo»). |
| PB-20 | Bloqueado | No hay reglas verificadas de calidad por receta y parche. Se muestra la limitación y se permite una suposición manual etiquetada. |
| PB-21 | Bloqueado | No hay reglas verificadas. Solo rendimiento manual etiquetado, excluido de la recomendación automática. |
| PB-22 | En desarrollo | Calculadora manual de ganancia incremental por punto de concentración (consumo 0 → sin eficiencia). Faltan los enfriamientos y la integración en el plan. |
| PB-23 | En desarrollo | Calculadora manual de valor esperado con probabilidades que deben sumar exactamente 1. Faltan fuentes verificadas de molienda, prospección y desencantado. |
| PB-24 | Terminado | Pantalla de materiales: valor neto de venta frente a valor por unidad usado en cada receta, con los mismos supuestos; oro por hora solo con datos del usuario. Sin recetas inventadas para la recolección (prueba «materiales»). |
| PB-25 | Terminado | Registro de compras, ventas, gastos, depósitos perdidos y fabricaciones; beneficio realizado separado de lo pendiente; corrección por reemplazo sin duplicar (prueba «registro real»). |
| PB-26 | Bloqueado | Classic y Classic progresión aparecen deshabilitados con su motivo. TSM publica datos para ellos (verificado), pero faltan el catálogo y las reglas. |
| PB-27 | Terminado | Tabla convertida en tarjetas a 375 px sin desplazamiento horizontal (comprobado: scrollWidth = 375); etiquetas en todos los controles, foco visible, estados con texto y unidades (o/p/c). No se hizo una auditoría completa con lector de pantalla. |
| PB-28 | En desarrollo | Probados datos válidos, incompletos, fallos, aislamiento entre mercados y casos de cálculo. Secretos solo en el servidor y RLS activado. Configuración de Vercel/Supabase lista y función verificada compilada; **sin desplegar** y sin catálogo real. |

## Historias y criterios de aceptación

### PB-01 — Validar las fuentes

**Tipo:** Tarea técnica. **Prioridad:** P0. **Dependencias:** —.

Como desarrollador, quiero comprobar los datos reales de TSM y Blizzard para construir sobre campos disponibles.

**Criterios de aceptación**

1. Guardar muestras y registrar cabeceras, tipos, unidades, fechas y contexto de mercado.
2. Documentar qué campos de recetas, materiales y variantes están disponibles y cuáles faltan.
3. Probar al menos una receta representativa de cada profesión de fabricación; registrar los bloqueos sin inventar datos.

### PB-02 — Elegir versión, región y reino

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-01.

Como jugador, quiero seleccionar mi mercado para obtener resultados aplicables a mi juego.

**Criterios de aceptación**

1. Permitir elegir únicamente combinaciones soportadas y conservar la selección.
2. Cambiar de mercado invalida resultados anteriores y vuelve a calcular con el contexto correcto.
3. No seleccionar región por ubicación geográfica ni usar un reino de ejemplo como dato personal.

### PB-03 — Normalizar objetos y variantes

**Tipo:** Tarea técnica. **Prioridad:** P0. **Dependencias:** PB-01.

Como desarrollador, quiero identificar objetos y calidades sin ambigüedad para evitar cruces de precios incorrectos.

**Criterios de aceptación**

1. La identidad distingue versión, identificador y variante relevante; el nombre no es la clave.
2. Conservar calidad, expansión, vinculación y procedencia cuando estén disponibles.
3. Una variante sin correspondencia fiable queda sin precio utilizable y con motivo visible.

### PB-04 — Importar precios de TSM

**Tipo:** Tarea técnica. **Prioridad:** P0. **Dependencias:** PB-02, PB-03.

Como jugador, quiero precios obtenidos de TSM para comparar costos y ventas.

**Criterios de aceptación**

1. Procesar CSV con un parser y validar su contrato antes de guardar.
2. Distinguir commodities regionales, objetos de reino y estadísticas regionales.
3. Guardar importes en cobre, fecha de origen y lote; datos ausentes se representan como null.

### PB-05 — Actualizar sin perder datos válidos

**Tipo:** Tarea técnica. **Prioridad:** P0. **Dependencias:** PB-04.

Como jugador, quiero saber cuándo se actualizaron los precios para evaluar su vigencia.

**Criterios de aceptación**

1. Programar sincronizaciones según la disponibilidad comprobada de cada fuente.
2. Si una importación falla o llega incompleta, conservar el último lote válido y mostrar el incidente.
3. Activar lotes de forma atómica; registrar errores, cantidades procesadas y antigüedad.

### PB-06 — Catálogo de todas las profesiones

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-01, PB-03.

Como jugador, quiero consultar todas las profesiones para encontrar oportunidades sin limitarme a una sola.

**Criterios de aceptación**

1. Incluir Alquimia, Herrería, Encantamiento, Ingeniería, Inscripción, Joyería, Peletería, Sastrería y Cocina con las recetas disponibles.
2. Incluir Minería, Herboristería, Desuello y Pesca con su tratamiento de recolección o transformación; profesiones históricas solo cuando correspondan.
3. Mostrar cobertura por profesión y expansión: recetas completas, incompletas y causas; una laguna no aparece como ausencia confirmada de recetas.

### PB-07 — Materiales y resultados por receta

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-06.

Como jugador, quiero ver qué requiere y qué produce una receta para entender el costo.

**Criterios de aceptación**

1. Mostrar ingredientes, cantidades, calidades y unidades obtenidas por ejecución.
2. Distinguir ingredientes obligatorios, opcionales y alternativas sin sumarlos todos automáticamente.
3. Si el rendimiento o un ingrediente indispensable no está definido, impedir la clasificación automática como rentable.

### PB-08 — Comprobar canal de venta

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-03, PB-07.

Como jugador, quiero saber si puedo vender el resultado en subasta para no fabricar algo incompatible.

**Criterios de aceptación**

1. Marcar resultados no vendibles en subasta y restricciones conocidas.
2. Separar pedidos y servicios de los artículos que se venden directamente.
3. Si se desconoce la comercialización del resultado, mostrar datos insuficientes.

### PB-09 — Calcular costo de fabricación

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-04, PB-07.

Como jugador, quiero conocer el costo por lote y por unidad para compararlo con la venta.

**Criterios de aceptación**

1. Sumar cantidad por precio de cada material y costos adicionales explícitos; dividir por unidades producidas.
2. Si falta un precio, no convertirlo en cero ni emitir una recomendación favorable.
3. Mantener precisión exacta y mostrar que el costo es estimado cuando no se conoce disponibilidad para toda la cantidad.

### PB-10 — Calcular ganancia y punto de equilibrio

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-08, PB-09.

Como jugador, quiero conocer la ganancia después de gastos para decidir si vale la pena fabricar.

**Criterios de aceptación**

1. Calcular ingreso neto, ganancia por lote/unidad, ROI y precio de equilibrio con comisión y depósitos perdidos configurados.
2. Validar cantidades positivas y comisión entre 0 inclusive y 1 exclusivo; con costo cero mostrar ROI no definido.
3. El caso C=300 oro, Q=2, P=200 oro, comisión=0,05 y depósitos perdidos=0 devuelve 80 oro por lote y 40 por unidad.

### PB-11 — Mostrar señales de demanda

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-04.

Como jugador, quiero distinguir margen y demanda para valorar el riesgo de no vender.

**Criterios de aceptación**

1. Mostrar tasa y volumen disponibles con ámbito y fecha; identificar métricas ausentes.
2. Explicar que la tasa regional no es una probabilidad de venta diaria individual.
3. No convertir volumen regional en ventas del personaje ni ganancia por tasa en beneficio diario.

### PB-12 — Clasificar oportunidades con explicación

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-05, PB-08, PB-10, PB-11.

Como jugador, quiero un estado explicado para entender si el crafteo conviene en el escenario elegido.

**Criterios de aceptación**

1. Mostrar candidato rentable, demanda incierta, margen insuficiente, no rentable, datos insuficientes o no vendible según corresponda.
2. Aplicar objetivos configurables de ganancia y ROI; si los precios superan el umbral de antigüedad, impedir recomendación automática favorable.
3. Mostrar las razones; sin perfil validado indicar que la viabilidad para el personaje está sin confirmar.

### PB-13 — Comparador con filtros y orden

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-06, PB-12.

Como jugador, quiero comparar los crafteables en una tabla para encontrar opciones relevantes.

**Criterios de aceptación**

1. Mostrar objeto/calidad, profesión, unidades por lote, costo, precio, ganancia, ROI, demanda, fecha y estado.
2. Buscar por nombre y filtrar por profesión, expansión, calidad y estado; ordenar por ganancia o ROI.
3. Paginación y estados de carga, error y sin resultados conservan los filtros; los valores ausentes no se ordenan como cero.

### PB-14 — Desglose de una oportunidad

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-07, PB-10, PB-12.

Como jugador, quiero abrir una receta para revisar de dónde sale la ganancia.

**Criterios de aceptación**

1. Mostrar materiales y subtotal, precio de venta elegido, comisiones, pérdidas y fórmulas.
2. Identificar fuente, contexto y fecha de cada precio utilizado.
3. Permitir volver al comparador sin perder filtros; diferenciar estimación de beneficio realizado.

### PB-15 — Editar escenarios de precios

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-14.

Como jugador, quiero ajustar los precios para comprobar cómo cambia el margen.

**Criterios de aceptación**

1. Editar costos, precio de venta, comisión y pérdidas sin sobrescribir los datos de origen.
2. Comparar escenario base y escenario con caída de precio elegida por el usuario.
3. Recalcular métricas y estados; etiquetar cambios manuales y permitir restaurar el escenario base.

### PB-16 — Perfil y recetas conocidas

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-06, PB-12.

Como jugador, quiero registrar mis profesiones y recetas para distinguir lo que puedo fabricar.

**Criterios de aceptación**

1. Crear un perfil manual con profesiones, recetas conocidas y requisitos disponibles.
2. Filtrar recetas conocidas y mostrar no fabricable cuando un requisito comprobable no se cumple.
3. No interpretar datos desconocidos como requisito cumplido; indicar fecha y procedencia de los datos del perfil.

### PB-17 — Inventario y costo de reposición

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-09, PB-16.

Como jugador, quiero registrar materiales propios para saber cuánto necesito comprar.

**Criterios de aceptación**

1. Descontar inventario de compras pendientes sin volver gratuito el costo económico de fabricación.
2. Mostrar por separado costo de reposición, desembolso adicional y costo histórico si se registró.
3. Conservar cantidades por variante y evitar asignar el mismo material a dos recetas del mismo plan.

### PB-18 — Lista de fabricación y compras

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-13, PB-17.

Como jugador, quiero preparar un lote de recetas para organizar materiales y presupuesto.

**Criterios de aceptación**

1. Elegir cantidades de ejecuciones o resultados, identificando la unidad; si se solicitan resultados, informar ejecuciones enteras y excedente.
2. Agrupar materiales, aplicar inventario y mostrar compras pendientes, desembolso y ganancia estimada.
3. Con precio faltante, mostrar total incompleto; no proponer cantidades como garantía de ventas.

### PB-19 — Comparar comprar y fabricar componentes

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-09, PB-16, PB-18.

Como jugador, quiero comparar componentes comprados y fabricados para elegir el costo viable.

**Criterios de aceptación**

1. Comparar únicamente recetas accesibles con datos completos y restricciones satisfechas.
2. Detectar ciclos y conservar el camino de fabricación elegido.
3. No duplicar costos ni descontar inventario dos veces al expandir subrecetas.

### PB-20 — Calcular con habilidad y calidades

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-07, PB-16.

Como jugador, quiero que el cálculo respete mi capacidad de fabricación para valorar un resultado alcanzable.

**Criterios de aceptación**

1. Registrar habilidad, especialización, equipo y reactivos pertinentes al modelo verificado.
2. Aplicar reglas por receta y parche; el precio debe corresponder a la calidad obtenible.
3. Si el modelo no puede determinar el resultado, mostrar limitación y permitir solo simulación manual identificada.

### PB-21 — Producción adicional y ahorro

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-09, PB-20.

Como jugador, quiero considerar bonificaciones documentadas para comparar el costo base con el esperado.

**Criterios de aceptación**

1. Separar probabilidad de activación, cantidad adicional y materiales recuperables.
2. Mostrar escenario base y esperado; usar reglas comprobadas por receta sin extenderlas a todas las profesiones.
3. No contar el mismo ahorro dos veces; entradas inválidas o reglas incompletas bloquean la recomendación avanzada.

### PB-22 — Concentración y enfriamientos

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-18, PB-20.

Como jugador, quiero comparar usos de recursos limitados para priorizar mi fabricación.

**Criterios de aceptación**

1. Comparar alternativas válidas con y sin concentración y calcular ganancia incremental por punto consumido.
2. Respetar concentración disponible y enfriamientos en el plan.
3. Con consumo cero o reglas desconocidas, no calcular una eficiencia falsa ni recomendar un plan imposible.

### PB-23 — Transformaciones y resultados aleatorios

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-06, PB-21.

Como jugador, quiero evaluar molienda, prospección, desencantado y otras conversiones cuando existan datos fiables.

**Criterios de aceptación**

1. Separar transformaciones deterministas y procesos probabilísticos.
2. En resultados excluyentes, verificar probabilidades coherentes; para múltiples subproductos usar un modelo conjunto o cantidades esperadas documentadas.
3. Mostrar rendimiento esperado, procedencia y limitación; no presentar el resultado esperado como garantizado por ejecución.

### PB-24 — Valor de materiales recolectados

**Tipo:** Historia. **Prioridad:** P1. **Dependencias:** PB-06, PB-09.

Como jugador, quiero comparar vender mis materiales o utilizarlos para fabricar.

**Criterios de aceptación**

1. Mostrar el valor neto de vender materiales y el de la alternativa de fabricación con supuestos comparables.
2. No inventar recetas en profesiones de recolección.
3. Calcular oro por hora únicamente si el usuario proporciona tiempo y rendimiento o existe una fuente validada; indicar su procedencia.

### PB-25 — Registrar resultados reales

**Tipo:** Historia. **Prioridad:** P2. **Dependencias:** PB-17, PB-18.

Como jugador, quiero registrar compras y ventas para comparar estimaciones con resultados.

**Criterios de aceptación**

1. Registrar cantidades, variantes, fechas, precios y gastos efectivos.
2. Separar productos pendientes de venta del beneficio realizado.
3. Comparar resultado real y estimación conservando el escenario original; corregir registros sin duplicar operaciones.

### PB-26 — Incorporar Classic y otras versiones

**Tipo:** Tarea técnica. **Prioridad:** P2. **Dependencias:** PB-01, PB-03, PB-06, PB-10.

Como jugador de otra versión, quiero cálculos adaptados a su economía y recetas.

**Criterios de aceptación**

1. Validar fuentes, catálogos, mercados, facciones y comisiones de cada versión antes de habilitarla.
2. Mantener datos y reglas separados; no reutilizar mecánicas Retail sin validación.
3. Si una versión no tiene cobertura suficiente, mantenerla no disponible y explicar qué falta.

### PB-27 — Interfaz usable en móvil y teclado

**Tipo:** Historia. **Prioridad:** P0. **Dependencias:** PB-13, PB-14.

Como jugador, quiero consultar la web desde distintos dispositivos y con controles accesibles.

**Criterios de aceptación**

1. Tabla y detalle permiten acceder a todos los valores en pantallas estrechas sin ocultar información esencial.
2. Filtros y acciones funcionan con teclado, foco visible y etiquetas comprensibles.
3. Los estados se identifican mediante texto además de color; las cantidades muestran su unidad.

### PB-28 — Publicar una versión verificable

**Tipo:** Tarea técnica. **Prioridad:** P0. **Dependencias:** PB-01 a PB-14, PB-27.

Como responsable del producto, quiero una versión comprobable para usar cálculos consistentes.

**Criterios de aceptación**

1. Probar integración con datos válidos, incompletos y fallos de sincronización; revisar aislamiento entre mercados y variantes.
2. Ejecutar casos de cálculo exacto, receta con varias unidades, precio ausente, resultado no vendible y fuente desactualizada.
3. Mantener secretos en servidor, validar entradas y permitir recuperación de datos; mostrar cobertura y limitaciones antes de declarar lista la versión.

## Entregas propuestas

Estas entregas representan resultados verificables, no sprints con duración comprometida.

| Entrega | Elementos | Resultado |
|---|---|---|
| 1. Datos y catálogo | PB-01 a PB-08 | Mercado seleccionado, datos importados, profesiones y recetas con cobertura visible |
| 2. Comparador inicial | PB-09 a PB-14, PB-27, PB-28 | Costo, ganancia, demanda y explicación para recetas calculables |
| 3. Planificación personal | PB-15 a PB-19 | Escenarios, perfil, inventario, compras y componentes |
| 4. Cálculo avanzado | PB-20 a PB-24 | Calidades, bonificaciones, concentración y procesos especiales validados |
| 5. Ampliación | PB-25 y PB-26 | Seguimiento real y otras versiones verificadas |

La primera versión utilizable comprende las entregas 1 y 2. Para cada ampliación se vuelven a aplicar los criterios transversales de PB-28 a las funciones modificadas.

## Reglas de aceptación transversales

1. **Precisión:** precios en cobre; operaciones derivadas con decimal exacto o racional. Mostrar fracción cuando el resultado exacto no termine. El mínimo publicable puede ajustarse al cobre entero superior, explicando ese ajuste.
2. **Unidades:** diferenciar ejecución, lote y unidad vendible; no confundir oro con cobre ni porcentajes con decimales.
3. **Datos incompletos:** nunca equivalen a cero, a receta imposible o a ausencia confirmada de oferta.
4. **Contexto:** toda consulta utiliza versión, región, reino y variante correctos.
5. **Actualización:** presentar la antigüedad real y bloquear recomendaciones cuando los datos no cumplen la vigencia configurada.
6. **Transparencia:** indicar precios manuales, supuestos, fórmulas y motivos de clasificación.
7. **Demanda:** ninguna señal regional se presenta como garantía de venta personal.
8. **Materiales propios:** el desembolso puede disminuir, pero el costo de oportunidad no desaparece automáticamente.
9. **Cobertura:** toda profesión aplicable aparece con sus datos o con una explicación del faltante.
10. **Alcance:** un dato de prueba se identifica como ficticio y nunca se mezcla con resultados reales.

## Definición de terminado

Un elemento se considera terminado cuando cumple sus criterios de aceptación, funciona integrado con sus dependencias, maneja errores relevantes, cuenta con verificación adecuada al cambio y tiene documentadas sus limitaciones. Debe poder demostrarse con un caso reproducible.

La documentación se actualiza si cambia una fórmula, una fuente o un supuesto. La revisión debe comprobar que no se presentan estimaciones como beneficios ya obtenidos.

## Decisiones pendientes antes de implementar

| Decisión | Propuesta inicial | Efecto |
|---|---|---|
| Versión inicial | Retail | Define catálogo y reglas; otras versiones en PB-26 |
| Región y reino | Selección del usuario | Define el contexto de precios |
| Expansiones | Todas las disponibles, con filtro | Evita limitar el catálogo a la expansión actual |
| Ganancia y ROI mínimos | Configurables | Determina qué se clasifica como candidato |
| Antigüedad máxima | Configurable por fuente tras PB-01 | Evita recomendaciones con datos fuera de vigencia |
| Comisión y depósitos | Parámetros verificados por mercado | Afecta ingreso neto y equilibrio |
| Perfil de personaje | Manual inicialmente | Permite avanzar sin prometer una importación completa |
| Tecnología y alojamiento | Por definir durante implementación | Determina operación, persistencia y costos |

Estas decisiones no impiden usar este backlog para preparar tareas. PB-01 debe resolver los contratos de datos antes de comprometer fórmulas dependientes de mecánicas no verificadas.

