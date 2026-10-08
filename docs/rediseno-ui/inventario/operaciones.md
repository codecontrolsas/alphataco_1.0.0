# Inventario ANTES — Operaciones

> Ficha funcional previa al rediseño. Cada `- [ ]` se tilda "después" cuando se verifica que sigue igual.
> Permisos: `módulo:tab:acción` (map de `getUserPermissionsMapServer`). Rutas: `/dashboard/operations`.
> Página raíz: `src/app/dashboard/operations/page.tsx` → `src/features/Operaciones/OperacionesComponent.tsx`
> (`SectionManagerServer`, `paramName="tab"`, default `preparte`, cada tab filtrada por permiso `view` de su `tabSlug`).

---

## Gestor de Pedidos — `/dashboard/operations?tab=preparte`

- [ ] Componente raíz: `features/Operaciones/Preparte/PreparteTabContent.tsx` → `list/PreparteList.tsx` (server: datos paginados + preferencias + clientes con relaciones + contratos) → `components/PreparteManager.tsx` (client).
- [ ] Tab con ícono `Package` y label "Gestor de Pedidos"; visible con `operaciones:preparte:view`. Fallback `fallback/PreparteSkeleton.tsx`.
- [ ] Título "Gestión de Pedidos" (`data-testid="preparte-title"`).

### Botones de cabecera
- [ ] **Generar Informe** (ícono FileSpreadsheet) — sin permiso — abre `PreparteReportModal`.
- [ ] **Nuevo Pedido** (ícono Plus, `data-testid="nuevo-pedido-button"`) — `PermissionGuard operaciones/preparte/create` — limpia el form y abre el Sheet en modo crear.

### Tarjetas de estado (encima de la tabla)
- [ ] `components/StatusCardsServerContainer.tsx` + `StatusCardServer.tsx` (COUNT por estado, cada una con su `Suspense` + `StatusCardSkeleton`) + `StatusCardsWrapper.tsx` (client).
- [ ] 7 tarjetas: Todos, Pendientes, Reprogramados (amarillo), Confirmados (verde), Cancelados, Rechazados, Vencidos (rojo).
- [ ] Click: escribe `preparte-table__status=<estado>` en la URL (borra `preparte-table__page`) con `replaceState` + evento `DATA_TABLE_URL_CHANGE_EVENT` → filtra la tabla sin navegar. "Todos" borra el filtro.
- [ ] Tarjeta seleccionada con borde primario; se resincroniza con cambios de URL (evento + `popstate`). Fila horizontal con scroll (`overflow-x-auto`).
- [ ] `data-testid="status-card-<estado|todos>"`.

### Tabla de pedidos
- [ ] Archivos: `list/components/_PreparteDataTable.tsx`, columnas `list/columns.tsx`, server `list/actions.server.ts`.
- [ ] Sistema: **DataTable nuevo**, client-side mode (`queryFn` + `queryKey ['preparte-list']`), `tableId`/`paramNamespace` = `preparte-table`. Facets **bulk** (`getPreparteFacets` + `options`/`externalCounts` + `isFetchingFacets`, patrón deprecado — no se toca el comportamiento).
- [ ] Columnas (meta.title): select (solo con `update`), Fecha de solicitud, Fecha de ejecución (badge ámbar "Pendiente de fecha" si sujeto a disponibilidad sin fecha), N° pedido, Estado (badge: confirmado=success, cancelado/rechazado/vencido=destructive, reprogramado=warning, resto default), Cliente, Contrato, Sector (cliente), Área (cliente), Equipo cliente, Ítem, Cantidad, Tipo (snake → Título), Jornada, Hora de inicio, Hora de fin, Solicitante, Motivo (según estado: cancel/rejected/reprogram reason; sin orden), Confirmado por, Rechazado por, Cancelado por, Reprogramado por (estas 3 sin orden), Observaciones, Imagen (sin orden), acciones.
- [ ] Ocultas por defecto: Sector, Área, Equipo cliente, Cantidad, Tipo, Jornada, Hora inicio, Hora fin, Motivo, Confirmado por, Rechazado/Cancelado/Reprogramado por, Observaciones, Imagen.
- [ ] Filtros (21): Fecha de solicitud (dateRange), Fecha de ejecución (dateRange), N° pedido (text), Estado (faceted con íconos + "Sin estado"), Cliente, Contrato, Sector (cliente) (+"Sin sector"), Área (cliente) (+"Sin área"), Equipo cliente (+"Sin equipo"), Ítem (+"Sin ítem"), Cantidad (text), Tipo (+"Sin tipo"), Jornada (+"Sin jornada"), Hora de inicio (text), Hora de fin (text), Solicitante (text), Confirmado por (text), Rechazado por / Cancelado por / Reprogramado por (faceted + "Sin asignar"), Observaciones (text).
- [ ] Visibles por defecto: Fecha de solicitud, Estado, Cliente. `showFilterToggle`.
- [ ] Búsqueda: "Buscar por pedido, solicitante, observación o motivo...".
- [ ] Orden por defecto (server): `requestDate desc, created_at desc`. Orden FK por nombre (cliente, contrato, equipo, ítem, sector, área, perfiles).
- [ ] Exportación Excel: `gestion-pedidos-YYYY-MM-DD`, título "Gestión de Pedidos", hoja "Pedidos", usa `currentParams` (respeta filtros). Formatters: fechas DD/MM/YYYY, "Pendiente de fecha", labels de estado, tipo, motivo, URL de imagen.
- [ ] Empty: "No hay pedidos registrados". `data-testid="preparte-table"`.
- [ ] Selección: solo con `operaciones:preparte:update`; seleccionables solo filas `pendiente` o `reprogramado`. Cambiar filtros/página limpia la selección.
- [ ] Acción masiva (toolbar, con `update`): **Cambiar estado** (ícono Edit), deshabilitado sin selección → `PreparteBulkStatusModal`.
- [ ] Acciones por fila (íconos con tooltip):
  - [ ] Ver detalle (Eye) — siempre → `PreparteDetailModal`.
  - [ ] Editar (Pencil) — `update` y estado `pendiente` → Sheet en modo edición.
  - [ ] Eliminar (Trash2, `data-testid="eliminar-button-<nro>"`) — `delete` y estado `pendiente` → AlertDialog "¿Eliminar este pedido?" → `deletePreparte` → toast "Pedido eliminado correctamente".
  - [ ] Confirmar (Check verde, `data-testid="confirmar-button-<nro>"`) — visible con `update`; habilitado solo si `pendiente` o `vencido`, con fecha de ejecución y no (sujeto a disponibilidad sin fecha). Tooltip "Ya confirmado" si confirmado.
- [ ] Celda Imagen: botón ojo → Dialog "Vista previa" (iframe si PDF, `<img>` si imagen).

### Dialog: Confirmar pedido (por fila)
- [ ] Título "¿Confirmar pedido?" / "Confirmar pedido vencido". Texto: "El pedido se enviará al parte diario correspondiente a la fecha de ejecución."
- [ ] Campos: Fecha de ejecución (`input type=date`, min hoy) **solo si vencido**; Confirmado por* (`data-testid="confirmado-por-input"`).
- [ ] Botón "Confirmar" (`confirmar-modal-button`) deshabilitado sin "Confirmado por" (o sin fecha en vencido) → `confirmPreparteToDailyReport(id, fecha, confirmadoPor)` → toast "Pedido confirmado y enviado al parte diario".
- [ ] Si sujeto a disponibilidad sin fecha: toast de error y abre el form de edición para asignar fecha.

### Sheet: Nuevo / Editar Pedido (`components/PreparteForm.tsx` + `preparte-form/*`, schema `schemas/preparte-form.ts`)
- [ ] Sheet lateral derecho (`w-[750px] max-w-[75vw]`), título "Nuevo Pedido" / "Editar Pedido". Form remonta por `key` al cambiar modo.
- [ ] Sección "Datos del Cliente" (`CustomerContractSection`): Cliente* (combobox; bloqueado en edición), Contrato* (depende de cliente; bloqueado en edición), Fecha de Solicitud* (calendar; bloqueado en edición), Solicitante* (bloqueado en edición).
- [ ] Solo edición — Estado (select): Pendiente (deshabilitado si ya es pendiente), Reprogramado, Cancelado, Rechazado, Confirmado (siempre deshabilitado). Condicionales: Motivo de cancelación*, Motivo de rechazo*, Fecha de reprogramación* (no pasadas) + Motivo del Reprogramado*.
- [ ] Ubicación (`LocationSection`): Sector del Cliente (opcional), Área del Cliente* (uuid obligatorio), Equipos del Cliente (multi; se guarda solo el primero). Todos bloqueados en edición y sin cliente/contrato.
- [ ] Ítems (`ItemsSection`), por cada ítem: Item* (combobox de ítems del contrato), Cantidad* (≥1), Jornada* (Jornada 8 / 12 / 24 horas / Por horario; "por horario" muestra Hora de inicio/fin `type=time`), Tipo de servicio* (radio Mensual / Adicional / Adicional permanente), Observaciones, Fecha de Ejecución* (rango en alta, fecha única en edición; deshabilitada si sujeto a disponibilidad), checkbox "Sujeto a disponibilidad operativa" (limpia la fecha; ayuda "No podrá confirmarse hasta asignar fecha." / "Desmarcar para asignar fecha y poder confirmar.").
- [ ] Alta: botón "Agregar ítem" y quitar ítem (si >1). En edición solo un ítem, editable solo si estado pendiente.
- [ ] Edición: si se cambia el ítem aparece "Motivo del cambio de ítem *" (Textarea) — obligatorio; se registra en el log de cambios (`logPreparteChange`), si el log falla toast warning.
- [ ] Archivo: alta "Documento adjunto (Imagen o PDF)"; edición "Cambiar imagen del pedido (aplica a todo el N° X)". `accept=image/*,application/pdf`. Se sube a bucket `preparte-img` y luego se mueve a la estructura final (`movePreparteFile`).
- [ ] Validaciones Zod: cliente, contrato, ≥1 ítem, solicitante, fecha solicitud, área; motivos obligatorios por estado; fecha de reprogramación; cada ítem con jornada, tipo y (fecha o sujeto a disponibilidad).
- [ ] Botones: Cancelar / Guardar ("Guardando...") | Actualizar ("Actualizando...") (`guardar-preparte-button`).
- [ ] Alta: genera N° `PED-####` (último + 1); crea 1 preparte por cantidad × cada día del rango (o sin fecha si sujeto a disponibilidad). Toast "Se crearon N pedidos con N° PED-xxxx (x con fecha, y pendientes de fecha)".
- [ ] Edición normal: `updatePreparte` → "Pedido actualizado correctamente".
- [ ] Edición a Reprogramado: crea un preparte nuevo `pendiente` con la fecha nueva (`reprogram` = id original) y marca el original reprogramado con nota en observaciones → "Servicio reprogramado correctamente".
- [ ] Tras guardar: invalida `preparte-list`, facets, `prepartes`, change-logs y `router.refresh()` (actualiza tarjetas).

### Dialog: Cambiar estado masivamente (`components/PreparteBulkStatusModal.tsx`)
- [ ] Lista "Pedidos seleccionados:".
- [ ] Nuevo estado (select): Pendiente, Confirmado, Reprogramado, Cancelado, Rechazado.
- [ ] Condicionales: Reprogramado → fecha (no pasada) + motivo*; Cancelado/Rechazado → motivo*; Confirmado → "Confirmado por"*.
- [ ] Botón Guardar deshabilitado si inválido. Acciones: Confirmado → `confirmMultiplePrepartesToDailyReport` (toasts con confirmados / omitidos ya en parte / errores, 10 s); Reprogramado → `bulkReschedulePrepartes` (atómico: clona pendientes con fecha nueva); otros → `updateMultiplePreparteStatus`.
- [ ] Al terminar limpia selección y refresca tabla + tarjetas. Usa el `toast` estilo `{title, description, variant}`.

### Dialog: Detalle del pedido (`components/PreparteDetailModal.tsx`)
- [ ] Cabecera: Solicitud, Ejecución, badge de estado (colores por estado), badge de tipo, badge "sujeto a disponibilidad".
- [ ] Bloque de motivo (cancelado/rechazado/reprogramado/vencido) con actor ("Cancelado por: …").
- [ ] Secciones: Equipos del Cliente (n), Detalles del Servicio (Contrato, Item, Cantidad, Observaciones), Horarios, Información del Solicitante, Imagen/Documento Adjunto, Historial de Cambios (`usePreparteChangeLogs`: fecha "D MMM YYYY, HH:mm", campo, de→a, motivo, badge).
- [ ] Solo lectura; se abre desde "Ver detalle" (`showTrigger=false`).

### Dialog: Generar Informe (`components/PreparteReportModal.tsx`)
- [ ] Campos: Desde* y Hasta* (`type=date`, Hasta ≥ Desde), Clientes (checkbox list, vacío = todos), Estados (checkbox grid, vacío = todos), Agrupar por (radio Línea | Pedido, default Línea).
- [ ] Generar → `getPreparteReportData`; si 0 registros toast warning; si no, Excel (ExcelJS) con hojas "Resumen" + "Detalle" (por línea o por pedido) → `Informe_Pedidos_DDMMYYYY_DDMMYYYY.xlsx`. Botón con spinner mientras genera.

---

## Partes Diarios (lista) — `/dashboard/operations?tab=dailyreportstable`

- [ ] Componente raíz: `features/Operaciones/PartesDiarios/PartesDiariosTabContent.tsx` (Card + `ResizablePanelGroup` horizontal). Tab con ícono `ClipboardList`, visible con `operaciones:dailyreportstable:view`.
- [ ] Panel izquierdo (30%, redimensionable con handle) **solo con `operaciones:dailyreportstable:create`**: `components/DailyReportForm.tsx`.
- [ ] Panel derecho (70%): `list/DailyReportList.tsx` → `list/components/_DailyReportDataTable.tsx`.

### Form "Crear parte diario"
- [ ] Campo Fecha* (Popover + Calendar, botón con texto; días anteriores a ayer deshabilitados). Descripción "Seleccione la fecha para el parte diario."
- [ ] Botón "Crear parte diario" ("Creando..."). Verifica duplicado (`checkDailyReportExists`) → toast "Ya existe un parte diario para esta fecha."; crea (`createDailyReport`), toast éxito, invalida la lista y **redirige** a `/dashboard/operations/<id>`.
- [ ] Nota: date picker sin escritura directa (regla `date-pickers.md`).

### Tabla de partes diarios
- [ ] Columnas: `list/columns.tsx`; server `list/actions.server.ts`. **DataTable nuevo** en modo SSR (sin `queryFn`), `tableId`/`paramNamespace` = `daily-reports`. Facets bulk (`getDailyReportFacets`).
- [ ] Columnas: Fecha, Estado (badge), Fecha de creación (oculta), Sin Recursos (badge warning si >0; no exporta, sin orden), Pendientes (no exporta), Total (no exporta), Activo (badge), acciones.
- [ ] Filtros: Fecha (dateRange), Estado (faceted con íconos abierto/cerrado/cerrado completo/cerrado incompleto + "Sin asignar"), Fecha de creación (dateRange), Activo (Activo/Inactivo). Visibles: Fecha, Estado.
- [ ] Búsqueda: "Buscar partes diarios...". Orden por defecto: inactivos al final, luego `date desc`.
- [ ] Export: `partes-diarios`, "Listado de Partes Diarios", hoja "Partes Diarios" (usa `searchParams` iniciales, no los actuales). Formatters fecha/estado/activo.
- [ ] Empty: "No hay partes diarios registrados". Sin selección ni acciones masivas.
- [ ] Acciones por fila: **Ver** (link a `/dashboard/operations/<id>`, siempre); **Eliminar** (`operaciones:dailyreportstable:delete`) — deshabilitado si el parte tiene filas (title "No se puede eliminar un parte con registros") → AlertDialog "¿Está seguro de eliminar este parte diario?" → toast.promise.

---

## Detalle del parte diario — `/dashboard/operations/[uuid]`

- [ ] Página: `src/app/dashboard/operations/[uuid]/page.tsx` (+ `loading.tsx`). Exige `operaciones:detalle-parte-diario:view`, si no → `redirect('/dashboard')`. Metadata "Parte diario - DD/MM/YYYY".
- [ ] Dos `Suspense` independientes: `detail/DailyReportHeader.tsx` (fallback `DailyReportHeaderSkeleton`) y `detail/DailyReportDetailTable.tsx` (fallback `DailyReportDetailSkeleton`).
- [ ] Cabecera (Card): "Parte diario" + badge de estado (abierto/cerrado/…), "Fecha: DD/MM/YYYY" (UTC), botón **Volver** (`BackButton`).

### Barra superior (solo con `operaciones:detalle-parte-diario:update`)
- [ ] **Crear** — habilitado si `update` y (parte `abierto` o la fecha del parte es hoy); si no, deshabilitado con tooltip "El parte está cerrado y no es el día de hoy". Abre el Sheet de fila en modo alta.
- [ ] **Clonar Registros** / **Clonar (n)** (ícono CalendarCheck) — sin selección clona todo (modo `all`), con selección clona las seleccionadas (modo `selected`) → `CloneRowsDialog`.

### Tabla editable de filas
- [ ] Archivos: `detail/components/_DailyReportDetailDataTable.tsx`, columnas `detail/columns/` (`index.tsx`, `resource-columns.tsx`, `employee-columns.tsx`, `status-columns.tsx`, `badge-cells.tsx`, `row-actions-cell.tsx`), server `detail/queries.server.ts`, export `detail/export.server.ts`.
- [ ] Sistema: **DataTable nuevo**, client-side (`queryFn`, `queryKey ['daily-report-detail', id]`), `tableId`/`paramNamespace` = `daily-report-detail`, facets **lazy** (`fetchFacet` → `getDailyReportDetailSingleFacet`).
- [ ] Columnas: select, Cliente, Servicio, Ítem, Sector, Área, Tipo Servicio, Equipo cliente (sin orden), Chofer Día, Ayudante Día, Chofer Noche, Ayudante Noche, Empleados (sin orden), Equipos (sin orden), Jornada, Hora Inicio (oculta), Hora Fin (oculta), Estado, Descripción (truncada + tooltip), Nro Remito, Completado Día, Completado Noche, acciones.
- [ ] Celda Estado: badge por estado; "Ejecutado parcial" (info) si jornada 24 h no ejecutada con algún turno completado; cancelado con motivo → ícono Info + tooltip con el motivo.
- [ ] Celdas de empleados/equipos (`ResourceCell` + `badge-cells`): badge por recurso con tooltip de desvíos (fuente `lib/resource-deviations.ts` + `useValidationData`). Empleado: "Empleado asignado en múltiples filas" (naranja), "No asignado al cliente de esta fila" (azul), "Sin diagrama cargado para este día" (rojo), los dos anteriores juntos (violeta), "Día no laboral: <diagrama>" (amarillo). Equipo: duplicado, "Condición: No operativo / En reparación / Condicionado / En preparación", no asignado al cliente. Skeleton mientras cargan las validaciones.
- [ ] Color de fila: azul si tuvo edición comercial (`last_comercial_edit_at`); amarillo si se creó después de la fecha del parte.
- [ ] Filtros (17): Estado (íconos), Cliente, Servicio, Ítem, Sector, Área, Tipo Servicio (+"Sin asignar"), Jornada (+"Sin jornada"), Descripción (text), Nro Remito (text), Completado Día / Noche (Sí/No/Sin asignar), Empleados (+"Sin empleados"), Equipos (+"Sin equipos"), Equipo cliente (+"Sin equipo cliente"). Visibles por defecto: Estado, Cliente, Jornada.
- [ ] Búsqueda: "Buscar por descripción, remito, cliente, servicio...". Orden por defecto: cliente, servicio, ítem (asc). Choferes/ayudantes ordenables.
- [ ] Export: `detalle-parte-diario`, título "Detalle de Parte Diario", hoja "Detalle Parte Diario", usa `currentParams`. Formatters: estado, tipo, Sí/No, horas HH:mm (UTC), listas de recursos.
- [ ] Empty: "No hay registros en este parte diario".
- [ ] Selección: siempre visible; **no seleccionables** filas `sin_recursos_asignados` y `reprogramado` (checkbox deshabilitado).
- [ ] Acción masiva (toolbar, con selección y `update`): **Editar (n)** → `BulkEditModal`; deshabilitado con tooltip si hay filas `ejecutado` seleccionadas ("No se pueden editar registros ejecutados…").
- [ ] Acciones por fila (`row-actions-cell.tsx`, botones ícono con `title`):
  - [ ] Ver detalle — siempre → `ServiceDetailDialog`.
  - [ ] Editar — `update`, estado ≠ `en_certificacion` y (≠ `ejecutado` o parte de hoy) → Sheet de fila.
  - [ ] Asignar recursos (UserCog cian) — permiso propio `operaciones:detalle-parte-diario:assign_resources`, misma elegibilidad que editar → Sheet en modo "solo recursos".
  - [ ] Historial — siempre → `HistoryDialog`.
  - [ ] Eliminar (rojo) — `delete` y (parte de hoy o futuro, o fila `sin_recursos_asignados`) → `DeleteRowDialog`.

### Sheet: Agregar / Editar fila — Asignar recursos (`detail/components/DailyReportRowForm/`)
- [ ] Cargado con `dynamic(ssr:false)`; apertura en Zustand (`store/dailyReportDetailFormStore.ts`, `mode: 'resources'`). Catálogos (clientes, empleados por fecha, vehículos, otros equipos) con React Query solo al abrir.
- [ ] Títulos: "Agregar Fila del Parte Diario" / "Editar Fila del Parte Diario" / "Asignar Recursos" con su descripción. En edición muestra spinner "Cargando datos de la fila...".
- [ ] Modo "solo recursos": Cliente/Servicio/Jornada y la sección final visibles pero bloqueadas (`fieldset disabled`); solo se editan personal y equipos. Botón "Guardar".
- [ ] `CustomerServiceSection`: Cliente* (combobox "Buscar cliente...", bloqueado en edición), Servicio* (depende de cliente), Ítem* (depende de servicio), Sector del Cliente (Opcional), Área del Cliente (Opcional), Equipos del Cliente (multi, **máx. 2**).
- [ ] `JornadaSection`: Jornada* (combobox: Jornada 8 / 12 / 24 horas / Por horario).
- [ ] `EmployeeSection` (solo si el ítem `needs_personnel`; si no, texto "<ítem> no requiere personal."):
  - [ ] Jornada 8 h / por horario: Empleados (multi, "Buscar por legajo o nombre...", agrupado por puesto, `[legajo] Apellido Nombre`; requiere cliente). Chips de seleccionados; en naranja con aviso los no afectados al cliente.
  - [ ] Jornada 12 h: "Asignación de Personal — Jornada 12 Horas" + selector de turno Día/Noche (excluyentes, limpia el otro).
  - [ ] Jornada 12/24 h: Chofer de Día, Ayudantes de Día (opcional, multi), Chofer de Noche, Ayudantes de Noche (opcional, multi).
  - [ ] Botón "Seleccionar por característica" (ícono Users). ⚠️ Hoy solo hace `logger.info` (no abre nada): ver "Selectores de empleados/equipos".
- [ ] `EquipmentSection`: Equipos propios (multi, agrupado por tipo, marca no asignados al cliente y problemas de condición), Otros Equipos Operativos (multi; los ya guardados como chips con quitar), botón "Seleccionar por característica" (ícono Truck, mismo no-op). Si el ítem no requiere equipos se informa.
- [ ] `ScheduleSection`: Estado (solo edición; Ejecutado deshabilitado si la fila está sin recursos o el parte es futuro; Reprogramado; Cancelado; Pendiente y Sin recursos deshabilitados), Motivo de cancelación* (si cancelado), Fecha de reprogramación* (si reprogramado, ≥ hoy), Completado Día / Noche (checkbox; solo edición + pendiente + 24 h), Hora de inicio* / fin* (si "por horario"), Tipo de servicio (radio Mensual / Adicional / Adicional Permanente), Descripción, Motivo de reasignación (solo en edición si se quitaron/reemplazaron empleados o equipos).
- [ ] Validaciones Zod (`schema.ts`): cliente, servicio, ítem, jornada; horario si "por horario"; motivo si cancelado; fecha si reprogramado; ≥1 empleado o equipo si ejecutado; ≤2 equipos cliente.
- [ ] Envío (toast.promise): alta `createDailyReportRowPrisma`; edición `updateDailyReportRowPrisma`; edición a Reprogramado con fecha → `bulkUpdateRowStatus` (clona a la fecha destino sin recursos y marca la original). Invalida detalle, facets y desvíos.

### Dialog: Edición masiva por estado (`detail/components/BulkEditModal.tsx`)
- [ ] Toma una foto de las filas al abrir (no se vacía al limpiar la selección). Secciones independientes, cada una con su "Nuevo estado" y botón Guardar:
  - [ ] "Jornadas 24hs (n)": Ejecutado, Cancelado, Reprogramado, Completar Diurno, Completar Nocturno.
  - [ ] "Completar Diurno (n)" / "Completar Nocturno (n)": filas 24 h con un turno ya completo.
  - [ ] "Otras Jornadas (n) — <tipos>": Ejecutado, Cancelado, Reprogramado ("Las opciones de completar diurno/nocturno no aplican a este grupo.").
- [ ] Cancelado → motivo*; Reprogramado → fecha ≥ hoy* (aviso "La fecha debe ser hoy o posterior").
- [ ] Guardar sección → `bulkUpdateRowStatus` → toast "Se actualizó el estado de N registros a …"; la sección queda procesada (deshabilitada, flash 3 s); cierra solo cuando no quedan secciones pendientes.

### Dialog: Clonar registros (`detail/components/CloneRowsDialog.tsx` + `CloneRowsConflictView.tsx`, server `detail/clone.server.ts`, `lib/clone-conflicts.ts`)
- [ ] Título "Clonar registros del <fecha>" (todo) / "Clonar registros seleccionados" ("Se clonarán N registros…").
- [ ] Calendario múltiple (desde ayer) + chips de fechas elegidas (quitar con X); vacío: "Seleccioná una o más fechas en el calendario".
- [ ] Tipos de registros (solo modo todo): Mensuales / Adicionales / Adicionales permanentes, cada uno deshabilitado "(no hay)" si no existen.
- [ ] Recursos a trasladar: Personal ("Copia los empleados asignados…"), Equipos ("Copia los vehículos asignados…").
- [ ] "Ir a los registros clonados al finalizar": solo con una fecha ("Solo disponible al clonar a una sola fecha"); navega al parte destino.
- [ ] Botón "Clonar registros" ("Verificando..." / "Clonando..."). Validaciones con toast: al menos una fecha; al menos un tipo.
- [ ] Si hay duplicados → vista "Revisión de duplicados" agrupada por fecha: Volver a la selección / Excluir duplicados y clonar el resto / Clonar igualmente. Si no queda nada para clonar: toast warning.

### Dialog: Eliminar registro (`detail/components/DeleteRowDialog.tsx`)
- [ ] AlertDialog "Eliminar registro" con cliente y servicio de la fila. Confirmar → elimina; si la fila venía de un pedido: toast "Registro eliminado. El pedido PED-xxxx volvió a estado Pendiente.".

### Dialog: Detalle del Servicio (`detail/components/ServiceDetailDialog.tsx`)
- [ ] Solo lectura: "Pedido vinculado: PED-xxxx" (link a `?tab=preparte`), Cliente, Servicio, Ítem, Descripción del ítem, Sector, Área, Jornada, Turno, Horario inicio/fin, Estado, Tipo servicio, Nro Remito, Descripción, Empleados (n), Equipos (n), Equipos cliente, Completado Día/Noche. Vacío "No se encontró el registro.".

### Dialog: Historial de Cambios (`detail/components/HistoryDialog.tsx`, server `detail/history.server.ts`)
- [ ] Línea de tiempo de `dailyreportrows_history`: tipo (Creación / Actualización / Eliminación / Vinculación / Desvinculación), usuario o "El Sistema" ("Cambio realizado automáticamente"), fecha, motivo, recurso (Empleado / Vehículo con dominio y número interno), cambios campo a campo con "Ver detalles" / "Ocultar detalles". Skeleton propio. Vacío: "No hay registros de cambios para este ítem.".

---

## Selectores de empleados/equipos "por característica" — sin pantalla viva

- [ ] `detail/components/EmployeeSelector/` (`EmployeeSelectorDialog`, `_EmployeeSelectorDataTable`, `columns.tsx`, `actions.server.ts`) y `detail/components/EquipmentSelector/` (ídem).
- [ ] **No están montados en ningún lado**: nadie importa `EmployeeSelectorDialog`/`EquipmentSelectorDialog`; los botones "Seleccionar por característica" del Sheet de fila solo hacen `logger.info('... pendiente de implementación')`. Pendiente/bug previo → anotar en §9 del PLAN, no arreglar en silencio.
- [ ] Contenido actual (por si se conectan): Dialog "Seleccionar Empleados" (DataTable nuevo con lazy facets; columnas Legajo, Nombre, CUIL, Documento, Tipo de Documento, Sector, Puesto, Diagrama, Afectaciones, Aptitudes, Estado doc., Provincia, Genero, Nacionalidad, Estado afiliacion; búsqueda "Buscar por legajo o nombre..."; export "Seleccion de Empleados"; ya asignados con checkbox deshabilitado; botón "Guardar Seleccion (n)") y "Seleccionar Equipos" (Dominio, Nro Interno, Tipo, Sub Tipo, Tipo de Vehículo, Estado doc., Condición, Marca, Modelo, Año, Afectado a, Kilómetros, Chassis, Motor, Serie; búsqueda "Buscar por dominio o número interno..."; export "Seleccion de Equipos").

---

## Partes diarios en Comercial: remitos, historial y certificación — `/dashboard/comercial?tab=comerce&subtab=daily_reports`

> La pantalla vive en Comercial (`features/Comercial/Comerce/components/DailyReportWrapper.tsx`, con panel de filtros propio) pero la tabla y sus modales son código de `features/Operaciones`. Acá va lo de Operaciones; el panel de filtros va en la ficha de Comercial.

- [ ] Tabla: `Certificacion/components/EnhancedComercialReportTable.tsx` — **BaseDataTable viejo** (`tableId="enhanced-comercial-report-table"`, `toolbarOptions`, `savedVisibility={}`). **En uso** (Comercial → Comerce → subtab `daily_reports` → `app/dashboard/comercial/page.tsx`). Candidata a migración (Fase 5).
- [ ] Columnas: select (solo con `comercial:daily_reports:update`), Fecha, Cliente, Servicio, Ítem, Descripción Ítem, Equipo Cliente, Área, Sector, Tipo de Servicio, N° de Remito (badges por remito), Estado, Empleados, Equipo Empresa, Jornada, Descripción, Acciones.
- [ ] Filtros: los que pasa el wrapper (`filterableColumns`, incluye date-range); visibles iniciales cliente, servicio, ítem; búsqueda "Buscar en descripción...". Export Excel con `exportHeader`/`exportFormatter` (`export-formatters.ts`). Vacío: "No hay registros".
- [ ] Colores de fila: amarillo si creada post-cierre, azul si editada en comercial.
- [ ] Selección: solo filas `ejecutado` y con `update`. Acción masiva **Enviar a certificación** (CheckCircle2) → `BulkCertificacionModal` ("Actualización masiva a En certificación", Cancelar / Actualizar).
- [ ] Acciones por fila: Editar (`PermissionGuard comercial/daily_reports/update`; deshabilitado con tooltip "El parte esta abierto, debe editarse desde Operaciones") → `DailyReportRowFormRefactored`; Ver detalles (`PartesDiarios/components/ServiceDetailModal.tsx`); Ver historial (`PartesDiarios/components/HistoryModal.tsx`); Gestionar Remitos (`update`) → `RemitosManagerModal`.
- [ ] `remitManager/RemitosManagerModal`: "Gestión de Remitos"; vacío "No hay remitos registrados" con botón grande agregar; botones Agregar remito (Plus) y Vincular remito existente (Link2); una pestaña por remito (ícono distinto si está vinculado).
  - [ ] `AddRemitDialog` "Agregar Nuevo Remito": Número* (placeholder "Ej: 12345 o ABC-001", único). Botón deshabilitado si vacío.
  - [ ] `LinkRemitoDialog`: buscador "Buscar por número de remito..." (hasta 10 resultados / últimos 10 creados) + botón Vincular.
  - [ ] `RemitTab`: Eliminar / Desvincular (AlertDialog "¿Eliminar remito?" / "¿Desvincular remito?"), aviso "Atención:", "Subir nuevo documento" → `DocumentUploadArea` (PDF/JPG/PNG/WebP, máx. 10 MB); `DocumentViewer` por documento: Ver, Descargar, Eliminar.

---

## Notas

- [ ] `PartesDiarios/components/DatePicker.tsx`: lo usa `Employees/Diagrams/table/DiagramDetailTable.tsx` (fuera de Operaciones).
- [ ] `PartesDiarios/components/BulkStatusModal.tsx`: sin importadores (huérfano).
- [ ] `Certificacion/components/DailyReportRowFormRefactored.tsx` + `form-sections/*`: form de edición usado solo desde Comercial.
- [ ] Comportamientos previos a anotar en §9 (no cambiar en silencio): la exportación de la lista de partes usa los `searchParams` iniciales (no los filtros actuales; la tabla no está en client mode); botones "Seleccionar por característica" sin efecto; date pickers de "Crear parte diario" y del Sheet de pedido sin escritura directa.

<!-- estado: completo -->
