# Estado del proyecto

Última actualización: 12 de noviembre de 2026.

## Resumen

La aplicación trabaja **solo con World of Warcraft: Forever**. Está desplegada en Vercel (https://mercadowowprofesiones.vercel.app), protegida con `APP_PASSWORD`, y conectada a **Supabase**. El código está en GitHub (repositorio público `simonB3215/mercadowowprofesiones`). Comprobado:
- 80 pruebas automáticas en verde, `tsc` sin errores y `npm run build` correcto.
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
  - Subir de nivel (`#/nivel`, D27): ruta más barata por profesión (9 de fabricación; las de recolección no), receta por tramo, color de dificultad, fabricaciones estimadas, materiales, costo con precios de la casa de subastas, costo del instructor, lista de compra y precios manuales para materiales sin precio. Comprobado con datos reales: Sastrería 1→300 ≈ 463 o con tramos sin datos desde 250; Alquimia 1→300 ≈ 28 o completa.
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
  - Páginas secundarias cargadas bajo demanda: paquete inicial de 269 kB (81 kB comprimido).
- **Iconos de WoW:** tabla `visual_asset`, `GET /api/assets` y `npm run sync:icons`. 2 452 recursos de Wowhead Forever (12 profesiones + 2 440 objetos) y 263 objetos con el icono oficial de Blizzard; ninguno sin icono. Si una imagen falla: Blizzard y, después, un marcador neutro.
- **Robustez de la base de datos:** las lecturas de más de 30 s fallan con un error visible y renuevan el pool (D26).
- **Acceso:** contraseña compartida (`APP_PASSWORD`), cookie HttpOnly firmada; el cron usa `CRON_SECRET`.

## En curso o bloqueado

| Elemento | Situación | Qué hace falta |
|---|---|---|
| Comisiones | Supuestos: 5 % (facción) y 15 % (Aguasnegras) | Comprobarlas en el juego y ajustarlas en «Ajustes». |
| Objetos sin ficha en Blizzard | 345 objetos devuelven 404 (sobre todo recetas de «Temporada de descubrimiento») | Aparecen sin nombre; sus precios se usan por id. |
| Desencantado y transformaciones aleatorias (PB-23) | Parcial | Calculadora manual de valor esperado; faltan tablas verificadas. |
| Cron horario | Workflow de GitHub Actions listo | Añadir el secreto `CRON_SECRET` en GitHub (*Settings → Secrets and variables → Actions*). |
| Historial | En marcha desde el 12-11-2026 para JcJ — Horda | `historical` gana fiabilidad a partir de unos 7–14 días. |
| Hardcore | Las casas 112/115/118 existen pero están vacías | Añadirlas cuando el modo se lance. |
| Consultas colgadas con el pooler | Mitigado (límite de 30 s y renovación del pool) | Si se repite en producción, probar el pooler de sesión (puerto 5432) para el servidor local. Causa exacta sin confirmar. |
| Iconos de objetos nuevos | Hay que ejecutar `npm run sync:icons` tras cada `sync:catalog` | Los objetos sin resolver se muestran con un marcador neutro. |
| Subida de nivel: tramos altos | Por encima de ≈ 250 algunas profesiones necesitan recetas de patrón o materiales de vendedor sin precio en la casa de subastas | Marcar «Incluir recetas de patrón…» o indicar precios manuales. La probabilidad en amarillo y verde es una estimación de la comunidad. |
| Subida de nivel: datos de Wowhead | Copiados a mano el 13-11-2026 (Wowhead bloquea descargas automáticas) | Repetir la copia si Forever cambia recetas o umbrales. |
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
- Sistema visual e iconos por id (D25); límite de tiempo de las consultas (D26); subida de nivel con datos de Wowhead (D27).

## Siguientes pasos

1. Verificar las comisiones en el juego.
2. Revisar la cobertura del catálogo en «Calidad de datos».

## Cómo continuar sin empezar de nuevo

- Código y arquitectura: `README.md`, sección «Estructura».
- Contrato de las fuentes y lagunas: `docs/VALIDACION_FUENTES.md`.
- Estado por requisito con evidencia: `Product_Backlog_Web_Crafteo_TSM.md`, sección «Estado de implementación».
- Verificación rápida: `npm test`, `npm run typecheck` y `npm run dev`.
