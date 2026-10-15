# Rediseño Mantenimiento — notas del mockup (2026-10-15)

Mockup: `.mockups/mantenimiento-standalone.html`, autónomo. Usa las mismas fuentes, tokens y CSS base que `operaciones-standalone.html`: copia las líneas 1–291 de ese archivo y le suma un bloque de CSS propio de Mantenimiento.

- **Selector de pantallas**: está abajo. También se puede abrir una pantalla directo con `#s=<clave>`, por ejemplo `#s=prog`.
- **Capturas**: `mant-<clave>.png` (escritorio, 1440 px) y `mant-m-<clave>.png` (390 px).
- **Modo oscuro**: no se incluye, porque la referencia de Operaciones no lo trae (0 reglas `prefers-color-scheme`). Ver la pregunta 6.
- **Desborde a 390 px**: se midió `scrollWidth > clientWidth` en las 35 pantallas móviles y el resultado es `false` en todas.

Etiquetas usadas en este documento:

- **[existe]**: presentación nueva sobre datos y acciones que ya existen.
- **[derivado]**: se calcula con datos que ya existen, pero hace falta una query o un conteo nuevo.
- **[nuevo]**: requiere un dato o una acción que hoy no existe.

## Pantallas y su origen en el código

| Clave                                       | Pantalla                                                                                        | Componente actual                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ops`                                       | Operaciones · 1 Validar Solicitud                                                               | `Pipeline/OperacionesPipeline` → `SolicitudesMantenimientoTabContent`, `tableColumns.tsx`                         |
| `aprobar`                                   | Validar solicitud (diálogo)                                                                     | `SolicitudesMantenimiento/components/SolicitudApprovalDialog.tsx`                                                 |
| `seg`                                       | Operaciones · 2 Seguimiento                                                                     | `WorkshopTracking/*` (`statuses.ts`, `workshopTrackingColumns.tsx`)                                               |
| `prog`                                      | Taller · 1 Por Programar                                                                        | `PedidosMantenimiento/Pendientes/*`                                                                               |
| `plan` / `rech`                             | Planificar / Rechazar pedido                                                                    | `PlanificarPedidoDialog.tsx` / `Pendientes/components/RechazarPedidoDialog.tsx` (textos conservados)              |
| `ing` / `entrada`                           | Taller · 2 Por Ingresar / Ingreso                                                               | `PedidosMantenimiento/Confirmados/*`, `EntradaTallerDialog.tsx`                                                   |
| `taller`                                    | Taller · 3 En Taller                                                                            | `MaintenanceOrders/table/columns.tsx`                                                                             |
| `det` / `detval`                            | Detalle de orden / Validación de cierre                                                         | `OrderDetailDialog.tsx` + `order-detail/*`, `SectorCard`, `ActivityHistoryModal`                                  |
| `wiz1`–`wiz4`                               | Gestión de orden (4 pasos)                                                                      | `OrderManagement/components/ManageOrderWizard.tsx` + `wizard/*`                                                   |
| `band`                                      | Taller · 4 Aprobaciones                                                                         | `ApprovalInbox/*`                                                                                                 |
| `gcat` `gord` `gwiz` `gplant` `gmar` `gtip` | Gomería                                                                                         | `Gomeria/{Catalogo,Ordenes,Plantillas,Marcas,Tipos}` (`ServiceOrderWizard`, `TireDiagram`, `TireActionsWithTire`) |
| `qr0`–`qr5`                                 | QR: buscar equipo por dominio, ingreso, checklist, confirmar, enviada, creado por el supervisor | `AnonymousLogin/*`, `NuevoPedido/components/nuevo-pedido/*`                                                       |
| `op1`–`op3`                                 | Panel del operario: mis OT, detalle de OT, devolver tarea                                       | `features/OperatorPanel/*`                                                                                        |
| `desv`                                      | Equipos con Desvíos                                                                             | `EquiposConDesvios/*`                                                                                             |
| `vista`                                     | Vista Taller                                                                                    | `WorkshopView/*` (`WorkshopSectorsAccordion`, `WorkshopSectorTasksTable`)                                         |
| `load` `empty` `err` `noperm`               | Estados transversales                                                                           | Skeletons `fallback/*`, el texto "Sin acceso" de los `*PipelineContent`                                           |

## Decisiones (qué cambia y por qué)

1. **Shell y lenguaje visual iguales a Operaciones.** Las tabs del módulo (`SectionManagerServer`) pasan a ser una sub-navegación con subrayado y contador. El orden y los nombres no cambian: Operaciones, Vista Taller, Taller, Nuevo Pedido, Equipos con Desvíos, Gomería.
2. **Pipeline con tarjetas de paso.** Reemplaza los chevrones de 88 px. Cada paso tiene número, nombre, descripción y un contador mono. Los nombres y las descripciones son los textos actuales.
   - El contador de cada paso sale de `get*PipelineCounts` y es la misma cifra que muestra la tabla por defecto. En el mock cuadra: Seguimiento 16 = 4 + 3 + 6 + 2 + 1, y Aprobaciones 6 = 3 + 1 + 2.
   - En móvil los pasos quedan en una grilla de 2×2.
3. **"Atención" en cada paso.** Es una banda que muestra lo urgente con una acción directa: más de 48 h sin validar, más de 7 días sin fecha, fecha planificada pasada sin ingreso, orden sin OTs, rechazada por taller. Los badges de los pasos usan el mismo dato. **[derivado]**: todo sale de fechas que ya existen, salvo "sin OTs generadas", que sale del conteo de `work_orders`.
4. **Métricas clicables que filtran la tabla.** Usan `MetricCard` con sus tonos (`default | brand | ok | warn | danger`). En Seguimiento hay una métrica por estado (`DEFAULT_TRACKING_STATUSES`), y "Completada" queda solo en el filtro de Estado, como hoy. Las métricas "Más de 48 h", "Más de 7 días" y "Más de 14 días" son **[derivado]**.
5. **Columnas compuestas, como en Operaciones.** Equipo = dominio y N° interno con subtipo. Pedido = N° y descripción. Fecha = fecha y antigüedad relativa. Las columnas atómicas quedan ocultas y en el export.
   - Equipo distingue vehículo (patente con borde sólido) de equipamiento (serie o N° interno con borde punteado), por el ticket 596.
   - El placeholder de búsqueda se conserva: "Buscar por dominio, serie, número, tipo o subtipo…".
6. **Recorrido de sectores en la tabla.** Son chips en el orden de ejecución, con el estado de cada OT: hecho, en curso, trabado o pendiente. Hoy se ve "Sector Actual" más "Progreso". Sale de `work_orders` por orden, que ya se trae para el progreso. **[existe]**
7. **Detalle de orden en un panel lateral (`Sheet`, 920 px), en lugar del `Dialog`.**
   - Barra de etapas: Solicitud → Aprobada → Programada → Ingreso → En taller → Validación.
   - Datos clave: ingreso, km, horómetro y días en taller.
   - Una tarjeta por sector (`SectorCard`) con la OT, su estado, el avance y las tareas, con Diagnóstico obligatorio, "Pend. Aprobacion", "Devuelto" y "Agregado por operador".
   - Materiales (`OrderMaterialsSection`) e historial inline (`ActivityHistoryModal` pasa a ser una sección con "Ver todo").
   - La validación de cierre usa el mismo panel con los botones existentes: "Validar y Cerrar Orden", "Rechazar Items Especificos" y "Devolver Orden Completa al Taller". Fuera de `pending_workshop_validation` esos botones quedan deshabilitados y se explica por qué.
   - La barra de etapas es **[derivado]**: sale de los timestamps de la solicitud, `date_confirmed`, el ingreso y los logs.
8. **Gestión de orden en un `Sheet` ancho con stepper.** Los pasos son los actuales: **Desvíos / Sectores / Orden / Confirmar**.
   - "Agregar ítem" se hace **inline** dentro del paso 1 y no abre `AddItemDialog`, para no encadenar modales.
   - El orden de ejecución se puede cambiar con flechas además del arrastre, por accesibilidad de teclado.
   - Se conservan "Rechazar desvío", "Todos los desvíos tienen sector asignado.", "Flujo del vehiculo:", "Cada OT incluye diagnóstico automático del sector." y la validación de fechas.
   - "Hay cambios sin guardar" sigue como AlertDialog.
9. **Aprobaciones (bandeja) en una sola pantalla.** Hoy son dos botones que abren modales más una tabla. Ahora son tres bloques: Autorizaciones, Reasignaciones y Validación de cierre.
   - Cada tarea muestra el pedido del operario como cita, con aprobar o rechazar y el motivo inline.
   - Las reasignaciones muestran "Motivo de devolucion" y el selector de nuevo sector.
   - No se agregó la categoría "órdenes devueltas" porque hoy no existe. Ver la pregunta 3.
10. **Diálogos de acción** (validar, planificar, rechazar, ingreso): son modales de un solo paso, con un resumen del equipo arriba y un cuadro de impacto ("Esta acción actualizará el equipo:").
    - El submit queda deshabilitado mientras falte algo, con el motivo enlazado por `aria-describedby`.
    - La validación de la solicitud agrupa los ítems en críticos y no críticos, con los textos actuales, y lleva un contador vivo de aprobados y rechazados.
11. **Gomería.**
    - Catálogo: una métrica por `TireStatus` (Instalada, Disponible, En reparación, Extraviada, Descartada).
    - Orden: diagrama en vista superior con cabina, ejes, auxilio y **enganche**, más un panel lateral para la posición elegida con las acciones **Calibrar / Reparar / Reemplazar / Extravío** y la lista de intervenciones de la orden.
    - Plantillas: tarjetas con un mini diagrama de ejes.
    - Marcas y Tipos: tablas simples.
    - Los estados "Bajo mínimo" de cubierta y "Activa/Inactiva" de marca son de presentación. "Bajo mínimo" es **[derivado]** de la profundidad: hay que definir el umbral.
12. **QR y operario a 390 px.** Botones de 48 px, una tarea por paso y barra de progreso.
    - Se muestran los dos finales reales: el chofer ve "Solicitud enviada. El supervisor debe aprobarla…" y el supervisor ve el pedido creado directo, después de responder "¿Eres el supervisor de este pedido?".
    - Devolver una tarea se hace en un bottom sheet que valida el mínimo de 10 caracteres con un contador.
13. **Vista Taller.** Una tarjeta por sector con cupos ocupados sobre totales ("Sector completo" o "N libres") y cuántas OT hay pendientes, en progreso y pausadas. Al tocar una tarjeta se filtra la tabla de OT del sector. **[existe]**
14. **Estados.**
    - **Cargando**: skeletons con la forma real y `aria-busy`.
    - **Vacío**: dice exactamente cuándo aparece y ofrece la acción siguiente.
    - **Error**: es por paso y no rompe el resto; el contador del paso muestra "—" y hay un botón "Reintentar".
    - **Sin permiso**: los pasos sin `view` no se muestran, las acciones sin `update` o `delete` desaparecen, "Nuevo pedido" sin `create` queda como placeholder bloqueado, y se conserva el texto "No tenés permisos para ver ningún paso de Taller.".
15. **Accesibilidad.**
    - Foco visible y Escape cierra el overlay activo. El foco queda atrapado en los diálogos y vuelve al disparador al cerrar.
    - Los botones de solo ícono tienen `aria-label`.
    - Las filas abren con Enter o espacio.
    - Las barras de progreso tienen `role="progressbar"`.
    - El estado nunca se comunica solo con color: siempre hay texto.
    - El legajo va antes del nombre, como `[legajo] Apellido Nombre`.
    - Las fechas van en DD/MM/YYYY.

## Lo que queda afuera a propósito

- **Acciones en lote**: no hay server actions multi-id en Mantenimiento, así que no se dibujó la barra de selección.
- **Nuevo Pedido de escritorio**: usa los mismos pasos del QR dentro de `SplitLayout` y no tiene pantalla propia en el mock.
- **Configuración**: los tipos de reparación y grupos no entran en este alcance.
- **`pending_operations_validation`**: no aparece en ningún filtro ni pill, porque está fuera del circuito.

## Componentes

- **Se reutilizan**: `SectionCard`, `SplitLayout`, `MetricCard`, DataTable con `mobileCards`, el `Sheet` lateral y el patrón de `OrderDetailSheet` de Operaciones.
- **Se crean** en `features/Mantenimiento/shared/components`:
  - `PipelineSteps`: reemplaza `PipelineLayout`, con la misma API de `steps`, `counts` y `paramName`.
  - `AttentionBanner`.
  - `SectorRoute`: chips del recorrido.
  - `ResourceCell`: vehículo o equipamiento.
  - `MaintenanceStatusPill`: un único mapa de estado a label y tono para órdenes, OT y tareas. Hoy hay varios mapas duplicados.
  - `TireAxleDiagram`.

## Riesgos

- **Pedido rechazado**: `rejected` no está en `WORKSHOP_TRACKING_STATUSES`. Cuando el taller rechaza un pedido, este desaparece de Seguimiento y solo queda en el historial del equipo, así que el supervisor no se entera desde Mantenimiento. El mock no lo muestra; queda a decidir si se suma.
- **"Asigná fecha y reparaciones"**: es la descripción actual del paso Por Programar, pero la asignación de tipos de reparación (`AssignRepairTypesDialog`) solo se usa en el wizard de gestión. El texto se conservó tal cual.

- **QR / acceso anónimo**: las pantallas QR corren sin el shell y con sesión de mantenimiento (CUIL o email). El rediseño no debe tocar `AnonymousLogin` ni el flujo de sesión, solo la presentación. Hay que probarlo en un celular real: teclado numérico, cámara para fotos y conexión inestable. Ya existen los mensajes "Se perdió la conexión…".
- **Permisos**: cada paso exige el `view` de su tab (`maintenance_requests`, `seguimiento_taller`, `pedidos_pendientes`, `pedidos_confirmados`, `ordenes_mantenimiento`, `bandeja_aprobaciones`). Hoy varias acciones de fila no están protegidas por `update` o `delete`, y hay que mapearlas antes de implementar. Los contadores del sidebar y de los pasos tienen que respetar el filtro de supervisor y los tipos de equipamiento ocultos (ticket 690), igual que hoy.
- **Contadores**: cualquier métrica o paso nuevo debe usar la misma constante de estados que la tabla, para que el número del chevron no difiera del listado.

## Preguntas abiertas

1. **Etiquetas de estado.** Hoy un mismo estado aparece con varios nombres. Por ejemplo, `pending_scheduling` figura como "Pendiente de programación", "Pendiente Planificar" y "Pend. Programación"; `date_confirmed` como "Fecha confirmada" y "Fecha Confirmada"; y `pending_approval` en 4 variantes. En el mock usé "Pend. Programación", "Fecha Confirmada", "En Taller", "Pend. Validación Taller", "Rechazada por Taller" y "Pendiente de Aprobación". ¿Unificamos en esas o elegís otras?
2. **Mismo registro, dos nombres.** Las columnas dicen "Nro. Pedido" en Por Programar y Por Ingresar, y "N° Orden" en En Taller y Seguimiento, para el mismo registro (`maintenance_orders`). Dejé cada una como está. ¿Unificamos en un solo nombre?
3. **"Órdenes devueltas" en la bandeja.** Hoy la bandeja tiene Autorizaciones, Reasignaciones y Validación de cierre. ¿Querés también una categoría para las órdenes que el jefe de taller devolvió al taller? Sería **[nuevo]**.
4. **Umbrales de "Atención".** Propongo 48 h sin validar, 7 días sin fecha, 14 días en taller, 30 días con desvíos sin pedido, y una profundidad de cubierta "bajo mínimo" todavía por definir en mm. ¿Te sirven esos valores?
5. **Detalle en panel lateral.** ¿Aprobás pasar el detalle de orden de `Dialog` a `Sheet` lateral, como en Operaciones? ¿Y la bandeja en una sola pantalla en lugar de botones que abren modales?
6. **Modo oscuro.** No lo dibujé porque Operaciones tampoco lo tiene en el mock. ¿Lo pedimos para todo el rediseño en una pasada aparte?
