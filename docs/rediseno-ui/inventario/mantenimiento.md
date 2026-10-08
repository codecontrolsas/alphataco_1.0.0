# Inventario — Mantenimiento (ficha ANTES)

> Fase 0 del rediseño (`docs/rediseno-ui/PLAN.md`). Lo que la UI hace HOY y debe seguir haciendo.
> Se tilda `[x]` en la verificación "después". Relevado del código el 2026-10-07.

**Página:** `src/app/dashboard/maintenance/page.tsx` → `getUserPermissionsMapServer()` →
`src/features/Mantenimiento/MantenimientoComponent.tsx` (`SectionManagerServer`, `paramName="tab"`, default
`maint_operaciones`). Cada tab raíz está gateada por permiso `view` de `mantenimiento:<tabSlug>`.

| Tab (`?tab=`) | Label + icono | Contenido |
|---|---|---|
| `maint_operaciones` | Operaciones (ClipboardList) | Pipeline `op_step`: `validate`, `in_workshop` |
| `workshop_view` | Vista Taller (Building2) | Acordeones por sector |
| `maint_taller` | Taller (Warehouse) | Pipeline `taller_step`: `schedule`, `confirmed`, `in_workshop`, `approvals` |
| `nuevo_pedido` | Nuevo Pedido (Plus) | Wizard de alta |
| `equipments_with_deviations` | Equipos con Desvíos (AlertTriangle) | Tabla |
| `gomeria` | Gomería (CircleDot) | Subtabs `gomeria_tab` |

## Pipeline (componente compartido de Operaciones y Taller)

- [ ] Componente: `Pipeline/components/PipelineLayout.tsx` + `WorkflowPipelineChevrons.tsx` (chevrones con número de paso, icono, label, descripción y **badge de conteo** por paso; `aria-label="Paso N: X. K pedidos"`, `aria-current="step"`).
- [ ] Conteos server: `OperacionesPipeline/actions/pipeline-counts.server.ts`, `TallerPipeline/actions/pipeline-counts.server.ts`.
- [ ] Todos los pasos se renderizan a la vez; el activo se muestra, el resto `hidden` (cambio instantáneo).
- [ ] Al cambiar de paso: `history.replaceState` (sin navegación) y se **borran** de la URL los params de tabla (`page*`, `pageSize*`, `sort*`, `filter*`, `search*`, `col*`, `visibility*`).
- [ ] Paso inicial: lee la URL al montar; sincroniza con atrás/adelante del navegador.
- [ ] `WorkflowPipeline.tsx` existe pero no se usa (solo Chevrons).

## Operaciones › Validar Solicitud — `/dashboard/maintenance?tab=maint_operaciones&op_step=validate`

- [ ] Raíz: `SolicitudesMantenimiento/SolicitudesMantenimientoTabContent.tsx` → `MaintenanceRequestList.tsx` (Card + CardContent pt-6) → `_MaintenanceRequestDataTable.tsx`. Siempre `canApproveReject=true`.
- [ ] Tabla: DataTable nuevo, columnas `SolicitudesMantenimiento/tableColumns.tsx`, `TABLE_ID='maintenance-requests'`, `paramNamespace`, client-side (`queryFn`), preferencias en BD.
- [ ] Columnas: Equipo (dominio/serie o tipo/serie de equipamiento) · Legajo · Fecha Solicitud · Desvíos (items_count) · Chofer · Supervisor · Estado (badge; si `approved` muestra el estado del pedido) · Origen* · Kilometraje* · Horas Motor* · acciones. (*ocultas por defecto: `source`, `kilometer`, `engine_hours`). Todas ordenables salvo acciones.
- [ ] Filtros (lazy `fetchFacet`): Estado (faceted), Equipo (FK), Origen (faceted), Supervisor (FK, "Sin asignar"), Fecha Solicitud (dateRange), Legajo exacto (text), Kilometraje (text), Horas Motor (text). Visibles por defecto: Estado, Equipo, Origen.
- [ ] Búsqueda: "Buscar solicitudes...". Vacío: "No hay solicitudes de mantenimiento".
- [ ] Orden por defecto: `created_at desc`.
- [ ] Export Excel: `solicitudes-mantenimiento-YYYY-MM-DD`, hoja "Solicitudes", respeta filtros activos; formatters fecha `DD/MM/YYYY HH:mm`, estado→label, origen→label, `km`/`hs`, supervisor vacío→"Sin asignar".
- [ ] Sin selección ni acciones masivas.
- [ ] Acciones por fila: Ver detalle (Eye) · Historial (abre `ActivityHistoryModal` "Historial de la Solicitud") · si `status==='pending_approval'`: Aprobar/Validar · Rechazar · Reasignar supervisor (UserRoundCog, tooltip). **Sin chequeo de permiso en UI** (`canApproveReject` fijo en true).
- [ ] Al abrir un dialog se carga la solicitud completa con React Query (`maintenance-request-detail`).
- [ ] **SolicitudDetailDialog**: "Detalle de Solicitud de Mantenimiento", "Solicitud creada el …", solo lectura.
- [ ] **SolicitudApprovalDialog** "Validar Solicitud de Mantenimiento":
  - Cabecera: equipo, supervisor, descripción.
  - Solicitud **preventiva**: `PreventiveInfoCard` + comentario opcional; botones Cancelar / Rechazar (pasa a modo rechazo con "Motivo del rechazo *" → "Rechazar Solicitud") / Aprobar Solicitud (requiere descripción ≥15 chars).
  - Solicitud **correctiva**: items agrupados en Críticos / No críticos / Solo informativos (no propagables, se aprueban solos). Por item: Aprobar / Rechazar (con motivo obligatorio) / Reset, y "comentario del validador" opcional desplegable.
  - Campo "descripción de lo que se aprueba" obligatorio (≥15 chars, `MIN_APPROVAL_DESCRIPTION_LENGTH`) **solo si hay algún aprobado**.
  - "Procesar Solicitud" deshabilitado si quedan items sin decidir. Validaciones: todos decididos, rechazados con motivo. Toast "Solicitud procesada" con "N aprobado(s), M rechazado(s), K solo informativo(s)".
- [ ] **SolicitudRejectDialog** "Rechazar Items de Solicitud": checkbox "seleccionar todos" + checkbox por item (no aplica a preventiva), "Motivo del rechazo *". Botón deshabilitado sin items (correctiva) o sin motivo. Toast "Items rechazados exitosamente" / "Solicitud preventiva rechazada".
- [ ] **ReassignSupervisorDialog** "Reasignar Supervisor": `SearchableSelect` "Nuevo supervisor *"; Confirmar → `reassignRequestSupervisor`; toast "Supervisor reasignado correctamente".
- [ ] `SolicitudesMantenimiento/components/EntradaTallerDialog.tsx` ("Aprobar Entrada a Taller", km obligatorio) **no tiene importadores** (huérfano; la versión viva es `PedidosMantenimiento/components/EntradaTallerDialog.tsx`, ver Por Ingresar).

## Operaciones › Seguimiento — `/dashboard/maintenance?tab=maint_operaciones&op_step=in_workshop`

- [ ] Raíz: `WorkshopTracking/WorkshopTrackingTabContent.tsx` → `WorkshopTrackingList.tsx` (Card) → `_WorkshopTrackingDataTable.tsx`. Solo lectura.
- [ ] Tabla: DataTable nuevo, columnas `WorkshopTracking/workshopTrackingColumns.tsx`, `TABLE_ID='workshop-tracking'`.
- [ ] Columnas: N° Orden · Equipo · Items · Fecha Planificada · Condición Actual · Km Actual · Ingreso · Días en Taller · Recorrido Sectores (chips con tooltip por sector) · Estado · Progreso (barra + tooltip) · Creado (oculta por defecto) · Descripción (truncada 240px con `title`) · acciones.
- [ ] Filtros: Estado (faceted, labels `WORKSHOP_STATUS_LABELS`), Equipo (FK), Condición Actual (faceted, con null), Fecha Ingreso / Fecha Planificada / Fecha Creación (dateRange), N° Orden, Dominio, Serie, N° Interno, Km Actual, Descripción (text). Visibles por defecto: Estado, Equipo, Fecha Ingreso.
- [ ] **Estados por defecto**: muestra `pending_scheduling`, `date_confirmed`, `in_workshop`, `pending_workshop_validation`, `operations_rejected`, `workshop_rejected`; **`completed` queda fuera salvo que se tilde "Completada"** en el filtro de Estado (`WorkshopTracking/statuses.ts`, mismo set que el conteo del pipeline).
- [ ] Búsqueda: "Buscar por N° de orden...". Vacío: "No hay órdenes de mantenimiento en taller". Orden por defecto `created_at desc`.
- [ ] Export: `seguimiento-taller`, hoja "Seguimiento Taller".
- [ ] Sin selección. Acciones por fila: "Ver detalle" (abre `OrderDetailDialog` con `context="operations"`, con spinner mientras carga) · Historial ("Historial de la Orden", `ActivityHistoryModal` con orderId + requestId). Sin permisos en UI.

## Componente compartido: `OrderDetailDialog` (`MaintenanceOrders/components/OrderDetailDialog.tsx`)

Usado por Seguimiento (`context="operations"`, solo lectura) y Taller › En Taller (`context="workshop"`).
- [ ] Título "Detalle de Orden" + N° orden/badges + botón "Ver historial" (abre `ActivityHistoryModal`).
- [ ] Datos: Equipo, N. Interno, Ingreso a taller, Km al ingreso, Horómetro, Condición, Origen, Descripción; tarjeta preventiva si aplica.
- [ ] "Ítems del pedido" (con fotos inline por ítem, badge Diagnóstico, motivo de rechazo).
- [ ] "Secuencia de Sectores": `SectorTimeline` + `SectorCard` por sector (DIAGNOSTICO, tareas, "Bloquea tareas restantes", "Agregado por operador", "Sin tareas asignadas", N° OT y estado). **Reordenar sectores** (drag) solo si `in_workshop` + workshop + >1 sector.
- [ ] `ExternalWorkshopCard` por taller externo: OTs con estado; botón "Completar" (permiso `mantenimiento:ordenes_mantenimiento:update`, oculto en operations).
- [ ] "Comentarios de la Solicitud" por ítem (`ItemComments`).
- [ ] `OrderStatusSections` según estado: `pending_operations_validation` (legado; en operations: "Validar y Cerrar Orden" / "Rechazar Items" / "Rechazar Todo", permiso `mantenimiento:seguimiento_taller:update`), `operations_rejected` en workshop ("De acuerdo - Enviar al operador" / "No estoy de acuerdo" con comentario obligatorio, permiso `ordenes_mantenimiento:update`), `workshop_rejected` (detalle de rechazos), `completed` ("Información de Cierre").
- [ ] Footer `pending_workshop_validation` + workshop: "Validación de Jefe de Taller" con resumen de OTs, Textarea "Notas de validacion (opcional)", botones "Validar y Cerrar Orden" / "Rechazar Items" / "Devolver Todo" (permiso `mantenimiento:ordenes_mantenimiento:update`).
- [ ] AlertDialogs: "Rechazar Items Especificos" (selección + comentario por ítem, taller y ops), "Devolver Orden Completa al Taller" (motivo), "Rechazar Orden Completa" (motivo).

## Vista Taller — `/dashboard/maintenance?tab=workshop_view`

- [ ] Raíz: `WorkshopView/WorkshopViewTabContent.tsx` → `components/WorkshopSectorsAccordion.tsx` (Accordion `type="multiple"`, todos colapsados).
- [ ] Estado vacío: "Sin sectores configurados / No hay sectores de taller activos para mostrar." (borde punteado + icono Building2).
- [ ] Cabecera de cada acordeón: icono, nombre del sector, taller, descripción, **semáforo de cupos** (`SectorCapacityChips`: solo si el sector tiene `max_capacity`; chip de cupo excedido con tooltip "Hay N unidades en un sector con cupo para M") y chips de conteo de OT por estado (OT pendientes / en progreso / pausadas; los de 0 se ocultan). El cupo cuenta OT `in_progress`+`paused`.
- [ ] Contenido: tabla por sector con Suspense propio (streaming independiente) — `WorkshopSectorTasksTable/WorkshopSectorTasksList.tsx` → `_WorkshopSectorTasksDataTable.tsx`, columnas `columns.tsx`, `tableId = workshop-sector-work-orders-<sectorId>` (uno por sector, `paramNamespace` propio).
- [ ] Solo OT **abiertas** (`pending`, `in_progress`, `paused`); cerradas nunca se muestran.
- [ ] Columnas visibles: N° OT · Equipo · N° OM · Tareas · Inicio Plan. · Fin Plan. · Iniciada el* · Creada el* (*ocultas por defecto) · acciones. Columnas de solo filtro (no ocultables, sin export): Estado OT, Estado OM, Tipo de Reparación, Crítica, Rechazada, Diagnóstico.
- [ ] Filtros: Estado OT, Equipo, Tipo de Reparación, Estado OM, Crítica, Rechazada, Diagnóstico (faceted), Inicio Plan./Fin Plan./Iniciada el/Creada el (dateRange), N° OT, N° OM (text). Visibles por defecto: Estado OT, Equipo, Tipo de Reparación.
- [ ] Búsqueda: "Buscar por N° OT, N° OM o descripción de la tarea...". Vacío: "No hay órdenes de trabajo abiertas en este sector". Orden por defecto: estado asc, inicio planificado asc.
- [ ] Export: `ot-sector-<8 chars del id>`, hoja "Órdenes de trabajo".
- [ ] Acción por fila: botón de tareas → `components/WorkOrderTasksDialog.tsx` (lista de tareas de la OT, "Sin descripción", motivo de rechazo; vacío "Esta orden de trabajo no tiene tareas."). Solo lectura, sin permisos.

## Taller › Por Programar — `/dashboard/maintenance?tab=maint_taller&taller_step=schedule`

- [ ] Raíz: `PedidosMantenimiento/Pendientes/PendientesTabContent.tsx` → `PendingOrderList.tsx` (Card) → `components/_PendingOrderDataTable.tsx`, columnas `Pendientes/columns.tsx`, `TABLE_ID='pedidos-pendientes'`.
- [ ] Columnas: Estado (Pendiente Planificar / Pendiente Aprobación, badge+icono) · Equipo · Nro. Pedido · Descripción (truncada 280px) · Origen* · Fecha Aprobación* · Fecha Planificada · Items · acciones (*ocultas por defecto).
- [ ] Filtros: Estado, Equipo, Origen (faceted), Nro. Pedido, Descripción (text), Fecha Aprobación, Fecha Planificada (dateRange). Visibles: Estado, Equipo, Origen.
- [ ] Búsqueda: "Buscar por equipo (dominio, serie) o nro. pedido...". Vacío: "No hay pedidos pendientes". Orden por defecto: status desc, created_at desc.
- [ ] Export: `pedidos-pendientes`, título "Pedidos Pendientes de Mantenimiento", hoja "Pendientes".
- [ ] Acciones por fila: Ver detalle · Ver historial · si `pending_scheduling`: "Planificar fecha" y "Rechazar pedido". **Sin chequeo de permiso en UI.**
- [ ] Mientras carga el detalle se muestra un mini Dialog de carga (spinner, sin botón cerrar).
- [ ] **PedidoDetailDialog** (`PedidosMantenimiento/components/PedidoDetailDialog.tsx`): solo lectura (fechas, km, items).
- [ ] **PlanificarPedidoDialog** "Planificar Pedido de Mantenimiento": "Fecha de recepción en taller" (`<Input type="date">`, `min=hoy`, obligatoria; toasts "Debe seleccionar una fecha"/"Fecha inválida") + lista "Items a reparar" con fotos (`RepairItemPhotos`). Botón deshabilitado sin fecha. Toast "Pedido planificado exitosamente".
- [ ] **RechazarPedidoDialog** (AlertDialog "Rechazar Pedido"): "Motivo del rechazo *" (Textarea). Toast "Pedido rechazado. Queda registrado en el historial de mantenimiento del equipo."

## Taller › Por Ingresar — `/dashboard/maintenance?tab=maint_taller&taller_step=confirmed`

- [ ] Raíz: `PedidosMantenimiento/Confirmados/ConfirmadosTabContent.tsx` → `ConfirmedOrderList.tsx` (Card; calcula `checkPermissionServer('mantenimiento','pedidos_confirmados','update')`) → `components/_ConfirmedOrderDataTable.tsx`, columnas `Confirmados/columns.tsx`, `TABLE_ID='pedidos-confirmados'`.
- [ ] Columnas: Equipo · Nro. Pedido · Fecha Aprobación* · Fecha Planificada (con etiqueta "Hoy" verde / "Vencido" rojo / "Mañana" naranja) · Descripción · Items (preventiva sin items muestra el tipo) · Condición Actual · Fecha Creación* · Origen* · acciones (*ocultas).
- [ ] Filtros: Equipo, Condición, Origen (faceted), Nro. Pedido, Descripción, Dominio, Serie, N° Interno (text), Fecha Planificada, Fecha Creación, Fecha Aprobación (dateRange). Visibles: Equipo, Condición, Fecha Planificada.
- [ ] Búsqueda: "Buscar por dominio, serie...". Vacío: "No hay pedidos confirmados". Orden por defecto `created_at desc`.
- [ ] Export: `pedidos-confirmados`, hoja "Pedidos Confirmados".
- [ ] Acciones por fila: Ver detalle (`PedidoDetailDialog`) · Ver historial · "Aprobar Entrada a Taller" (solo con permiso `mantenimiento:pedidos_confirmados:update`).
- [ ] **EntradaTallerDialog** (`PedidosMantenimiento/components/EntradaTallerDialog.tsx`) "Aprobar Entrada a Taller": lista "Items a Reparar"; "Kilometraje actual del equipo *" (obligatorio salvo "otros equipos"/equipamiento; no puede ser menor al último km registrado: "El kilometraje no puede ser menor a N km"); "Horómetro actual del equipo" (opcional, validado). Botón "Confirmar Entrada" (spinner). Toast "Entrada a taller aprobada. El equipo/equipamiento ahora está "No Operativo"".

## Taller › En Taller — `/dashboard/maintenance?tab=maint_taller&taller_step=in_workshop`

- [ ] Raíz: `MaintenanceOrders/MaintenanceOrdersTabContent.tsx` (carga server: sectores activos, tipos de reparación sin DIAGNÓSTICO, talleres externos) → `table/MaintenanceOrderList.tsx` (Card) → `table/components/_MaintenanceOrderDataTable.tsx`, columnas `table/columns.tsx`, `TABLE_ID='maintenance-orders'`.
- [ ] **Estados por defecto**: `in_workshop`, `operations_rejected`, `workshop_rejected`; las completadas salen del listado pero aparecen filtrando "Completada".
- [ ] Columnas: N° Orden · Descripción · Equipo · Ingreso a Taller · Necesidades (ítems no diagnóstico) · Sector Actual (calculado) · Estado · Progreso (completadas/activas) · Fecha Creación* (oculta) · acciones.
- [ ] Filtros: Estado (faceted), Equipo (FK), Sector Actual (FK, calculado en JS, "Sin asignar"), Ingreso a Taller, Fecha Creación (dateRange), Dominio, Serie, N° Interno, N° Orden, Descripción (text). Visibles: Estado, Equipo, Ingreso a Taller.
- [ ] Búsqueda: "Buscar por N° orden, dominio...". Vacío: "No hay órdenes de mantenimiento". Orden por defecto `created_at desc`.
- [ ] Export: **no usa `exportConfig`**; botón propio en toolbar `_ExportTasksButton` ("Exportar tareas"): una fila por tarea, `tareas-ordenes-mantenimiento`, hoja "Tareas", columnas N° Orden (OM), N° OT, Equipo, Tarea, Tipo de Mantenimiento, Estado de la Tarea, Sector de Taller (Tarea), Es Diagnóstico, Estado (OM), Ingreso a Taller, Fecha Creación, Descripción; respeta filtros; toasts "No hay tareas para exportar" / "Exportado: N tareas".
- [ ] Acciones por fila: si `in_workshop` o `workshop_rejected` → "Gestionar orden" (abre `ManageOrderWizard`) + Ver detalle + Ver ítems solicitados + PDF; resto → Ver detalle + Ver ítems + PDF. **Sin chequeo de permiso para abrir el asistente** (el botón final sí).
- [ ] PDF: `pdf/MaintenanceOrderReportButton.tsx` ("Descargar el detalle completo de la orden en PDF"; layout `MaintenanceOrderReportLayout.tsx`).
- [ ] Ver detalle → `OrderDetailDialog` con `context="workshop"` (ver componente compartido arriba: validar y cerrar, rechazar ítems, devolver todo, completar OT externa, reordenar sectores).
- [ ] Ver ítems → `components/RequestedItemsDialog.tsx` (lista de ítems; vacío "Esta orden no tiene ítems registrados.").

### Asistente de gestión — `OrderManagement/components/ManageOrderWizard.tsx` (Dialog de 4 pasos)

- [ ] Cabecera fija: N° orden (mono) + "Paso N de 4"; recurso (label, n° interno, badge vehículo/equipamiento, tipo), "Ingreso: DD/MM/YYYY", "Km:" (no para equipamiento), "Hs:". `WizardStepIndicator`: 1 Desvíos · 2 Sectores · 3 Orden · 4 Confirmar.
- [ ] **Paso 1 – Desvíos** (`wizard/Step1Tasks.tsx`): tarjeta "Mantenimiento Preventivo" si aplica; botón "Agregar reparación" (`AddItemDialog`); por ítem: editar tipos de reparación (`AssignRepairTypesDialog`), "Rechazar item" (AlertDialog "Rechazar desvío" con "Motivo del rechazo..."), "Eliminar item" (no permitido si viene de la solicitud: toast), comentario ("Escriba su comentario..."); `RejectedItemsList` con "Restaurar item". Vacío: "No hay desvíos en este pedido". Para avanzar: al menos un ítem y todos con ≥1 tipo de reparación. Si se rechazó todo: botón "Guardar cambios" (guarda y cierra). Los cambios del paso 1 se guardan al pulsar Siguiente.
- [ ] **AddItemDialog** "Agregar Reparación": descripción (obligatoria), grupo de tareas (carga sus tareas; toasts si el grupo no tiene o se omiten no disponibles), tareas opcionales con buscador "Buscar tipo de reparación...".
- [ ] **AssignRepairTypesDialog** "Asignar Tipos de Reparación": buscador + checks; mínimo una.
- [ ] **Paso 2 – Sectores** (`Step2SectorAssignment.tsx`): "Asignación de Sectores", select "Sector" por desvío (candidatos según tipos de reparación); confirmación "Todos los desvíos tienen sector asignado." Obligatorio para avanzar.
- [ ] **Paso 3 – Orden** (`Step3ExecutionOrder.tsx`): "Orden de Ejecución", reordenar sectores por drag (dnd-kit) y flechas; "Flujo del vehiculo:"; vacío "No hay sectores asignados".
- [ ] **Paso 4 – Confirmar** (`Step4Confirm.tsx`): "Confirmar Generación" (resumen; "Cada OT incluye diagnóstico automático del sector."), "Fechas planificadas" Fecha inicio / Fecha fin (fin > inicio). Botón "Generar N OT(s)" con permiso `mantenimiento:gestion_ordenes:create`. Toast "N orden(es) de trabajo generada(s) exitosamente".
- [ ] Navegación: "Anterior" / "Siguiente" ("Guardando..."). Cerrar con cambios → AlertDialog "Hay cambios sin guardar" ("Seguir editando" / descartar).

## Taller › Aprobaciones — `/dashboard/maintenance?tab=maint_taller&taller_step=approvals`

- [ ] Raíz: `ApprovalInbox/ApprovalInboxTabContent.tsx` (server: órdenes `pending_workshop_validation`, tareas pendientes de autorización, tareas devueltas, sectores activos) → `components/ApprovalInboxClient.tsx`.
- [ ] Indicadores (botones-badge): **"Autorizaciones"** (ámbar, badge rojo con conteo) y **"Reasignaciones"** (naranja, badge warning); deshabilitados y atenuados con conteo 0; al clic abren modal.
- [ ] Modal Autorizaciones: lista de tareas autorizables (OT, equipo, tipo de reparación, sector…); por tarea: Ver historial (`ActivityHistoryModal` de la OT), "Aprobar" (AlertDialog "Aprobar tarea" → toast "Tarea aprobada"), "Rechazar" (Dialog "Rechazar tarea", "Motivo del rechazo" obligatorio → "Tarea rechazada"). Vacío: "No hay tareas pendientes de autorizacion".
- [ ] Modal Reasignaciones: tareas devueltas con "Motivo de devolucion:"; por tarea: Ver historial, "Reasignar" (Dialog "Reasignar a sector", Select "Nuevo sector" obligatorio → "Tarea reasignada"). Vacío: "No hay tareas devueltas para reasignacion".
- [ ] Sin `PermissionGuard` en estos botones.
- [ ] Tabla: `components/_ValidationOrdersDataTable.tsx` — DataTable nuevo pero **en modo local** (datos del server, `totalRows=data.length`, sin búsqueda, sin toggle de filtros ni de columnas, sin export, sin filtros). Columnas: N° Orden · Equipo · Descripción · Sectores (badge "Sin asignar") · Progreso · Ingreso a Taller · acciones. Vacío: "No hay órdenes pendientes de validación".
- [ ] Acción por fila: "Ver detalle y validar orden" → `OrderDetailDialog context="workshop"` (footer de validación del Jefe de Taller).

## Nuevo Pedido — `/dashboard/maintenance?tab=nuevo_pedido`

- [ ] Raíz: `NuevoPedido/NuevoPedidoTabContent.tsx` (server: `fetchAllEquipmentBasicData`) → `components/NuevoPedidoChecklistForm.tsx` (Card "Crea un pedido desde items de checklist"). El mismo form lo usa el panel de campo `/maintenance/equipment/[id]/request` (`MaintenanceRequestServer.tsx`: equipo fijo, chofer = operario, `skipSupervisorQuestion`, redirige al equipo al terminar).
- [ ] `components/NuevoPedidoForm.tsx` (form RHF de tipos de reparación) **no tiene importadores** (huérfano).
- [ ] Wizard con pasos dinámicos (indicador con icono por paso):
  - Checklist: Recurso → Equipo → Tipo → Items → Supervisor → Confirmar.
  - Preventivo: Recurso → Equipo → Preventivo → Supervisor → Confirmar.
  - Carga manual: Recurso → Equipo → Tipo → Reparaciones → Supervisor → Confirmar.
- [ ] Paso Recurso/Equipo (`nuevo-pedido/StepEquipmentSelector.tsx`): tipo de recurso (vehículo / otros equipos) y combobox de equipo; "Kilometraje actual" y "Horómetro"; tarjeta Identificación / Tipo / Condición ("Sin datos"). Km no puede ser menor al actual.
- [ ] Paso Tipo (`StepRequestType.tsx`): tarjetas "Checklist", "Mant. Preventivo", "Carga Manual - Mant. Correctivo"; checklist → "Selecciona el checklist base" (error "Error al cargar los checklists"); preventivo → "Selecciona el programa" + "Descripción (opcional)".
- [ ] Paso Items (`StepChecklistItems.tsx`): "Selecciona los items con desvío", comentario opcional por desvío, ítems no propagables con aviso ("queda registrado pero no genera trabajo en taller"); vacío "No hay items en este checklist".
- [ ] Paso Reparaciones (manual): "Cargá las reparaciones que necesita el equipo" (tarea o texto libre; toasts si falta elegir tarea o si se agregó lo escrito).
- [ ] Paso Supervisor (`StepSupervisor.tsx`): "¿Eres el supervisor de este pedido?" (Sí/No); si No: "Selecciona el supervisor de turno" (combobox "Buscar supervisor...").
- [ ] Paso Confirmar (`StepConfirm.tsx`): resumen (equipo, Chofer, Tipo de mantenimiento, Descripción, ítems).
- [ ] Botones: Anterior / Siguiente (deshabilitado si el paso no está completo) / Crear (spinner).
- [ ] Validaciones al enviar: "Faltan datos requeridos", "Debes seleccionar al menos un desvío o agregar un ítem manual", "Debes seleccionar un programa de mantenimiento preventivo", "Debes agregar al menos una reparación", km menor al actual, "Debes seleccionar un supervisor".
- [ ] Resultado: si el usuario es el supervisor → se crea el pedido directo ("Pedido creado con …" / "Pedido de mantenimiento creado exitosamente"); si no → solicitud ("Solicitud enviada. El supervisor debe aprobarla antes de que pase a Pedidos."). Errores de conexión con mensaje específico. Reinicia el wizard + `router.refresh()` (o redirect en el panel de campo).
- [ ] Sin `PermissionGuard` adicional (la tab ya exige `view` de `nuevo_pedido`).

## Equipos con Desvíos — `/dashboard/maintenance?tab=equipments_with_deviations`

(También montada en `/dashboard/equipment?tab=type_of_repairs&subtab=equipments_with_deviations`.)
- [ ] Raíz: `EquiposConDesvios/EquiposConDesviosTabContent.tsx` → `EquiposConDesviosList.tsx` → `components/_EquiposConDesviosDataTable.tsx`, columnas `EquiposConDesvios/columns.tsx`, `TABLE_ID='equipments-with-deviations'`.
- [ ] Columnas: Dominio (link a `/dashboard/equipment/action?action=view&id=…`) · Serie · N° Interno · Categoría · Tipo de Unidad · Subtipo de Unidad · Sector · Cantidad de Desvíos · Último Desvío · acciones. Ninguna oculta por defecto.
- [ ] Filtros: Categoría, Tipo de Unidad, Subtipo de Unidad, Sector (faceted, con "Sin asignar"), Dominio, Serie, N° Interno (text). Visibles: Tipo, Subtipo, Sector.
- [ ] Búsqueda: "Buscar por dominio, serie, N° interno...". Vacío: "No hay equipos con desvíos pendientes.".
- [ ] Orden por defecto: más desvíos primero (orden en memoria, `SORT_ACCESSORS`; la agregación no es paginable en BD).
- [ ] Export: `equipos-con-desvios`, título "Equipos con Desvíos Pendientes", hoja "Equipos con Desvíos".
- [ ] Acción por fila: botón "Resolver Desvíos" (sin permiso) → carga los desvíos sin solicitud del equipo y abre `shared/components/critical-deviations-repair-modal.tsx`.
- [ ] **CriticalDeviationsRepairModal** "Registrar Desvíos": aviso si los desvíos son de >1 unidad (una solicitud por unidad) o de >1 checklist; "Supervisor de Turno *" (combobox, supervisores no disponibles deshabilitados; error de carga); comentario opcional por desvío ("Describe el problema encontrado..."); `ManualItemsInput` para ítems manuales. Botones Cancelar / "Registrar Desvíos" (deshabilitado sin supervisor). Toasts con conteos ("N solicitudes de mantenimiento creadas — Se registraron X desvío(s) en Y solicitud(es)…" o "Los desvíos ya tenían solicitud…"). Al cerrar invalida la tabla y todas las queries de mantenimiento.

## Gomería — `/dashboard/maintenance?tab=gomeria&gomeria_tab=…`

Raíz: `Gomeria/GomeriaTabContent.tsx` (`TabsManagerServer paramName="gomeria_tab"`, default `catalogo_cubiertas`). Cada
subtab: `<X>TabContent` (server, carga `getUserPermissionsMapServer()`) → `<X>List.tsx` (Card, preferencias, `permissionsMap`)
→ `_<X>DataTable.tsx` (DataTable nuevo, lazy facets, client-side). Las 5 tablas tienen columna de **checkbox de selección
pero ninguna acción masiva**. Permisos: `mantenimiento:<tabSlug>:create|update|delete`.

### Catálogo — `&gomeria_tab=catalogo_cubiertas`

- [ ] `Catalogo/CatalogoTabContent.tsx` → `TiresList.tsx` → `components/_TiresDataTable.tsx`, columnas `components/columns.tsx`, `TABLE_ID='tires-catalog'`.
- [ ] Columnas: ☐ · Número · Marca · Medida · Condición (nueva/usada) · Precurado · Tipo de banda · Profundidad (mm) · Estado · Vehículo · Fecha de alta · acciones.
- [ ] Filtros: Estado, Marca, Tipo de banda, Condición, Precurado, Vehículo (faceted); Número, Medida (text con placeholder propio); Fecha de alta (dateRange). Visibles: Estado, Marca, Tipo de banda.
- [ ] Búsqueda "Buscar por número o medida...". Vacío "No hay cubiertas registradas". Orden por defecto `created_at desc`.
- [ ] Export: `catalogo-cubiertas`, hoja "Cubiertas", título "Catálogo de Cubiertas" (formatter de tipo de banda).
- [ ] Toolbar (permiso `create`): "Alta masiva" y "Agregar cubierta".
- [ ] Acciones por fila (columna solo si `update` o `delete`): "Marcar como encontrada" (estado `MISSING`, update) · "Marcar como reparada" (`IN_REPAIR`, update) · Editar (update) · Eliminar (delete, AlertDialog "¿Eliminar cubierta?").
- [ ] **TireForm** "Nueva cubierta"/"Editar cubierta": Número de serie*, Marca*, Tipo de cubierta*, Nueva/Usada (switch), Desgaste (%) (positivo, opcional), Precurado (opcional, "Sin precurado").
- [ ] **TireBulkForm** "Alta masiva de cubiertas": Prefijo*, Desde*, Hasta* (enteros positivos, Hasta ≥ Desde, **máx. 500**), Marca*, Tipo*, Profundidad (mm), Nueva/Usada, Precurado. Botón deshabilitado con rango 0. Toast "Se crearon N cubiertas correctamente".

### Plantillas — `&gomeria_tab=plantillas_cubiertas`

- [ ] `Plantillas/PlantillasTabContent.tsx` → `TemplatesList.tsx` → `components/_TemplatesDataTable.tsx`, `TABLE_ID='tire-templates'`.
- [ ] Columnas: ☐ · Nombre · Descripción · Ejes · Posiciones (tooltip con detalle) · Medidas · Creado · acciones.
- [ ] Filtros: Nombre, Descripción (text), Fecha de creación (dateRange). Visibles: Nombre, Fecha de creación.
- [ ] Búsqueda "Buscar por nombre...". Vacío "No hay plantillas registradas". Orden `created_at desc`. Export `plantillas-cubiertas`, hoja "Plantillas", título "Plantillas de Cubiertas".
- [ ] Toolbar: "Nueva plantilla" (create). Fila: "Asignar a subtipo" (create) · Editar (update) · Eliminar (update; AlertDialog "¿Eliminar plantilla?").
- [ ] **TemplateForm** "Nueva/Editar plantilla": Nombre*, Descripción (opcional), "Configuración de ejes" (`AxleConfigurator`: por eje Tipo Simple/Dual, Medida opcional, Tractor, Auxilio — auxilio siempre simple; agregar/quitar, mínimo 1: "Debe configurar al menos un eje") + "Vista previa" (`TemplatePreview`/`TireDiagramRenderer`).
- [ ] **TemplateAssignDialog** "Asignar plantilla a subtipos": buscador de subtipos con checks (asignar/desasignar), confirmación "¿Cambiar plantilla de subtipos?" si ya tenían otra. Toasts con conteo de asignados/desasignados.

### Órdenes — `&gomeria_tab=ordenes_gomeria`

- [ ] `Ordenes/OrdenesTabContent.tsx` → `ServiceOrdersList.tsx` → `components/_ServiceOrdersDataTable.tsx`, `TABLE_ID='tire-service-orders'`.
- [ ] Columnas: ☐ · Fecha · Vehículo · Enganche · Kilómetros · Intervenciones · Estado · Creado por · Creado · acciones.
- [ ] Filtros: Estado, Vehículo, Enganche, Creado por (faceted); Kilómetros (text); Fecha, Creado (dateRange). Visibles: Estado, Vehículo, Creado por.
- [ ] Búsqueda "Buscar por kilómetros...". Vacío "No hay órdenes de gomería". Orden `created_at desc`. Export `ordenes-gomeria`, hoja "Órdenes", título "Órdenes de Gomería".
- [ ] Toolbar: "Nueva Orden" (create) → Dialog con `ServiceOrderWizard mode="dashboard"`.
- [ ] Fila: "Ver detalle" (siempre) · si `OPEN` y `update`: "Continuar intervenciones" (abre el wizard en modo reanudar), "Finalizar orden" (AlertDialog "¿Finalizar orden de gomería?" — no se podrán agregar intervenciones), "Anular orden" (AlertDialog "¿Anular orden de gomería?" — revierte movimientos de cubiertas, irreversible).
- [ ] **ServiceOrderDetailView** "Detalle de Orden de Gomería": tabla de intervenciones (Pos., Acción, Cubierta, Nueva cubierta, Destino ant., Desgaste, Presiones, Observaciones); "Orden no encontrada.".

#### Asistente de órdenes — `Ordenes/components/ServiceOrderWizard.tsx` (también en `/maintenance/equipment/[id]/tire-service` vía QR, `mode="qr"`)

- [ ] Paso **setup** "Nueva Orden de Gomería": "Buscar vehículo" (por dominio; "No se encontraron vehículos"; se omite en QR o al reanudar), "Kilómetros actuales", opción "Agregar Enganche" ("El enganche también recibirá intervenciones") con "Buscar enganche por dominio". Botón "Iniciar Operación" (crea la orden).
- [ ] Paso **operation** "Orden — <dominio>": "Toque una posición para registrar una intervención.", badge "Orden abierta", `TireDiagram` del vehículo y del enganche. Botón "Finalizar orden" (en QR redirige).
- [ ] **TirePositionCard** (Sheet lateral, `modal=false`, "Posición N"): datos de la cubierta montada; tabs **Calibrar** (Desgaste %, Presión inicio/fin PSI, Observaciones), **Reparar** (cubierta de reemplazo, Observaciones), **Reemplazar** (Cubierta nueva vía `TireReplacePicker`, "Destino cubierta actual" Disponible/Descarte/Reparación; foto de descarte/reparación + motivo obligatorio; Desgaste nuevo, presiones, Observaciones); "Reportar cubierta extraviada" (motivo obligatorio). Posición vacía: asignar cubierta ("Cubierta asignada a la posición").
- [ ] **TireReplacePicker**: buscador "Buscar por serie, marca o medida..." sobre stock disponible ("No hay cubiertas disponibles en stock") + Dialog "Crear cubierta rápida" (Número de serie, Marca, Tipo).

### Marcas — `&gomeria_tab=marcas_cubiertas`

- [ ] `Marcas/MarcasTabContent.tsx` → `components/MarcasList.tsx` → `_MarcasDataTable.tsx`, `TABLE_ID='tire-brands'`.
- [ ] Columnas: ☐ · Nombre · Estado · Cubiertas (cantidad) · Creado · acciones. Filtros: Estado (faceted), Nombre (text), Creado (dateRange); visibles Estado, Nombre.
- [ ] Búsqueda "Buscar por nombre...". Vacío "No hay marcas registradas". Orden `name asc`. Export `marcas-cubiertas`, hoja "Marcas".
- [ ] Toolbar "Nueva Marca" (create). Fila (update): Editar · Activar/Desactivar (AlertDialog "¿Desactivar marca?"/"¿Activar marca?").
- [ ] **MarcaForm** "Nueva/Editar Marca": Nombre* (máx. 100).

### Tipos — `&gomeria_tab=tipos_cubiertas`

- [ ] `Tipos/TiposTabContent.tsx` → `components/TiposList.tsx` → `_TiposDataTable.tsx`, `TABLE_ID='tire-types'`.
- [ ] Columnas: ☐ · Nombre · Medida · Tipo de banda · Estado · Cubiertas · Creado · acciones. Filtros: Tipo de banda, Estado (faceted), Nombre, Medida (text), Creado (dateRange); visibles Tipo de banda, Estado, Nombre.
- [ ] Búsqueda "Buscar por nombre o medida...". Vacío "No hay tipos registrados". Orden `name asc`. Export `tipos-cubiertas`, hoja "Tipos".
- [ ] Toolbar "Nuevo Tipo" (create). Fila (update): Editar · Activar/Desactivar (AlertDialog).
- [ ] **TipoForm** "Nuevo/Editar Tipo de Cubierta": Nombre*, Medida*, Tipo de banda* (select).

## Otras pantallas de Mantenimiento fuera de `/dashboard/maintenance`

- [ ] `/dashboard/equipment?tab=type_of_repairs` (label "Mantenimiento"): `RepairTypes.tsx` con `paramName="subtab"` — Equipos con Desvíos, Tipos de Reparación, Grupos, Solicitudes de Mantenimiento, Pedidos de Mantenimiento (subtabs `pedidos_tab=pendientes|confirmados`), Operaciones (`operations_tab=operations_pending|operations_planned|operations_for_workshop`). Pipeline viejo; ver sección siguiente.
- [ ] `/dashboard/configuration?tab=mantenimiento`: Talleres, Sectores, Tipos de reparación (`RepairTypeForm`), Grupos (`MaintenanceGroupsTable`).
- [ ] Paneles de campo `/maintenance/*` (login anónimo, equipo por QR, checklists, nuevo pedido, gomería QR, gracias): fuera del alcance de este archivo.

## Tablas del sistema viejo (BaseDataTable)

Relevado con grep de importadores (incluidos barrels `index.ts`). Ningún archivo importa el barrel raíz
`@/features/Mantenimiento`, ni `@/features/Mantenimiento/Planificacion`, ni `@/features/Mantenimiento/OrderManagement`.

**Cadena viva A** — `/dashboard/equipment?tab=type_of_repairs` (label "Mantenimiento", permiso `equipos:type_of_repairs`):
`app/dashboard/equipment/page.tsx` → `features/Equipos/EquiposComponent.tsx` → `TiposReparaciones/RepairTypes.tsx`
(`TabsManagerServer paramName="subtab"`, sin `hiddenTabs`: monta sus 6 subtabs) →
- `subtab=type_of_repair` → `RepairTypeFormWrapper` → `RepairTypeForm`
- `subtab=maintenance_groups` → `MaintenanceGroupsWrapper` → `MaintenanceGroupsClient` → `MaintenanceGroupsTable`
- `subtab=maintenance_operations` (permiso `mantenimiento:maint_operaciones`) → `Operaciones/OperacionesTabContent.tsx` (`paramName="operations_tab"`) → `OperacionesTableClient`, `OperacionesPlanificadasTableClient`, `ParaTallerTableClient`
- `subtab=maintenance_orders` → `PedidosMantenimientoTabContent` → Pendientes/Confirmados **versión nueva** (`PendingOrderList`/`ConfirmedOrderList`)
- `subtab=maintenance_requests` → `SolicitudesMantenimientoTabContent` (tabla nueva, la misma de Validar)
- `subtab=equipments_with_deviations` → tabla nueva de Equipos con Desvíos

**Cadena viva B** — `/dashboard/configuration?tab=mantenimiento` (permiso `configuracion:mantenimiento`):
`app/dashboard/configuration/page.tsx` → `features/Empresa/EmpresaComponent.tsx` → subtabs `type_of_repair` (`RepairTypeFormWrapper`) y `maintenance_groups` (`MaintenanceGroupsWrapper`).

| Archivo (BaseDataTable) | Estado | Desde dónde / por qué | Equivalente nuevo |
|---|---|---|---|
| `TiposReparaciones/RepairTypeForm.tsx` (form + tabla en el mismo archivo; cols Nombre, Descripción, Criticidad, Estado, Tipo de Mantenimiento, Autorizable, Acciones; filtros Nombre/Criticidad/Tipo/Autorizable; persistencia por cookies `repair-type-table*`; permisos `equipos:type_of_repair` create/update; Eliminar con AlertDialog) | **EN USO** | Cadenas A y B | No existe |
| `TiposReparaciones/MaintenanceGroupsTable.tsx` (cols Nombre, Tipos de reparación, Descripción, Estado, Acciones=Editar; filtros Nombre/Tipos/Estado; form `MaintenanceGroupForm` nombre*, descripción, tipos asociados, Activo/Inactivo; permisos `equipos:maintenance_groups` create/update) | **EN USO** | Cadenas A y B | No existe |
| `Operaciones/components/OperacionesTableClient.tsx` + `columns.tsx` (Equipo, Fecha Planificada, Items, Condición Actual, Km Actual, Acciones; filtros Equipo/Estado; dialogs Detalle/Aprobar entrada/Rechazar/Historial) | **EN USO** | Cadena A, `operations_tab=operations_pending` ("Pendientes de Ejecutar") | Parcial: Seguimiento (`WorkshopTracking`) + Taller › Por Ingresar |
| `Operaciones/components/OperacionesPlanificadasTableClient.tsx` + `columnsReadonly.tsx` (igual + Estado; solo Ver/Historial) | **EN USO** | Cadena A, `operations_tab=operations_planned` ("Planificadas (Vista)") | Parcial: Seguimiento |
| `Operaciones/ParaTaller/components/ParaTallerTableClient.tsx` + `columns.tsx` (Equipo, Items, Fecha Planificada, Condición, Km, Acciones; dialog `ParaTallerDetailDialog`, Historial) | **EN USO** | Cadena A, `operations_tab=operations_for_workshop` ("Para Taller") | Seguimiento, estado "Pendiente de ingreso a taller" (el paso "Para Taller" del pipeline se eliminó) |
| `Operaciones/components/OperacionesTable.tsx` | **HUÉRFANA** | Solo re-export en `Operaciones/index.ts` | `OperacionesTableClient` (viejo) |
| `Operaciones/components/OperacionesPlanificadasTable.tsx` | **HUÉRFANA** | Solo re-export en `Operaciones/index.ts` | `OperacionesPlanificadasTableClient` |
| `PedidosMantenimiento/components/PedidosTable.tsx` + `columns.tsx` | **HUÉRFANA** | Solo re-export en `PedidosMantenimiento/index.ts` (barrel raíz sin consumidores) | Pendientes/Confirmados nuevos |
| `PedidosMantenimiento/components/PedidosTableClient.tsx` | **HUÉRFANA** | Sin importadores | Ídem |
| `PedidosMantenimiento/Pendientes/components/PendientesTableClient.tsx` + `components/columns.tsx` | **HUÉRFANA** | Sin importadores | `Pendientes/components/_PendingOrderDataTable.tsx` (Taller › Por Programar) |
| `PedidosMantenimiento/Confirmados/components/ConfirmadosTableClient.tsx` + `components/columns.tsx` | **HUÉRFANA** | Sin importadores | `Confirmados/components/_ConfirmedOrderDataTable.tsx` (Taller › Por Ingresar) |
| `Planificacion/components/PlanificacionTableClient.tsx` + `columns.tsx` (y todo `Planificacion/`: `PlanificacionTabContent`, `AsignarTallerDialog`, `AsignarBulkDialog`, `PlanificacionDetailDialog`) | **HUÉRFANA** | `PlanificacionTabContent` solo en su `index.ts`, barrel sin consumidores | Taller › Por Programar (`PlanificarPedidoDialog`) |
| `MaintenanceOrders/components/MaintenanceOrdersClient.tsx` + `components/columns.tsx` | **HUÉRFANA** | Sin importadores | `MaintenanceOrders/table/_MaintenanceOrderDataTable.tsx` (Taller › En Taller) |
| `OrderManagement/components/OrderManagementClient.tsx` + `components/columns.tsx` | **HUÉRFANA** | Sin importadores | `ManageOrderWizard` desde Taller › En Taller |

Notas:
- Además, **código nuevo huérfano** (no BaseDataTable): `OrderManagement/OrderManagementTabContent.tsx` → `OrderManagementList` → `_OrderManagementDataTable.tsx` + `OrderManagement/columns.tsx` (solo re-export en su `index.ts`) y `MaintenanceOrders/table/MaintenanceOrdersTableContent.tsx` (sin importadores). Los componentes `ManageOrderWizard`, `AssignRepairTypesDialog`, `wizard/*` y `OrderManagement/actions/*` **sí** están vivos (los usa Taller › En Taller).
- `PedidosMantenimiento/components/EntradaTallerDialog.tsx`, `PlanificarPedidoDialog.tsx`, `PedidoDetailDialog.tsx`: verificar uso desde las tablas nuevas antes de borrar nada (ver secciones de Taller).
- Conteo: **14 entradas BaseDataTable** (23 archivos con el import) → **5 en uso** (RepairTypeForm, MaintenanceGroupsTable, OperacionesTableClient, OperacionesPlanificadasTableClient, ParaTallerTableClient) y **9 huérfanas**.

<!-- estado: completo -->
