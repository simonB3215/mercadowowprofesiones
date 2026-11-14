# Estado del proyecto

Última actualización: 13 de noviembre de 2026.

## Resumen

La aplicación trabaja **solo con World of Warcraft: Forever**. Está desplegada en Vercel (https://mercadowowprofesiones.vercel.app), protegida con `APP_PASSWORD`, y conectada a **Supabase**. El código está en GitHub (repositorio público `simonB3215/mercadowowprofesiones`). Comprobado:
- 144 pruebas automáticas en verde, `tsc` sin errores y `npm run build` correcto (13-11-2026).
- Catálogo real de Forever en Supabase: 12 profesiones, 2 493 recetas y 2 358 objetos (recetas completas).
- Precios reales: casas de subastas desde la API de Blizzard (incluida Aguasnegras) y estadísticas regionales de TSM. Casa por defecto: JcJ — Horda.
- Rediseño visual (12-11-2026): estilo del propio juego (paneles oscuros tipo tooltip, títulos dorados, colores de calidad y monedas de oro, plata y cobre) e iconos de WoW por id. Revisado en el navegador a 1440, 800 y 375 px (ver «Interfaz» abajo y `docs/SISTEMA_VISUAL.md`).

## Funciones terminadas (verificadas)

- **Motor de cálculo exacto:** costo por ejecución, lote y unidad; ingreso neto; ganancia; ROI (no definido si C = 0); equilibrio; precio objetivo; mínimo publicable; depósitos perdidos frente a recuperables; reposición frente a desembolso; caída de precio. El caso de referencia da 80 o por lote y 40 o por unidad.
- **Ingesta de precios:** casa de subastas desde Blizzard (resumen por objeto) con TSM de respaldo; parser CSV con validación de cabeceras; precios 0 → `null`; activación atómica; el fallo conserva el último lote; poda de lotes antiguos; registro de intentos.
- **Casas de subastas:** 4 modos (Normal, JcJ, Rol, Rol JcJ) × Alianza, Horda y Aguasnegras; comisión separada para Aguasnegras.
- **Evaluación de recetas:**
  - Canal de venta: subasta, vinculado, servicio o desconocido.
  - Rendimiento variable y facción.
  - Bloqueo por variantes con el mismo nombre.
  - Antigüedad de los datos.
  - Demanda regional con advertencias.
  - Perfil del personaje.
  - Siete estados con sus motivos.
- **Interfaz:**
  - Selector de mercado y personaje.
  - Comparador con búsqueda, filtros, orden (los valores ausentes van al final) y paginación.
  - Detalle con fórmulas, procedencia y fecha de cada precio.
  - Simulador de escenarios (guardar, cargar, restaurar).
  - Comprar o fabricar con detección de ciclos.
  - Catálogo y cobertura.
  - Calidad de datos.
  - Perfil (profesiones, recetas conocidas, inventario).
  - Lista de fabricación y compras con inventario compartido.
  - Materiales: vender o usar, y oro por hora con datos del usuario.
  - Subir de nivel (`#/nivel`, D27): ruta más barata por profesión (9 de fabricación; las de recolección no), receta por tramo, color de dificultad, fabricaciones estimadas, materiales, costo con precios de la casa de subastas, costo del instructor, lista de compra y precios manuales para materiales sin precio. Comprobado con datos reales: Sastrería 1→300 ≈ 463 o con tramos sin datos desde 250; Alquimia 1→300 ≈ 38 o completa. Las recetas con tiempo de reutilización (transmutaciones, Tela lunar, Fogata básica) no se usan (D29). Los materiales que solo venden los vendedores (hilos, tintes, lejía…) usan el precio del vendedor si es más barato que la subasta, con la etiqueta «vendedor» (D35).
  - Reutilización (PB-22, D31): las 13 transmutaciones y Tela lunar llevan la etiqueta «1 cada X» en el comparador y el detalle; el plan de fabricación avisa del tiempo mínimo para repetirlas.
  - Registro real con correcciones sin duplicar.
  - Ajustes.
  - Calculadoras manuales avanzadas.
- **Sistema visual** (`docs/SISTEMA_VISUAL.md`):
  - Generado con la skill UI UX Pro Max (`design-system/mercado-wow/MASTER.md`): estilo del juego: paneles oscuros translúcidos con respaldo sólido, títulos dorados en Cinzel, botón principal rojo con borde dorado, Fira Sans y Fira Code, iconos de interfaz Phosphor, sin emojis.
  - Barra lateral y encabezado con el selector de mercado; tarjetas de indicadores con recuentos reales en el comparador.
  - Ganancia, pérdida, equilibrio y «sin datos» con icono, texto y color; las cifras del comparador y del detalle son **estimadas** y lo indican.
  - Estados de carga (esqueleto), error (con «Reintentar») y vacío en todas las páginas.
  - Tableta: barra lateral solo con iconos. Móvil: navegación horizontal y tablas convertidas en tarjetas.
  - Teclado con foco visible, contraste AA medido y `prefers-reduced-motion`.
  - Páginas secundarias cargadas bajo demanda: paquete inicial de 281 kB (83 kB comprimido; 13-11-2026).
- **Iconos de WoW:** tabla `visual_asset`, `GET /api/assets` y `npm run sync:icons`. 2 452 recursos de Wowhead Forever (12 profesiones + 2 440 objetos) y 263 objetos con el icono oficial de Blizzard; ninguno sin icono. Si una imagen falla: Blizzard y, después, un marcador neutro.
- **Robustez de la base de datos:** las lecturas de más de 30 s fallan con un error visible y renuevan el pool (D26).
- **Mi personaje** (`#/personaje`, PC-01 a PC-16, D32 a D34; estado por PC en el backlog, sección «Ampliación»):
  - Conexión con Battle.net (inicio de sesión oficial, `state` de un solo uso, token cifrado en el servidor, desconectar y borrar datos).
  - Personajes propios con aislamiento por cuenta.
  - Profesiones de Blizzard o manuales, con procedencia.
  - Ruta **más rápida** (tiempo activo = fabricaciones × tiempo de lanzamiento de Wowhead) o más barata, con presupuesto, «solo naranja» y recetas conocidas.
  - Por paso: fabricaciones esperadas frente al mínimo garantizado, requisitos de rango (reglas de Classic, sin verificar), bloqueos, recuperación hipotética por venta.
  - Rutas guardadas con progreso y recálculo.
  - Sin cuenta, calcula con el nivel escrito a mano. Revisado en el navegador a 1024 y 375 px en ese modo.
  - Con datos reales: Alquimia 1→300 rápida = 15,4 min y 53,90 o; barata = 23,7 min y 38,59 o; con 45 o de presupuesto = 16,1 min.
  - **Probado con una cuenta real (13-11-2026):** inicio de sesión y lista de personajes en producción. Forever no da reino: el personaje se identifica como `nombre-apellido` y las profesiones responden en `…/character/{nombre-apellido}/professions` (comprobado). La lectura de profesiones con esa ruta está corregida pero falta desplegarla y probarla desde la web.
- **Servidor MCP** (D30): 7 herramientas de solo lectura para consultar desde Claude el estado del mercado, recetas rentables, detalle, materiales y rutas de subida de nivel. Probado por stdio con los datos reales de Supabase (13-11-2026) y con pruebas automáticas.
- **Acceso:** contraseña compartida (`APP_PASSWORD`), cookie HttpOnly firmada; el cron usa `CRON_SECRET`.

## En curso o bloqueado

| Elemento | Situación | Qué hace falta |
|---|---|---|
| Comisiones | Supuestos: 5 % (facción) y 15 % (Aguasnegras) | Comprobarlas en el juego y ajustarlas en «Ajustes». |
| Objetos sin ficha en Blizzard | 345 objetos devuelven 404 (sobre todo recetas de «Temporada de descubrimiento») | Aparecen sin nombre; sus precios se usan por id. |
| Desencantado y transformaciones aleatorias (PB-23) | Parcial | Calculadora manual de valor esperado; faltan tablas verificadas. |
| Cron horario | **Resuelto el 13-11-2026.** Fallaba porque `CRON_SECRET` estaba vacío en Vercel (el servidor rechaza todo con un secreto vacío, también el cron diario) y faltaba en GitHub. Se configuró en los dos y la ejecución manual de GitHub Actions salió correcta (casa con datos de hace < 1 h). | Si vuelve a fallar, la anotación del workflow dice la causa («Falta CRON_SECRET», «no coincide», sin respuesta). |
| Estadísticas regionales de TSM | TSM tarda a veces más de un día en publicar el archivo regional (11-11 → 12-11-2026); la descarga funciona | Pasan a «Desactualizado» a las 48 h (ajustable en «Ajustes»). La página distingue «comprobado hace poco» de «datos viejos de la fuente». |
| Historial | En marcha desde el 12-11-2026 para JcJ — Horda | `historical` gana fiabilidad a partir de unos 7–14 días. |
| Hardcore | Las casas 112/115/118 existen pero están vacías | Añadirlas cuando el modo se lance. |
| Consultas colgadas con el pooler | Mitigado (límite de 30 s y renovación del pool) | Si se repite en producción, probar el pooler de sesión (puerto 5432) para el servidor local. Causa exacta sin confirmar. |
| Iconos de objetos nuevos | Hay que ejecutar `npm run sync:icons` tras cada `sync:catalog` | Los objetos sin resolver se muestran con un marcador neutro. |
| Subida de nivel: tramos altos | Por encima de ≈ 250 algunas profesiones necesitan recetas de patrón o materiales de vendedor sin precio en la casa de subastas | Marcar «Incluir recetas de patrón…» o indicar precios manuales. La probabilidad en amarillo y verde es una estimación de la comunidad. |
| Subida de nivel: datos de Wowhead | Copiados a mano el 13-11-2026 (Wowhead bloquea descargas automáticas) | Repetir la copia si Forever cambia recetas o umbrales. |
| Battle.net (Mi personaje) | Conexión y lista de personajes **probadas con una cuenta real** (13-11-2026). Forever no da reino: el personaje es `nombre-apellido` y `/professions` responde con nivel, máximo y recetas conocidas (comprobado). Migraciones `20261115000000` y `20261116000000` aplicadas. | Desplegar la corrección y pulsar «Actualizar personajes» y luego «Leer de Blizzard» para comprobarlo desde la web. |
| Rutas: tiempos no incluidos | Solo se cuenta el tiempo de fabricación | Sin datos verificados de viajes, compras, aprendizaje ni recolección (PC-17). |
| Tema claro | Sustituido por el estilo del juego (oscuro) a petición del usuario | Recuperable con los tokens de la primera iteración (historial de git). |

## Decisiones

Ver [docs/DECISIONES.md](docs/DECISIONES.md). Las principales:
- Supabase y Vercel.
- Una sola función de API.
- RLS sin políticas.
- Racionales exactos.
- PGlite para desarrollo y pruebas.
- El catálogo se sincroniza con un script local.
- Cron diario (plan Hobby).
- Sistema visual e iconos por id (D25); límite de tiempo de las consultas (D26); subida de nivel con datos de Wowhead (D27); precios de venta atípicos (D28); sin recetas con reutilización en la subida de nivel (D29); servidor MCP (D30); reutilización en comparador y plan (D31); conexión con Battle.net (D32), datos del personaje con procedencia (D33), ruta más rápida (D34) y precio de vendedor en la subida de nivel (D35).

## Siguientes pasos

1. Battle.net: desplegar la lectura por `nombre-apellido`, comprobar desde la web que se leen las profesiones y que las recetas conocidas se enlazan con Wowhead.
2. PC-14 y PC-08: descontar inventario y registrar fabricaciones y consumo en el progreso.
3. Verificar las comisiones en el juego.
4. PB-23: tablas verificadas de desencantado, prospección y molienda para Forever.
5. PB-20 y PB-21: confirmar que no aplican en Forever (sin calidades de fabricación ni producción adicional) y cerrarlos.
6. Revisar la cobertura del catálogo en «Calidad de datos».

## Cómo continuar sin empezar de nuevo

- Código y arquitectura: `README.md`, sección «Estructura».
- Contrato de las fuentes y lagunas: `docs/VALIDACION_FUENTES.md`.
- Estado por requisito con evidencia: `Product_Backlog_Web_Crafteo_TSM.md`, sección «Estado de implementación».
- Verificación rápida: `npm test`, `npm run typecheck` y `npm run dev`.
