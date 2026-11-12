# Estado del proyecto

Última actualización: 12 de noviembre de 2026.

## Resumen

La aplicación está implementada y conectada a **Supabase** (migraciones aplicadas, precios reales de TSM de US/Area 52 cargados). El código está en GitHub (repositorio privado `simonB3215/mercadowowprofesiones`). Comprobado:
- 69 pruebas automáticas en verde.
- La interfaz se revisó en el navegador en escritorio y en móvil.
- La sincronización real de precios de TSM (US / Area 52) funciona.
- La función de Vercel, compilada a JS archivo por archivo, responde correctamente con Node.

**No está desplegada todavía.** Las credenciales de Blizzard funcionan y el catálogo real se sincroniza en Supabase. **Limitación verificada:** la API de Blizzard no publica el objeto resultante ni la cantidad de las recetas de Dragonflight, The War Within y Midnight. Esas recetas aparecen como «datos insuficientes»; las de expansiones anteriores sí se evalúan.

## Funciones terminadas (verificadas)

- **Motor de cálculo exacto:** costo por ejecución, lote y unidad; ingreso neto; ganancia; ROI (no definido si C = 0); equilibrio; precio objetivo; mínimo publicable; depósitos perdidos frente a recuperables; reposición frente a desembolso; caída de precio. El caso de referencia da 80 o por lote y 40 o por unidad.
- **Ingesta de TSM:** parser CSV con validación de cabeceras; precios 0 → `null`; activación atómica; el fallo conserva el último lote; poda de lotes antiguos; registro de intentos.
- **Contextos:** versión, región y reino; el reino se valida contra TSM (404 = no soportado); Classic se muestra deshabilitado con su motivo.
- **Evaluación de recetas:**
  - Canal de venta: subasta, vinculado, servicio o desconocido.
  - Rendimiento variable y facción.
  - Bloqueo por calidad (Dragonflight o posterior, y variantes con el mismo nombre).
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
- **Modo demo:** datos ficticios etiquetados y aislados (`game_version='demo'`).

## En curso o bloqueado

| Elemento | Situación | Qué hace falta |
|---|---|---|
| Recetas de Dragonflight o posteriores (PB-01, PB-06, PB-07) | **Bloqueado por la fuente** | La API de Blizzard no da el objeto resultante ni la cantidad (verificado con muestras reales en `docs/muestras/`). Haría falta otra fuente verificada. Las recetas anteriores sí están completas. |
| Despliegue (PB-28) | Configuración lista (`vercel.json`, migraciones); **no desplegado** | Proyecto de Supabase, cuenta de Vercel y variables de entorno. El despliegue lo tiene que autorizar y ejecutar el usuario. |
| Calidades, especialización y habilidad (PB-20) | **Bloqueado** | Reglas verificadas por receta y parche. Hoy: la habilidad se guarda y hay una suposición manual de calidad, etiquetada. |
| Producción adicional y ahorro (PB-21) | **Bloqueado** | Reglas verificadas. Hoy: rendimiento manual etiquetado. |
| Concentración y enfriamientos (PB-22) | Parcial | Hay calculadora manual de concentración. Los enfriamientos no están modelados (la API no los expone de forma verificada). |
| Transformaciones aleatorias (PB-23) | Parcial | Hay calculadora manual de valor esperado con validación de probabilidades. Faltan tablas verificadas de molienda, prospección y desencantado. |
| Classic y otras versiones (PB-26) | No disponible | Validar catálogo, mercados, facciones y comisión de cada versión. |
| Acceso y autenticación | **Hecho** (contraseña compartida) | `APP_PASSWORD` protege toda la API con una cookie HttpOnly firmada; el cron usa `CRON_SECRET`. Es de un solo usuario: no hay cuentas separadas. |

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

1. Revisar la cobertura del catálogo completo en «Calidad de datos».
2. Decidir una fuente verificada para el resultado y las cantidades de las recetas de Dragonflight o posteriores.
3. Desplegar en Vercel con las variables de entorno (`DATABASE_URL`, `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `CRON_SECRET`).
4. Configurar `APP_PASSWORD` en Vercel antes de compartir la URL.
5. Verificar la comisión de subasta de cada mercado y ajustar los umbrales en «Ajustes».

## Cómo continuar sin empezar de nuevo

- Código y arquitectura: `README.md`, sección «Estructura».
- Contrato de las fuentes y lagunas: `docs/VALIDACION_FUENTES.md`.
- Estado por requisito con evidencia: `Product_Backlog_Web_Crafteo_TSM.md`, sección «Estado de implementación».
- Verificación rápida: `npm test`, `npm run typecheck` y `npm run dev`; después, versión DEMO → «Recargar datos demo».
