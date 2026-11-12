# Estado del proyecto

Última actualización: 12 de noviembre de 2026.

## Resumen

La aplicación trabaja **solo con World of Warcraft: Forever**. Está desplegada en Vercel (https://mercadowowprofesiones.vercel.app), protegida con `APP_PASSWORD`, y conectada a **Supabase**. El código está en GitHub (repositorio público `simonB3215/mercadowowprofesiones`). Comprobado:
- 75 pruebas automáticas en verde y `tsc` sin errores.
- Catálogo real de Forever en Supabase: 12 profesiones, 2 493 recetas y 2 358 objetos (recetas completas).
- Precios reales: casas de subastas desde la API de Blizzard (incluida Aguasnegras) y estadísticas regionales de TSM. Casa por defecto: JcJ — Horda.
- La interfaz se revisó en el navegador.

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
  - Registro real con correcciones sin duplicar.
  - Ajustes.
  - Calculadoras manuales avanzadas.
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

## Decisiones

Ver [docs/DECISIONES.md](docs/DECISIONES.md). Las principales:
- Supabase y Vercel.
- Una sola función de API.
- RLS sin políticas.
- Racionales exactos.
- PGlite para desarrollo y pruebas.
- El catálogo se sincroniza con un script local.
- Cron diario (plan Hobby).

## Siguientes pasos

1. Verificar las comisiones en el juego.
2. Revisar la cobertura del catálogo en «Calidad de datos».

## Cómo continuar sin empezar de nuevo

- Código y arquitectura: `README.md`, sección «Estructura».
- Contrato de las fuentes y lagunas: `docs/VALIDACION_FUENTES.md`.
- Estado por requisito con evidencia: `Product_Backlog_Web_Crafteo_TSM.md`, sección «Estado de implementación».
- Verificación rápida: `npm test`, `npm run typecheck` y `npm run dev`.
