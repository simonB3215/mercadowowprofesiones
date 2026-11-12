Trabaja en `D:\mercadowowprofesiones` e implementa una página web funcional para consultar los crafteables de todas las profesiones de World of Warcraft y evaluar si conviene fabricarlos y venderlos.

Lee completos estos archivos antes de modificar el proyecto:

- `Documentacion_Web_Crafteo_TSM.md`
- `Product_Backlog_Web_Crafteo_TSM.md`

Úsalos como especificación funcional y técnica. Si ya leíste versiones anteriores, comprueba que estás trabajando con las actuales.

**Objetivo**

Quiero una aplicación que permita elegir versión del juego, región y reino, consultar profesiones y recetas, y comparar materiales, costo de fabricación, precio de venta, comisiones, ganancia neta, ROI y señales de demanda.

Necesito una aplicación implementada y verificable. No te quedes únicamente en un plan, una maqueta o tablas con datos ficticios.

**Forma de trabajar**

1. Inspecciona la carpeta y cualquier código existente. Conserva los cambios del usuario y continúa lo que ya esté hecho.
2. Lee las instrucciones del repositorio, si existen.
3. Resume brevemente lo encontrado y comienza la implementación.
4. Sigue las dependencias del backlog. Completa primero los P0 y después continúa con los P1 y P2 que puedas implementar y verificar.
5. Toma las decisiones técnicas rutinarias por tu cuenta y documenta las decisiones importantes. Pregunta solamente cuando falte información indispensable que no puedas obtener del proyecto.
6. Si una integración necesita credenciales, prepara su configuración y solicita únicamente lo necesario. Continúa con las tareas independientes mientras tanto.
7. No declares terminado un elemento por tener solamente su interfaz. Comprueba su funcionamiento y sus criterios de aceptación.
8. Si el contexto de la conversación se agota, deja información suficiente para continuar sin empezar de nuevo.

**Validación de fuentes**

Comprueba la documentación vigente de TSM y Blizzard antes de programar sus integraciones. La documentación entregada propone CSV públicos de TSM; verifica sus rutas, cabeceras, unidades y cobertura mediante muestras reales.

No confundas las fuentes del addon con campos disponibles en los archivos públicos. No inventes endpoints, propiedades, recetas, precios, estadísticas ni fórmulas de profesiones.

Obtén el catálogo de profesiones, recetas, ingredientes y resultados de fuentes verificables. Documenta cualquier información que falte y cómo afecta al cálculo.

Si una fuente falla, conserva el último conjunto válido e informa su antigüedad. Si nunca hubo datos válidos, muestra un estado vacío explicado.

Los datos ficticios pueden utilizarse en pruebas o en un modo de demostración claramente identificado, pero nunca como resultados reales.

**Cobertura**

Incluye todas las profesiones aplicables a la versión seleccionada, no solamente las más populares:

- Alquimia, Herrería, Encantamiento, Ingeniería, Inscripción, Joyería, Peletería, Sastrería y Cocina.
- Minería, Herboristería, Desuello y Pesca, diferenciando recolección y transformación.
- Profesiones históricas cuando correspondan a esa versión.

Incluye las expansiones que permitan las fuentes y ofrece filtros. Muestra la cobertura real por profesión y expansión, incluyendo recetas incompletas.

Comienza con Retail según los documentos. Implementa otras versiones con adaptadores y reglas propias; no presentes Classic como compatible hasta validarlo.

**Cálculos obligatorios**

Implementa las fórmulas y restricciones de la documentación:

- Costo por ejecución, lote y unidad producida.
- Ingreso neto después de comisión.
- Ganancia por lote y unidad.
- ROI y precio de equilibrio.
- Precio necesario para alcanzar una ganancia objetivo.
- Depósitos perdidos separados de depósitos recuperables.
- Costo de reposición separado del desembolso por materiales faltantes.
- Escenarios con precios manuales y caída del precio de venta.

Respeta estas reglas:

- Un precio desconocido nunca equivale a cero.
- Los materiales propios no son automáticamente gratuitos.
- No mezcles calidades, variantes, versiones ni mercados.
- Respeta cuántas unidades produce cada receta.
- No supongas disponibilidad ilimitada al precio mínimo.
- No clasifiques como rentable una receta con información indispensable incompleta.
- No presentes la tasa de venta regional como probabilidad diaria personal ni como garantía de venta.
- Separa los objetos vendibles en subasta de los vinculados, servicios y pedidos.
- Conserva precisión exacta; no redondees silenciosamente los resultados.

Las calidades, especializaciones, concentración, producción adicional, ahorro de materiales y enfriamientos requieren reglas comprobadas por receta y versión. Si faltan esas reglas, identifica la limitación y no inventes una recomendación.

**Pantallas y funciones**

Construye una interfaz en español, clara y adaptable a escritorio y móvil, que incluya:

1. Selector de versión, región y reino.
2. Catálogo de profesiones y expansiones.
3. Comparador de recetas con búsqueda, filtros y ordenación.
4. Detalle de receta con materiales, cantidades, requisitos y desglose de la ganancia.
5. Indicadores de demanda, procedencia y antigüedad de los datos.
6. Estados de rentabilidad acompañados de una explicación.
7. Simulador de escenarios.
8. Perfil manual del personaje y recetas conocidas.
9. Inventario, lista de fabricación y lista de compras.
10. Comparación entre comprar y fabricar componentes.
11. Funciones avanzadas y seguimiento de resultados reales según el backlog.

Sin un perfil suficiente, indica que la capacidad del personaje para fabricar está sin confirmar. No bloquees la consulta general del catálogo por no tener personaje registrado.

Usa tablas legibles, unidades explícitas, navegación por teclado y estados de carga, error y datos insuficientes. Evita botones sin funcionamiento.

**Implementación**

Si existe una estructura tecnológica razonable, continúa con ella. Si empiezas desde cero, elige una arquitectura mantenible y explica brevemente la elección.

Separa:

- Integración con proveedores.
- Catálogo y normalización de datos.
- Motor de cálculo.
- API.
- Interfaz.

Mantén las credenciales en el servidor. Incluye configuración de ejemplo sin secretos, persistencia, migraciones cuando correspondan y comandos claros para ejecutar el proyecto.

**Pruebas y comprobación**

Verifica como mínimo:

- Una receta que produce varias unidades.
- Material sin precio.
- Calidad sin correspondencia.
- Resultado no vendible.
- Cambio de región o reino.
- Fallo de sincronización.
- Datos desactualizados.
- Costo cero y cantidades inválidas.
- Recetas encadenadas con ciclos, cuando implementes subcrafteos.
- Inventario compartido entre varias recetas de un plan.

El caso de referencia con costo de 300 oro, producción de 2 unidades, venta de 200 oro por unidad, comisión de 0,05 y pérdidas de depósito de cero debe devolver 80 oro de ganancia por lote y 40 por unidad.

Ejecuta las comprobaciones apropiadas, inicia la aplicación y revisa sus flujos principales con las herramientas disponibles. Distingue lo probado de lo que no pudiste verificar.

**Documentación y continuidad**

Mantén actualizados dentro de la carpeta:

- `README.md`: instalación, configuración, ejecución y pruebas.
- `ESTADO_PROYECTO.md`: funciones terminadas, en curso y bloqueadas; decisiones y siguientes pasos.
- `Product_Backlog_Web_Crafteo_TSM.md`: estado por identificador PB y evidencia de aceptación.
- `.env.example`: variables necesarias sin credenciales reales.

Conserva los requisitos originales del backlog. No elimines elementos para presentar el proyecto como completo.

Al terminar cada entrega, informa brevemente qué funciona, qué verificaste y qué sigue. Continúa trabajando mientras existan tareas autorizadas y realizables.

Al finalizar, entrega la ubicación del proyecto, los comandos exactos para iniciarlo, las funcionalidades implementadas y los bloqueos concretos que permanezcan. No afirmes que está todo terminado si quedan requisitos pendientes.

Empieza ahora revisando los archivos y el proyecto existente.