# Blueprint: rediseño de Mantenimiento (2026-10-15)

**Fuentes:**

- Mockup `.mockups/mantenimiento-standalone.html`, con las capturas `mant-*.png` y `mant-m-*.png`.
- Notas en `.mockups/mantenimiento-notes.md`.
- Referencia de cómo se hizo Operaciones: `.mockups/operaciones-blueprint.md`.

**Alcance:** UI y queries derivadas. Sin cambios de reglas de negocio, flujos, seguridad ni esquema Prisma. Sin tests y sin commits.

**Verificación común a todos los paquetes:**

- `npm run check-types` (sin lint ni format).
- Navegador a 1440 y 390 px: `document.documentElement.scrollWidth > clientWidth` tiene que dar `false`.
- Al final, `NODE_OPTIONS=--max-old-space-size=8192 npx next build`.

## 0. Decisiones que el usuario debe confirmar

**D-1. "Órdenes devueltas": no hay query para reusar.**

- `getReturnedTasks` (`ApprovalInbox/actions/actionsServer.ts:148-244`) trae **tareas** `work_order_item_repairs` en `reassignment_requested`, o sea, el bloque Reasignaciones.
- Una **orden devuelta** es otra cosa. `workshopChiefReturnOrder` (`MaintenanceOrders/actions/validations.server.ts:148-202`) la pasa de `pending_workshop_validation` a `in_workshop`, guarda `maintenance_orders.rejection_reason` y loguea `ACTIVITY_LOG.WORKSHOP_RETURNED_ORDER` (`:186`).
- Propuesta (derivada, sin esquema): `getReturnedOrders()` = órdenes `status='in_workshop'` cuyo último log de cambio de estado sea `workshop_returned_order`.
- A confirmar: ¿cuenta también `workshopChiefRejectItems` (`WORKSHOP_ITEM_REJECTED`, `:311`), que también devuelve la orden a `in_workshop`? Recomiendo **sí**, como "devuelta parcialmente".
- Es informativa: **no suma** al contador del paso Aprobaciones (esas órdenes ya cuentan en En Taller).

**D-2. N° de orden: el término y el caso vacío.**

- "N° Orden" se usa en 9 superficies: Seguimiento, En Taller (columna y filtro), Validación, Equipos ×2 y el export de tareas. "Nro. Pedido" solo en 4: Pendientes y Confirmados. **Gana "N° Orden".**
- Pero `order_number` (`OM-000001`) recién se genera al ingresar a taller (`PedidosMantenimiento/actions/actionsServer.ts:484-486`) o desde el wizard (`OrderManagement/actions/items.server.ts:327`). En Por Programar y Por Ingresar casi siempre es `null`.
- El mock QR5 ("Nro. Pedido PED-2026-0422" al crear) no puede darse. Ahí no se muestra número.
- Celda vacía propuesta: "Se asigna al ingresar", en muted. El export deja la celda vacía.

**D-3. Etiquetas de los dos rechazos.** Hoy `rejected` (el taller rechazó el pedido antes de programarlo, ticket 676) y `workshop_rejected` (se rechazaron todos los ítems en taller) se leen igual en Equipos: "Rechazada por Taller". Propuesta:

- `workshop_rejected` → **"Rechazada por Taller"**.
- `rejected` → **"Rechazada"**.
- `operations_rejected` → "Rechazada por Ops", como en el mock.

**D-4. El contador de Aprobaciones ya no coincide con la bandeja.**

- `getTallerPipelineCounts` filtra por supervisor (`TallerPipeline/actions/pipeline-counts.server.ts:34-39, 70-96`).
- Las tres queries de la bandeja no filtran (`actionsServer.ts:55, 158, 264`).
- La regla "el contador es la cifra de la tabla" choca con "respetar el supervisor".
- Recomendación: armar cada contador con el **mismo `where` que su lista**. En Aprobaciones eso es sin filtro de supervisor, como hoy la bandeja. Cambia la cifra que ve un supervisor sin `view_all_requests`.

**D-5. Pedido rechazado por el taller que desaparece de Seguimiento.** No cambia el flujo en ningún caso. Opciones:

- **(A, recomendada)** `rejected` como opción solo de filtro, igual que "Completada": se agrega a `WORKSHOP_TRACKING_STATUSES` y **no** a `DEFAULT_TRACKING_STATUSES`, así que el contador no cambia. Más una banda de Atención en Seguimiento: "N pedidos rechazados por el taller en los últimos 7 días", con botón "Ver rechazados" que filtra Estado = Rechazada.
  - La ventana de 7 días es una constante nueva (`recentRejectionDays`) que el usuario no pidió: confirmar.
- (B) Solo la banda, con link al historial del equipo.
- No confundir con el ejemplo del mock, que es `workshop_rejected` y ya aparece en Seguimiento.

**D-6. Sub-navegación con contadores.** El mock la dibuja, pero `SectionManagerServer` (`src/features/TabsManager/SectionManagerServer.tsx:5-19`) quitó la barra a propósito, por rendimiento y porque el sidebar ya navega. Los 9 módulos lo usan.

- (A) Sin subnav: el sidebar navega y los contadores viven en los pasos del pipeline. Cero riesgo.
- **(B, recomendada porque el mock está aprobado)** Prop opt-in `sectionNav?: boolean` (default `false`), activada solo en Mantenimiento:
  - Una lista de `<Link href="?tab=…">`. Las secciones inactivas no renderizan su contenido.
  - Cada contador se streamea en su propio `<Suspense fallback={null}>` con funciones de conteo envueltas en `React.cache`, así la sección activa no repite la query.
  - Costo: unos 8 `count` en paralelo por carga. En Taller es la suma de los 4 pasos; en Operaciones, solo Validar; en Equipos con Desvíos, la cantidad de equipos.

## 1. Patrones y hallazgos del código actual

**Shell y pipeline**

- `MantenimientoComponent.tsx` usa `SectionManagerServer`, que renderiza solo la sección activa.
- Los pipelines están en `Pipeline/{Operaciones,Taller}Pipeline/*PipelineContent.tsx`, con `PARAM_NAME` `op_step` y `taller_step`. Cada paso exige `mantenimiento:<permissionTab>:view`.
- `Pipeline/components/PipelineLayout.tsx` (cliente) monta todos los pasos y oculta los inactivos con `hidden`. Cambia la URL con `replaceState` y limpia params de tablas.
- Contadores (`*/actions/pipeline-counts.server.ts`): ante un error devuelven **0**. El mock pide "—".

**Estados: mapas duplicados**

- `lib/order-status.ts` tiene la máquina de estados (pura, con tests). No se toca.
- Mapas de etiquetas y tonos que hoy compiten:
  - `MaintenanceOrders/table/columns.tsx:38-51` (`statusLabels` / `statusVariants`, que importa `activity-config.ts:1`).
  - `WorkshopTracking/workshopTrackingColumns.tsx:47-59` (`WORKSHOP_STATUS_CONFIG`, que importa `OrderDetailDialog.tsx:20`).
  - `WorkshopView/WorkshopSectorTasksTable/work-order-status.ts:31-48`: `MO_STATUS_CONFIG` está incompleto (falta `pending_workshop_validation`). **El PDF lo usa** (`pdf/report-data.ts:43,550,573`), así que hoy muestra estados en crudo.
  - `shared/work-order-types.ts:127-174`: OT, prioridad e ítem/reparación.
  - `components/ActivityHistory/activity-config.ts:11-35`: une tres mapas con spread, y `rejected` / `pending_approval` / `completed` se pisan entre entidades.
  - `SolicitudesMantenimiento/tableColumns.tsx:18-62`.
  - `PedidosMantenimiento/Pendientes/columns.tsx:18-47` y `_PendingOrderDataTable.tsx:40`.
  - `PedidosMantenimiento/components/PedidoDetailDialog.tsx:31-34`.
  - `SolicitudesMantenimiento/components/SolicitudDetailDialog.tsx:35`.
  - `MaintenanceOrders/components/SectorCard.tsx:61` y `order-detail/types.ts`.
  - `OperatorPanel/lib/work-order-status.ts` y `OperatorPanel/components/WorkOrderDetail/TaskCard.tsx:182` ("Pend. Aprobacion" literal).
  - `NuevoPedido/components/nuevo-pedido/StepConfirm.tsx:237`.
  - En Equipos: `Equipos/EquipoID/lib/order-status.ts`, `Equipos/OtherEquipment/maintenance/columns.tsx:25-33` y `OtherEquipmentMaintenanceTable.tsx:46-52` (filtro), y `Equipos/EquipoID/components/equipment-order-detail/order-detail-model.ts:48`.
- **El mejor precedente es `Equipos/EquipoID/lib/order-status.ts`**: un solo mapa con etiqueta, variante e ícono. Se generaliza.

**Perímetro reutilizable**

- `PedidosMantenimiento/lib/order-list-shared.ts`: `resolveOrderListScope(companyId)` + `scopeConditions(scope)` + `assembleOrdersWhere`. Cubre empresa, tipos ocultos (ticket 690) y supervisor, todo dentro de un `AND`.
- Lo usan Pendientes, Confirmados y Seguimiento (`WorkshopTracking/actions.server.ts:168-197`).

**Tablas**

- `DataTable` con `queryFn`, `paramNamespace=tableId`, facets lazy y `mobileCards` (`DataTable.tsx:93-103`: las celdas 1 y 2 ocupan todo el ancho y la última va a la derecha).
- tableIds actuales: `maintenance-requests`, `workshop-tracking`, `pedidos-pendientes`, `pedidos-confirmados`, `maintenance-orders`, `approval-validation-orders`, `equipments-with-deviations`, `workshop-sector-work-orders-<id>`, `tires-catalog`, `tire-service-orders`, `tire-brands`, `tire-types`, `tire-templates`.

**React Query**

- `utils/queryInvalidation.ts` invalida el prefijo `['maintenance']` y las keys `*-paginated`.
- Keys clave:
  - Detalle: `['maintenance','order-detail',id]` y `['maintenance','validation-history',id]`.
  - Bandeja: `['maintenance','approval-inbox',…]`.
  - Historial: `['maintenance-order-full-activity-log',…]`.
  - Tablas: `['maintenance-orders','pending-paginated']`, `['maintenance-orders','confirmed-paginated']`, `['maintenance-orders-paginated']`, `['workshop-tracking-paginated']`.

**Detalle de orden**

- `MaintenanceOrders/components/OrderDetailDialog.tsx` (990 líneas, `Dialog max-w-4xl`). Props: `orderId`, `order`, `open`, `onClose`, `onLoaded`, `context: 'workshop' | 'operations'`.
- Tres consumidores: `_MaintenanceOrderDataTable.tsx:347`, `_ValidationOrdersDataTable.tsx:265` y `_WorkshopTrackingDataTable.tsx:268`.
- Encadena `AlertDialog`s (rechazar ítems, devolver) y abre `ActivityHistoryModal` encima.
- `getMaintenanceOrderDetail` ya trae todos los timestamps de la barra de etapas: `created_at`, `scheduled_at`, `workshop_entry_date`, `workshop_validated_at`, `maintenance_requests.created_at` y `rejected_at`. **No hace falta tocar el select.**

**`SectorTimeline` no se puede borrar**: lo usa Equipos (`equipment-order-detail-dialog.tsx:8`, `ReadonlySectorCard.tsx:7`, `order-detail-model.ts:4`).

**Componentes compartidos**

- Ya existen: `src/shared/components/common/{SectionCard,SplitLayout,MetricCard,StateBlock,RecordHeader,FieldGrid}.tsx`, `DataTable/useDataTableFilter.ts` y `components/ui/badge.tsx` (variantes `success|warning|yellow|info|pending|cert|expired|destructive|default|secondary`, todas con tokens).
- `Timeline`, `StackedCell` y `SegmentedProgress` viven en `src/features/Operaciones/shared/components/`.
- No hay ningún ErrorBoundary en el repo.

**Fuera de alcance, para reportar**

- `WorkshopView/actions.server.ts:27` (`getWorkshopSectorsWithCounts`) es un `'use server'` exportado **sin chequeo de permiso ni filtro de empresa** (el comentario dice "decisión de negocio"). No se toca.
- Las páginas del manual (`src/content/manual/mantenimiento/taller.mdx:43,128,241-248`, `procesos/del-checklist-al-taller.mdx:73-77`, `equipos/ficha-del-vehiculo.mdx:95`, `campo/panel-del-operario.mdx:133`) citan las etiquetas viejas. Se actualizan aparte si el usuario lo pide.

## 2. Arquitectura (decisiones tomadas)

1. **Una fuente de verdad de estados, separada por entidad:** `src/features/Mantenimiento/lib/status-presentation.ts`.
   - Sin directiva, para que la consuman el servidor, el cliente y el PDF. Importa íconos de lucide; ya hay precedente en `work-order-status.ts`.
   - Los mapas viejos pasan a **re-exportar o derivar** de esta fuente en la Etapa 0, así los consumidores siguen compilando.
2. **Detalle de orden en `Sheet`** sin cambiar las props de `OrderDetailDialog`: se reemplaza el `Dialog` por un `Sheet side="right"` (`w-full sm:max-w-[920px]`) dentro del mismo archivo.
   - Los 3 consumidores no cambian y se conserva la key `['maintenance','order-detail',id]`.
   - El historial va **inline** (últimos 6 eventos más "Ver todo", que expande en el mismo panel). No se abre un dialog encima.
   - Confirmar el rechazo de ítems o la devolución sigue en `AlertDialog`: es confirmación, no navegación.
3. **Contadores y Atención en cliente con React Query + `initialData` del servidor:**
   - Pipelines: `['maintenance','pipeline','operaciones' | 'taller']`.
   - Métricas: `['maintenance','metrics',<paso>]`.
   - `invalidateAllMaintenanceQueries` ya invalida `['maintenance']`, así que después de cada mutación se refrescan solos, sin tocar las mutaciones.
   - **Sin `'use cache'`** en estas queries nuevas: los contadores actuales no lo usan y se desincronizarían de las listas. La excepción es el agregado de desvíos, que ya está cacheado.
4. **Filtro virtual `attention`** para que las métricas "Más de 48 h / 7 días / 14 días / Sin OTs / Trabadas / Fecha pasada / Fecha rechazada / Con críticos" filtren la tabla con la **misma** condición que las cuenta.
   - Se agrega `attention` a la `ALLOWED_FILTERS` de cada lista. El `where` del listado y el de la métrica comparten el helper de condición.
   - La métrica escribe `useDataTableFilter(tableId,'attention')`.
   - Un filtro de rango por día no sirve, porque 48 h no son "2 días".
5. **Claves de preferencias nuevas** (`tableId` con sufijo `-v2`, `paramNamespace` sin cambios), como en Operaciones. Las preferencias guardadas ganan sobre las columnas ocultas por defecto, y las columnas atómicas quedan ocultas, no borradas.
6. **Columnas compuestas solo de presentación** (`excludeFromExport: true`, `enableSorting: false`). La primera celda es un `<button type="button">` que abre el detalle. Las acciones de fila van en un menú ⋯ con `aria-label`.
7. **Progreso por sector, dos opciones:**
   - **(A, elegida)** Chips de recorrido `SectorRoute` en orden de ejecución, con estado por sector, más la barra de % actual (`role="progressbar"`). Es lo que aprobó el mock y reemplaza las columnas "Sector Actual" + "Progreso".
   - (B) Una barra segmentada por sector, más compacta pero sin nombres.

## 3. Etapa 0 (secuencial, 1 agente general-purpose)

### 0.1 `src/features/Mantenimiento/lib/status-presentation.ts` (crear)

```ts
export type StatusTone = 'neutral' | 'pending' | 'warn' | 'brand' | 'info' | 'ok' | 'danger';
export interface StatusUi {
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
}
export const TONE_TO_BADGE: Record<StatusTone, BadgeVariant> = {
  neutral: 'secondary',
  pending: 'pending',
  warn: 'warning',
  brand: 'default',
  info: 'info',
  ok: 'success',
  danger: 'destructive',
};
export const ORDER_STATUS_UI: Record<MaintenanceOrderStatus, StatusUi>; // claves de lib/order-status.ts
export const REQUEST_STATUS_UI: Record<'pending_approval' | 'approved' | 'rejected', StatusUi>;
export const WORK_ORDER_STATUS_UI: Record<work_order_status | 'blocked', StatusUi>; // 'blocked' = presentación (OperatorPanel/actions/blocking.ts)
export const REPAIR_STATUS_UI: Record<work_order_item_status, StatusUi>;
export const ORDER_STATUS_FILTER_ORDER: readonly MaintenanceOrderStatus[]; // orden del circuito para filtros
export type StatusEntity = 'order' | 'request' | 'workOrder' | 'repair';
export function getStatusUi(entity: StatusEntity, status: string | null | undefined): StatusUi; // desconocido → {label: status, tone:'neutral'}; null → 'Sin estado'
export const getStatusLabel = (entity: StatusEntity, s: string | null | undefined) => getStatusUi(entity, s).label;
export const LEGACY_HISTORY_LABELS = { date_rejected: 'Fecha Rechazada', scheduled: 'Programada' }; // estados históricos de log
```

**Etiquetas oficiales** (las del usuario y del mock, más D-3):

| Entidad   | Estado                          | Etiqueta                     | Tono    |
| --------- | ------------------------------- | ---------------------------- | ------- |
| Orden     | `pending_scheduling`            | Pend. Programación           | warn    |
| Orden     | `date_confirmed`                | Fecha Confirmada             | pending |
| Orden     | `scheduled`                     | Programada                   | info    |
| Orden     | `in_workshop`                   | En Taller                    | brand   |
| Orden     | `pending_workshop_validation`   | Pend. Validación Taller      | warn    |
| Orden     | `pending_operations_validation` | Pend. Validación Operaciones | warn    |
| Orden     | `operations_rejected`           | Rechazada por Ops            | danger  |
| Orden     | `workshop_rejected`             | Rechazada por Taller         | danger  |
| Orden     | `rejected`                      | Rechazada                    | danger  |
| Orden     | `completed`                     | Completada                   | ok      |
| Solicitud | `pending_approval`              | Pendiente de Aprobación      | warn    |
| Solicitud | `approved`                      | Aprobada                     | ok      |
| Solicitud | `rejected`                      | Rechazada                    | danger  |
| OT        | `pending`                       | Pendiente                    | pending |
| OT        | `in_progress`                   | En Progreso                  | brand   |
| OT        | `paused`                        | Pausada                      | warn    |
| OT        | `completed`                     | Completada                   | ok      |
| OT        | `completed_partial`             | Completada Parcial           | warn    |
| OT        | `cancelled`                     | Cancelada                    | danger  |
| OT        | `blocked`                       | Bloqueada                    | pending |
| Tarea     | `pending`                       | Pendiente                    | pending |
| Tarea     | `in_progress`                   | En Progreso                  | brand   |
| Tarea     | `completed`                     | Completado                   | ok      |
| Tarea     | `cancelled`                     | Cancelado                    | neutral |
| Tarea     | `pending_approval`              | Pend. Aprobación             | warn    |
| Tarea     | `reassignment_requested`        | Devuelto                     | danger  |
| Tarea     | `rejected`                      | Rechazado                    | danger  |

Íconos: los de `Equipos/EquipoID/lib/order-status.ts:77-88` para órdenes; Clock / PlayCircle / Pause / CheckCircle2 / Ban para OT.

**Convertir en derivados** (mismas exportaciones y tipos, valores tomados de la fuente; nada más en esos archivos):

- `MaintenanceOrders/table/columns.tsx`: solo `statusLabels` y `statusVariants`.
- `WorkshopTracking/workshopTrackingColumns.tsx`: solo `WORKSHOP_STATUS_CONFIG`.
- `WorkshopView/WorkshopSectorTasksTable/work-order-status.ts`: `MO_STATUS_CONFIG` y `WO_STATUS_CONFIG` completos. Esto arregla el PDF.
- `shared/work-order-types.ts`: `WORK_ORDER_STATUS_LABELS`, `WORK_ORDER_STATUS_VARIANTS` y `WORK_ORDER_ITEM_STATUS_LABELS`.
- `components/ActivityHistory/activity-config.ts`: `getStatusLabel(status, entity?)` sin spread. Por defecto `'order'`, y cae a solicitud, OT, tarea y legacy. El llamador pasa la entidad según la columna del log (`maintenance_order_id`, `work_order_id` o `maintenance_request_id`). Mantener la firma vieja compatible.
- `Equipos/EquipoID/lib/order-status.ts`: re-exporta etiquetas, variantes e íconos de la fuente.
- `Equipos/OtherEquipment/maintenance/columns.tsx` (mapa de estado) y `OtherEquipmentMaintenanceTable.tsx` (opciones del filtro).
- `Equipos/EquipoID/components/equipment-order-detail/order-detail-model.ts`: etiquetas de tarea.
- `SolicitudesMantenimiento/tableColumns.tsx`: solo los mapas `REQUEST_*`, `ORDER_*` y `STATUS_ICONS`.
- `PedidosMantenimiento/Pendientes/columns.tsx`: solo los mapas de las líneas 18-47.
- `MaintenanceOrders/components/SectorCard.tsx`: solo `statusLabels` y `statusBadgeVariants`.
- `MaintenanceOrders/components/order-detail/types.ts`: solo `itemStatusLabels` y `itemStatusVariants`.
- `OperatorPanel/lib/work-order-status.ts`.

Los literales sueltos (`TaskCard.tsx:182`, `StepConfirm.tsx:237`, `PedidoDetailDialog.tsx:31-34`, `SolicitudDetailDialog.tsx:35`, `_PendingOrderDataTable.tsx:40`) los resuelve el paquete dueño de cada archivo en la Etapa 1.

### 0.2 Componentes compartidos

**Mover** `src/features/Operaciones/shared/components/{Timeline,StackedCell,SegmentedProgress}.tsx` a `src/shared/components/common/`. En la ruta vieja queda un archivo de una línea con `export * from '@/shared/components/common/X'`, así Operaciones no se toca.

**Crear `src/shared/components/common/SectionErrorBoundary.tsx`** (cliente, componente de clase):

- Props: `{ title: string; description?: string; children; onRetry?: () => void }`.
- Ante un error muestra `<StateBlock variant="error">` con "Reintentar", que hace `reset()` y `router.refresh()`.
- Envuelve cada paso del pipeline: un error en un paso no rompe los demás.

**Crear en `src/features/Mantenimiento/shared/components/`:**

| Archivo                       | Props y comportamiento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PipelineSteps.tsx` (cliente) | `{ steps: PipelineStep[]; counts: Record<string, number \| null>; attention?: Record<string, string \| null>; activeStep: string; onStepClick(id) }`. Lista (`role="list"`) de `<button type="button" aria-current="step">` con número, nombre, descripción, contador mono `tabular-nums` (si es `null` muestra "—" y `aria-label` "sin datos") y badge de atención con ícono y texto. 4 columnas, `max-xl` 2×2, `max-md` 2 columnas sin descripción. Tokens `bg-brand-subtle`, `border-brand`, `bg-danger-subtle text-danger-subtle-foreground`. |
| `AttentionBanner.tsx`         | `{ tone: 'warn' \| 'danger' \| 'info' \| 'ok'; title: ReactNode; description?: ReactNode; actions?: ReactNode }`. `role="note"` (`"status"` si es dinámico). Si no hay nada, no se renderiza: no existe banda vacía. Botones `type="button"`, que bajan a una fila nueva en móvil.                                                                                                                                                                                                                                                                |
| `MaintenanceStatusPill.tsx`   | `{ entity: StatusEntity; status: string \| null; size?: 'sm' \| 'md' }`. `Badge variant={TONE_TO_BADGE[tone]}` con ícono `aria-hidden` y texto. Nunca solo color.                                                                                                                                                                                                                                                                                                                                                                                 |
| `ResourceCell.tsx`            | `{ resource: { kind: 'vehicle' \| 'equipment'; identifier: string; internNumber?: string \| null; subtitle?: string \| null } }`. Vehículo: patente mono con borde sólido `border-foreground`. Equipamiento: borde punteado `border-dashed border-muted-foreground`. Abajo, "N° interno · subtipo" truncado con `title`. Se arma con `getResourceLabel`, `getResourceInternNumber` y `getResourceKindLabel` de `shared/maintenance-resource.ts`.                                                                                                  |
| `SectorRoute.tsx`             | `{ sectors: SectorRouteStep[]; emptyLabel?: string }`, con `SectorRouteStep = { id; name; state: 'done' \| 'running' \| 'stuck' \| 'pending' \| 'rejected' }`. Chips ordenados con separador `›` `aria-hidden`; el texto del estado va en `sr-only` y en `title`. Vacío: "Sin OTs generadas" (pill warn) o "Sin programar".                                                                                                                                                                                                                       |
| `StageBar.tsx`                | `{ stages: { key; label; meta?: string; state: 'done' \| 'current' \| 'pending' }[] }`. `<ol aria-label="Recorrido de la orden">` de 6 columnas, 3 en móvil.                                                                                                                                                                                                                                                                                                                                                                                      |
| `RelativeAge.tsx`             | `{ value: Date \| string; thresholdDays?: number; thresholdHours?: number; unit?: 'since' \| 'until' }`. Fecha DD/MM/YYYY (`formatArgentinaDay`) más "hace N días" / "hoy" / "en N días". Pasado el umbral, `text-danger-subtle-foreground font-semibold`.                                                                                                                                                                                                                                                                                        |
| `SectorCapacityCard.tsx`      | `{ sector: WorkshopSectorWithCount; pressed: boolean; onSelect(): void }`. `<button aria-pressed>` con cupos "N de M cupos ocupados" (`aria-label`), pill "Completo" / "N libres" / "Sin cupo configurado" si `maxCapacity` es `null`, y pendientes / en progreso / pausadas.                                                                                                                                                                                                                                                                     |

**Crear `src/features/Mantenimiento/lib/sector-route.ts`** (puro):

- `buildSectorRoute(items)` agrupa por `assigned_sector_id` y ordena por `sector_sequence_order`, la misma regla que `MaintenanceOrders/utils/currentSector.ts`.
- Estado por sector a partir de las reparaciones de sus ítems:
  - `stuck` si alguna está en `pending_approval` o `reassignment_requested`.
  - `done` si todas las activas están completadas.
  - `running` si hay alguna `in_progress` o `completed`.
  - `rejected` si todos los ítems del sector están `is_rejected`.
  - `pending` en cualquier otro caso.
- Reemplaza a `getSectorStatus` de `workshopTrackingColumns.tsx:73-86` (lo hace el paquete P2).

**Crear `src/features/Mantenimiento/lib/order-stages.ts`** (puro): `buildOrderStages(order)`.

- Solicitud: `maintenance_requests.created_at`.
- Aprobada: `order.created_at`.
- Programada: `scheduled_at`.
- Ingreso: `workshop_entry_date`.
- En taller: días desde el ingreso hasta `workshop_validated_at` o hoy.
- Validación: `pending_workshop_validation` es la etapa actual; `completed` es hecha.
- Si la orden está `rejected` o `workshop_rejected`, la etapa actual se marca `rejected`.

### 0.3 `src/features/Mantenimiento/lib/attention-thresholds.ts` (crear, sin directiva)

```ts
export const ATTENTION_THRESHOLDS = {
  requestPendingHours: 48, // solicitudes sin validar
  schedulingPendingDays: 7, // pedidos por programar (desde created_at = "Fecha Aprobación")
  inWorkshopDays: 14, // desde workshop_entry_date
  deviationsWithoutRequestDays: 30, // desvío pendiente más viejo del equipo
  recentRejectionDays: 7, // D-5, a confirmar
} as const;
export function hoursAgo(h: number, now = new Date()): Date;
export function daysAgo(d: number, now = new Date()): Date;
/** Para columnas @db.Date: hoy argentino como medianoche UTC. Usa argentinaDate() de Jobs/lib/dates.ts. */
export function argentinaTodayAsUtcDate(): Date;
export type AttentionKey =
  | 'overdue'
  | 'critical'
  | 'preventive'
  | 'date_rejected'
  | 'past_date'
  | 'no_work_orders'
  | 'stuck'
  | 'returned';
```

Sin umbral de profundidad de cubierta. "Bajo mínimo" sale del mock.

### 0.4 Pipeline

- `Pipeline/types/index.ts`: `PipelineCounts = Record<string, number | null>`; nuevo `PipelineSummary = { counts: PipelineCounts; attention: Record<string, string | null> }`.
- `Pipeline/components/PipelineLayout.tsx`:
  - Usa `PipelineSteps` en lugar de `WorkflowPipelineChevrons`.
  - Nueva prop `summaryQuery: { queryKey: readonly unknown[]; queryFn: () => Promise<PipelineSummary>; initialData: PipelineSummary }`, que se pasa a `useQuery` con `staleTime` de 30 s.
  - Envuelve cada `stepContent` en `SectionErrorBoundary`.
  - Se mantiene la lógica de URL, `replaceState` y show/hide.
- `WorkflowPipeline*.tsx` se borran en la Etapa 2.

## 4. Inventario pantalla → archivo (Etapa 1, paquetes paralelos)

Notación: **M** = modificar, **C** = crear, **B** = borrar después de verificar con grep. Cada archivo tiene un solo dueño.

### P1. Operaciones · Validar Solicitud (`ops`) y pipeline de Operaciones. Agente: **table-expert**

**Archivos que posee**

- **M** `Pipeline/OperacionesPipeline/OperacionesPipelineContent.tsx`: pasa `summaryQuery`; "Sin acceso" con `StateBlock noperm` y el texto actual.
- **M** `Pipeline/OperacionesPipeline/actions/pipeline-counts.server.ts`: pasa a `getOperacionesPipelineSummary(): Promise<PipelineSummary>` con `Promise.allSettled`.
  - Un contador que falla queda `null` y se loguea.
  - `attention.validate` = "N con más de 48 h".
  - `attention.in_workshop` = "N rechazada(s) por taller" (`workshop_rejected`).
  - Se conserva el export viejo `getOperacionesPipelineCounts` como wrapper si algo lo importa (verificar con grep).
- **M** `Pipeline/OperacionesPipeline/fallback/OperacionesPipelineSkeleton.tsx`.
- **M** `SolicitudesMantenimiento/{SolicitudesMantenimientoTabContent.tsx, MaintenanceRequestList.tsx, _MaintenanceRequestDataTable.tsx, tableColumns.tsx, actions/actionsTableServer.ts, fallback/SolicitudesTableSkeleton.tsx, components/SolicitudDetailDialog.tsx}`.
- **C** `SolicitudesMantenimiento/actions/metrics.server.ts` y `SolicitudesMantenimiento/components/RequestMetrics.tsx`.

**Entrega**

- Banda de Atención: "N solicitudes esperan hace más de 48 h", con botón "Ver solo esas".
- 4 métricas: Pendientes (warn), Con desvíos críticos (danger), Más de 48 h, Preventivos (brand).
- Columnas compuestas: Equipo (`ResourceCell`), Fecha Solicitud + `RelativeAge` (48 h), Desvíos + "N crítico(s)".
- Legajo antes del nombre en Chofer y Supervisor (`[legajo] Apellido Nombre`).
- Estado con `MaintenanceStatusPill`. Cuando la solicitud está aprobada y se muestra el estado de la orden, va con `entity="order"`.
- Acción primaria "Validar" (`maintenance_requests:update`) más ⋯ (Ver detalle, Historial, Rechazar, Reasignar supervisor).
- `mobileCards`; `tableId` `maintenance-requests-v2`, `paramNamespace` `maintenance-requests`.
- El placeholder se conserva.

### P2. Operaciones · Seguimiento (`seg`). Agente: **table-expert**

**Archivos que posee**

- **M** `WorkshopTracking/{WorkshopTrackingTabContent.tsx, WorkshopTrackingList.tsx, _WorkshopTrackingDataTable.tsx, workshopTrackingColumns.tsx (todo menos el mapa convertido en E0), actions.server.ts, statuses.ts (D-5A), fallback/WorkshopTrackingSkeleton.tsx}`.
- **C** `WorkshopTracking/actions/metrics.server.ts` y `WorkshopTracking/components/TrackingMetrics.tsx`.

**Entrega**

- 5 métricas, una por estado de `DEFAULT_TRACKING_STATUSES` salvo `completed` y `operations_rejected` cuando dan cero:
  - Pend. Programación (warn), Fecha Confirmada, En Taller (brand), Pend. Validación Taller (warn), Rechazada por Taller (danger).
  - Al hacer clic, filtran `status` vía `useDataTableFilter('workshop-tracking','status')`.
- Banda de Atención con las `workshop_rejected` (hasta 3 con N° y equipo, botón "Ver pedido" que abre el panel) y, con D-5A, la de rechazados recientes.
- Columnas:
  - N° Orden compuesta (N° más descripción; si no hay N°, "Se asigna al ingresar").
  - Equipo.
  - Estado.
  - Fecha Planificada, con la marca "pasó sin ingreso" si `date_confirmed` y la fecha ya pasó.
  - Ingreso.
  - Días en Taller (danger pasados los 14).
  - Recorrido Sectores (`SectorRoute` + `buildSectorRoute`).
  - Progreso con barra.
- `tableId` `workshop-tracking-v2`.

### P3. Taller · Por Programar (`prog`) y Por Ingresar (`ing`), más el pipeline de Taller. Agente: **table-expert**

**Archivos que posee**

- **M** `Pipeline/TallerPipeline/{TallerPipelineContent.tsx, actions/pipeline-counts.server.ts, fallback/TallerPipelineSkeleton.tsx}`.
  - Nuevo `getTallerPipelineSummary()`. Aprobaciones según D-4.
  - Atención: schedule = "N esperan +7 días", confirmed = "N con fecha pasada", in_workshop = "N sin OTs generadas".
- **M** `PedidosMantenimiento/Pendientes/{PendientesTabContent.tsx, PendingOrderList.tsx, columns.tsx (salvo los mapas de E0), components/_PendingOrderDataTable.tsx, actions.server.ts}`.
- **M** `PedidosMantenimiento/Confirmados/{ConfirmadosTabContent.tsx, ConfirmedOrderList.tsx, columns.tsx, components/_ConfirmedOrderDataTable.tsx, actions.server.ts}`.
- **M** `PedidosMantenimiento/lib/order-list-shared.ts`: agregar helpers de condición de atención, ver §5.
- **M** `PedidosMantenimiento/fallback/PendientesTableSkeleton.tsx`.
- **C** `PedidosMantenimiento/actions/metrics.server.ts` y `PedidosMantenimiento/components/{PendingOrderMetrics.tsx, ConfirmedAttention.tsx}`.

**Entrega Por Programar**

- Banda: "N pedidos esperan fecha hace más de 7 días".
- 4 métricas: Por programar, Más de 7 días, Fecha rechazada, Preventivos.
- Columnas: Equipo, N° Orden (compuesta con la descripción), Estado (si `date_rejected_at` existe, pill "Fecha Rechazada" con el motivo truncado), Items, Origen, Fecha Aprobación + `RelativeAge` (7 días).
- Acciones: "Planificar" y "Rechazar", las dos con `PermissionGuard pedidos_pendientes:update` (ya están protegidas). Sin `update` queda solo "Ver".
- Cambiar los colores fijos `text-blue-600` / `text-purple-600` por tokens.

**Entrega Por Ingresar**

- Banda por cada `scheduled_date < hoy AR`: "Registrá el ingreso". **Sin "Reprogramar"**: `date_confirmed → date_confirmed` no es una transición válida (`lib/order-status.ts:29`) y sería un flujo nuevo.
- Columnas: Equipo, N° Orden, Fecha Planificada (`moment.utc`) + "hace / en N días", Items, Condición Actual.
- "Registrar ingreso" con `PermissionGuard pedidos_confirmados:update`. **Hoy no está protegido** (`Confirmados/columns.tsx:303`).
- Renombrar "Nro. Pedido" a "N° Orden" en columnas, filtros, export y placeholders: "Buscar por dominio, serie, N° interno o N° de orden…".
- `tableId` `pedidos-pendientes-v2` y `pedidos-confirmados-v2`.

### P4. Taller · En Taller (`taller`). Agente: **table-expert**

**Archivos que posee**

- **M** `MaintenanceOrders/{MaintenanceOrdersTabContent.tsx, table/**}`. En `columns.tsx`, todo menos los mapas de E0. En `table/lib/order-select.ts`, solo agregar `is_rejected: true` en los ítems (select liviano, para el estado `rejected` del recorrido).
- **M** `MaintenanceOrders/components/RequestedItemsDialog.tsx`: solo estilos.
- **M** `MaintenanceOrders/fallback/MaintenanceOrdersSkeleton.tsx`.
- **C** `MaintenanceOrders/table/actions/metrics.server.ts` (o `table/lib/metrics.ts` + action) y `MaintenanceOrders/components/InWorkshopMetrics.tsx`.

**Entrega**

- Banda: "<dominio> ingresó <hoy | hace N días> y todavía no tiene OTs", con "Gestionar orden".
- 4 métricas: En taller (brand), Sin OTs generadas (warn), Con tareas trabadas (warn), Más de 14 días (danger).
- Columnas: N° Orden compuesta, Equipo, Ingreso a Taller + "N días en taller", Recorrido Sectores (con el aviso "Tarea pendiente de autorización" o "Tarea devuelta para reasignar"), Progreso, Necesidades.
- Columna oculta "Sector Actual", que se mantiene para el filtro existente.
- "Gestionar" con `PermissionGuard gestion_ordenes:update`. **Hoy está sin proteger** (`table/columns.tsx:280-285`).
- `tableId` `maintenance-orders-v2`. Export y `_ExportTasksButton` sin cambios funcionales.

### P5. Detalle de orden en panel lateral (`det`, `detval`). Agente: **general-purpose**

**Archivos que posee**

- **M** `MaintenanceOrders/components/{OrderDetailDialog.tsx, SectorCard.tsx (salvo los mapas de E0), ExternalWorkshopCard.tsx, order-detail/*}`. En `order-detail/types.ts`, salvo los mapas.
- **M** `components/ActivityHistoryModal.tsx` + `components/ActivityHistory/*` (salvo `activity-config.ts`, que es de E0): agregar el modo inline `variant?: 'dialog' | 'inline'` y `limit?: number`, con default `'dialog'` para no romper a los 7 consumidores.
- **M** `PedidosMantenimiento/components/PedidoDetailDialog.tsx`: pasa a `Sheet` con la misma API.
- **No tocar** `SectorTimeline.tsx` ni la API de `ActivityHistoryModal` para Equipos.

**Entrega**

- `Sheet` de 920 px.
  - Cabecera: patente con `ResourceCell` grande, N° Orden + descripción, interno / tipo / origen, `MaintenanceStatusPill` y condición del recurso.
  - `StageBar` armado con `buildOrderStages`.
  - Datos clave: ingreso, km, horómetro, días en taller.
  - "Sectores · orden de ejecución": una tarjeta `SectorCard` por sector con la OT, su estado, una barra `done/total` y las tareas. Se marcan Diagnóstico obligatorio, "Pend. Aprobación", "Devuelto" y "Agregado por operador".
  - Materiales (`OrderMaterialsSection`).
  - Historial inline (6 eventos) con "Ver todo".
- **Pie del panel:**
  - Fuera de `pending_workshop_validation` muestra "La validación se habilita cuando las N OTs estén cerradas." y el botón deshabilitado con `aria-describedby`.
  - En validación, los botones actuales, con sus textos y su `PermissionGuard ordenes_mantenimiento:update`: "Validar y Cerrar Orden", "Rechazar Items Especificos", "Devolver Orden Completa al Taller".
  - Las mutaciones (`useOrderValidationMutations`) no cambian.
- Reordenar sectores con `PermissionGuard ordenes_mantenimiento:update`. **Hoy está sin proteger** (`OrderDetailDialog.tsx:329`).
- "Gestionar orden" con `gestion_ordenes:update`.
- El foco vuelve al disparador al cerrar.

### P6. Wizard de gestión de orden (`wiz1`–`wiz4`). Agente: **general-purpose**

**Archivos que posee:** **M** `OrderManagement/components/{ManageOrderWizard.tsx, AddItemDialog.tsx, AssignRepairTypesDialog.tsx, wizard/*}`.

**Entrega**

- `Sheet` ancho con el stepper `<ol>` (Desvíos / Sectores / Orden / Confirmar, con `aria-current="step"`).
- **Agregar ítem inline** en el paso 1: se extrae el formulario de `AddItemDialog` a un componente `AddItemInlineForm` en el mismo archivo y el wizard deja de abrir el dialog. Mismo submit (`addItemToOrder` / `saveOrderChanges`) y mismo `PermissionGuard gestion_ordenes:create`.
- Paso 3: botones subir / bajar (`aria-label` "Subir <sector>" / "Bajar <sector>") además del arrastre.
- Se conservan textos y validaciones ("Rechazar desvío", "Todos los desvíos tienen sector asignado.", "Flujo del vehiculo:", "Cada OT incluye diagnóstico automático del sector.", fecha fin posterior a inicio).
- El `AlertDialog` "Hay cambios sin guardar" se queda.
- `AddItemDialog.tsx` se borra en la Etapa 2 si queda sin consumidores.

### P7. Bandeja de Aprobaciones (`band`). Agente: **general-purpose** (la tabla de validación, con **table-expert** como sub-revisión)

**Archivos que posee**

- **M** `ApprovalInbox/{ApprovalInboxTabContent.tsx, components/ApprovalInboxClient.tsx, components/_ValidationOrdersDataTable.tsx, hooks/useApprovalInbox.ts, actions/actionsServer.ts, fallback/*}`.
- **C** `ApprovalInbox/components/{ApprovalCategoryMetrics.tsx, AuthorizationList.tsx, ReassignmentList.tsx, ReturnedOrdersList.tsx}`.

**Entrega**

- Una sola pantalla, sin los modales que abren listas.
- 4 métricas-ancla: Autorizaciones, Reasignaciones, Validación de cierre, Órdenes devueltas.
- Bloques en `SectionCard`:
  - **Autorizaciones**: tarjeta por tarea con patente, N° OT, sector, pill "Pend. Aprobación", título, "Solicitada por [legajo] Nombre · fecha" y la cita del operario. "Aprobar tarea" y "Rechazar tarea" llevan `PermissionGuard bandeja_aprobaciones:update` (**hoy sin proteger**). Al rechazar, el motivo es obligatorio y va inline.
  - **Reasignaciones**: "Motivo de devolucion", selector "Nuevo sector" y "Reasignar", con `bandeja_aprobaciones:update` (**hoy sin proteger**).
  - **Validación de cierre**: la tabla actual con `mobileCards` y "Revisar y cerrar", que abre el panel P5. Cerrar exige `ordenes_mantenimiento:update`, igual que hoy.
  - **Órdenes devueltas** (D-1): solo lectura, con motivo, quién, cuándo y "Ver orden".
- Cada bloque tiene sus estados de carga, vacío ("No hay tareas para autorizar.") y error.
- Query nueva en `actionsServer.ts`: `getReturnedOrders()`, ver §5. Key `[...APPROVAL_INBOX_QUERY_KEY,'returned-orders']`.

### P8. Diálogos de acción (`aprobar`, `plan`, `rech`, `entrada`). Agente: **general-purpose**

**Archivos que posee:** **M** `SolicitudesMantenimiento/components/{SolicitudApprovalDialog.tsx, SolicitudRejectDialog.tsx, ReassignSupervisorDialog.tsx}` y `PedidosMantenimiento/components/{PlanificarPedidoDialog.tsx, EntradaTallerDialog.tsx}` + `PedidosMantenimiento/Pendientes/components/RechazarPedidoDialog.tsx`.

**Entrega**

- Modal de un solo paso.
- Resumen del equipo arriba (`ResourceCell` con condición).
- Cuadro de impacto con el texto que ya existe ("Esta acción actualizará el equipo:").
- Submit deshabilitado mientras falte algo, con el motivo enlazado por `aria-describedby`.
- En Validar, ítems agrupados por críticos / no críticos con sus textos actuales, segmentado Aprobar / Rechazar (`aria-pressed`), motivo inline obligatorio y contador vivo `aria-live="polite"` "N aprobados · M rechazados".
- Planificar: `EnhancedDatePicker` con escritura directa.
- Lógica, payloads, mutaciones e invalidaciones intactos. Todos los botones que no envían llevan `type="button"`.

### P9a. Gomería, tablas (`gcat`, `gord`, `gplant`, `gmar`, `gtip`). Agente: **table-expert**

**Archivos que posee:** **M** `Gomeria/{GomeriaTabContent.tsx, Catalogo/** (salvo TireForm/TireBulkForm/TireReturnDialog: solo estilos si hace falta), Ordenes/{OrdenesTabContent.tsx, ServiceOrdersList.tsx, components/_ServiceOrdersDataTable.tsx, components/columns.tsx}, Plantillas/**, Marcas/**, Tipos/**}`. **C** `Gomeria/Catalogo/components/TireStatusMetrics.tsx`.

**Entrega**

- Catálogo con 5 métricas, una por `TireStatus`. Conteo con `groupBy` sobre el mismo `where` de `tire-list.server.ts`, que este paquete posee.
- Plantillas como tarjetas con mini diagrama de ejes. Los permisos ya están bien.
- Órdenes: banda "N orden(es) abierta(s)" con "Continuar orden".
- Sin "Bajo mínimo" (no hay umbral).

### P9b. Gomería, orden y diagrama (`gwiz`). Agente: **general-purpose**

**Archivos que posee:** **M** `Gomeria/Ordenes/components/{ServiceOrderWizard.tsx, ServiceOrderDetailView.tsx, TireDiagram.tsx, TirePositionCard.tsx, TireActionsWithTire.tsx, TireBasicActionTabs.tsx, TireReplaceTab.tsx, TireReplacePicker.tsx, EmptyPositionAssign.tsx, TireInfoBadge.tsx, useTirePositionActions.ts}` y `Gomeria/shared/TireDiagramRenderer.tsx`.

**Entrega**

- Vista superior con cabina, ejes, auxilio y **enganche**.
- Botones de posición con `aria-label` y `aria-pressed`, y leyenda con texto.
- Panel lateral de la posición con Calibrar / Reparar / Reemplazar / Extravío, más la lista de intervenciones.
- Lo usan también la ficha de Equipos (pestaña Cubiertas) y el QR `tire-service`: **verificar los tres**.

### P10. Equipos con Desvíos (`desv`) y Vista Taller (`vista`). Agente: **table-expert**

**Archivos que posee:** **M** `EquiposConDesvios/**` y `WorkshopView/**` (salvo `WorkshopSectorTasksTable/work-order-status.ts`, que es de E0).

**Entrega Desvíos**

- Agregar `firstDeviationDateMs` al agregado cacheado (`actions.server.ts:109-160`). Se calcula en el mismo bucle; el "ahora" se compara **afuera** del `'use cache'`.
- Nueva `getStaleDeviationEquipments()`: equipos cuyo desvío pendiente más viejo es de hace más de 30 días, con los mismos `where` y permiso `view`.
- Banda de Atención y "Último Desvío" con `RelativeAge`.
- Ojo: el agregado cubre solo vehículos y no aplica tipos ocultos ni supervisor (es así hoy). Se documenta y no se cambia.

**Entrega Vista Taller**

- Grilla de `SectorCapacityCard` (5 columnas, 3 en `max-xl`, 2 en `max-md`) que filtra la tabla de OT del sector, mostrando una sola tabla (la del sector elegido) en lugar del acordeón.
- `WorkshopSectorsAccordion.tsx` pasa a `WorkshopSectorsGrid` en el mismo archivo o en uno nuevo, a elección del agente dentro de su carpeta.
- Estados de OT con `MaintenanceStatusPill entity="workOrder"`.

### P11. QR anónimo y panel del operario (`qr0`–`qr5`, `op1`–`op3`). Agente: **general-purpose**

**Archivos que posee:** **M** `NuevoPedido/**`, `AnonymousLogin/components/*` y `AnonymousLogin/MaintenanceLoginCard.tsx` (solo presentación: **no tocar** `hooks/*` ni `utils/login-schemas.ts`), `EquipmentDashboard/components/*`, `Checklists/components/*`, `OperatorPanel/components/**`.

**Entrega**

- Botones de 48 px, `inputMode="numeric"` en CUIL y km, barra de progreso por paso.
- Los dos finales reales: el chofer ve "Solicitud enviada. El supervisor debe aprobarla…"; el supervisor, "Pedido creado…", **sin N°** (D-2).
- `StepConfirm` usa `MaintenanceStatusPill`.
- Operario: tabs Activas / Bloqueadas / Completadas, tarjetas de OT y "Devolver tarea" como sheet inferior (`Sheet side="bottom"`) con contador "N/10" y la validación actual de mínimo 10 caracteres.
- `TaskCard` usa `REPAIR_STATUS_UI`.
- Mensajes de conexión ("Se perdió la conexión…") intactos.
- Desktop "Nuevo Pedido": los mismos pasos dentro de `SplitLayout`. Sin "Nuevo pedido" cuando falta `create`: placeholder bloqueado con `title` "Requiere permiso de creación".

## 5. Contratos de datos

Todas las queries nuevas siguen el mismo patrón:

- `'use server'`, Logger y try/catch.
- Permiso `view` de la tab del paso con `requireMaintenancePermission` (o `checkPermissionServer`, como en su archivo hermano).
- Empresa activa vía `resolveOrderListScope(companyId)` + `scopeConditions` para `maintenance_orders`, o el builder de alcance de solicitudes de `actionsTableServer.ts` (que se exporta).
- Todo dentro de `AND`. Solo `count` o `groupBy`, un `Promise.all` por paso y sin N+1.
- Tipos inferidos con `Awaited<ReturnType<…>>`.

| Pantalla             | Query                             | Tipo     | Definición                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline Operaciones | `getOperacionesPipelineSummary()` | derivado | Sigue el patrón de §5 salvo el permiso: el contenedor ya filtra por `view` de cada paso. `validate` = solicitudes `pending_approval`; `in_workshop` = órdenes con `status in DEFAULT_TRACKING_STATUSES`. Atención: `created_at < hoursAgo(48)` y `count(status='workshop_rejected')`.                                                                                                                                                                                                                                                                               |
| Validar              | `getMaintenanceRequestMetrics()`  | derivado | Base = el `where` por defecto del listado (empresa, supervisor, tipos ocultos, `pending_approval`). `critical` = `maintenance_request_items.some.checklist_deviations.is_critical=true`. `overdue` = `created_at < hoursAgo(48)`. `preventive` = `source='preventive'`. El mismo helper se usa en el `where` del listado con `filters.attention`.                                                                                                                                                                                                                   |
| Seguimiento          | `getWorkshopTrackingMetrics()`    | derivado | `groupBy(['status'])` sobre el scope + `status in DEFAULT_TRACKING_STATUSES`. Más `findMany take 3` de `workshop_rejected` (`select` id, order_number, description y recurso). D-5A: `count(status='rejected', rejected_at >= daysAgo(7))`.                                                                                                                                                                                                                                                                                                                         |
| Pipeline Taller      | `getTallerPipelineSummary()`      | derivado | Los 4 contadores actuales. Aprobaciones según D-4. Atención: `pending_scheduling ∧ created_at < daysAgo(7)`; `date_confirmed ∧ scheduled_date < argentinaTodayAsUtcDate()`; `in_workshop ∧ maintenance_order_items.none.work_order_id.not=null`.                                                                                                                                                                                                                                                                                                                    |
| Por Programar        | `getPendingOrderMetrics()`        | derivado | total, `overdue`, `date_rejected` (`date_rejected_at not null`), `preventive`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Por Ingresar         | `getConfirmedOrderAttention()`    | derivado | `findMany take 3` de `date_confirmed` con fecha pasada (`select` liviano).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| En Taller            | `getInWorkshopMetrics()`          | derivado | total; `no_work_orders`; `stuck` = `maintenance_order_items.some.work_order_items.some.work_order_item_repairs.some.status in ['pending_approval','reassignment_requested']`; `overdue` = `workshop_entry_date < daysAgo(14)`. Más el primer `no_work_orders` para la banda.                                                                                                                                                                                                                                                                                        |
| Bandeja              | `getReturnedOrders()`             | derivado | `requireApprovalsAccess('view')`, `company_id` y tipos ocultos (mismo perímetro que la bandeja). `status='in_workshop' ∧ maintenance_activity_log.some.action_type in ['workshop_returned_order', ('workshop_item_rejected' si D-1)]`. `select`: id, order_number, description, recurso, `rejection_reason` y el último log de ese tipo (`orderBy performed_at desc, take 1`, con `profile.fullname`). Se descartan en memoria las que tengan un log de estado posterior distinto, para cubrir el ciclo devuelta → reenviada → abierta otra vez. Sin `'use cache'`. |
| Desvíos              | `getStaleDeviationEquipments()`   | derivado | Calculado sobre el agregado cacheado, extendido con `firstDeviationDateMs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Gomería              | `getTireStatusCounts()`           | derivado | `groupBy(['status'])` con el where base del catálogo y `catalogo_cubiertas:view`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Detalle              | `getMaintenanceOrderDetail`       | existe   | Sin cambios de select.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Vista Taller         | `getWorkshopSectorsWithCounts`    | existe   | Sin cambios (ver la nota de seguridad en §1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Filtro virtual `attention`:**

- Cada action de listado (`actionsTableServer.ts`, `Pendientes/actions.server.ts`, `Confirmados/actions.server.ts`, `MaintenanceOrders/table/actions.server.ts` o `table/lib/order-where.ts`, `WorkshopTracking/actions.server.ts`) agrega `'attention'` a su whitelist.
- Mapea `filters.attention[0]` a la **misma** función de condición que usa su métrica. Esas funciones viven en el `metrics.server.ts` de cada paquete o en `order-list-shared.ts` (P3).
- **No hay cambios de esquema Prisma ni migraciones.**

## 6. Permisos por acción (contra `permissions-map.ts:917-1100` y lo que exige el servidor)

| Pantalla               | Acción                                           | Clave                                                                     | Server                                                  | UI hoy                                                                          |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Validar                | Ver lista y paso                                 | `mantenimiento:maintenance_requests:view`                                 | `actionsTableServer.ts:33`                              | ok                                                                              |
| Validar                | Validar / Rechazar / Reasignar supervisor        | `mantenimiento:maintenance_requests:update`                               | `approvals.server.ts:58,294,337`                        | ok (`canApproveReject` server-side)                                             |
| Seguimiento            | Ver                                              | `mantenimiento:seguimiento_taller:view`                                   | `WorkshopTracking/actions.server.ts:204`                | ok                                                                              |
| Seguimiento            | Validar / rechazar desde Operaciones (legacy)    | `mantenimiento:seguimiento_taller:update`                                 | `operations-validations.server.ts:35,111,146`           | ok (`OrderStatusSections.tsx:106`)                                              |
| Por Programar          | Planificar / Rechazar                            | `mantenimiento:pedidos_pendientes:update`                                 | `actionsServer.ts:243,314`                              | ok                                                                              |
| Por Ingresar           | Registrar ingreso                                | `mantenimiento:pedidos_confirmados:update`                                | `actionsServer.ts:408`                                  | **sin proteger** → `PermissionGuard` en `Confirmados/columns.tsx` y en la banda |
| En Taller              | Gestionar (abrir wizard)                         | `mantenimiento:gestion_ordenes:update` (leer exige `view` en `READ_TABS`) | `access.ts:40-66`                                       | **sin proteger** → guard en la columna y en la banda                            |
| Wizard                 | Agregar ítem / Generar OTs                       | `mantenimiento:gestion_ordenes:create`                                    | `items.server.ts:157`, `work-orders.server.ts:59`       | ok                                                                              |
| Wizard                 | Asignar sectores / tipos / rechazar desvío       | `mantenimiento:gestion_ordenes:update`                                    | `items.server.ts:62,223`                                | ok                                                                              |
| Wizard                 | Quitar ítem manual                               | `mantenimiento:gestion_ordenes:delete`                                    | `items.server.ts:272`                                   | ok                                                                              |
| Detalle                | Ver                                              | `view` en cualquiera de `ORDER_DETAIL_VIEW_TABS`                          | `queries.server.ts:15`                                  | ok                                                                              |
| Detalle                | Reordenar sectores / OT externa                  | `mantenimiento:ordenes_mantenimiento:update`                              | `mutations.server.ts:36,94`                             | reordenar **sin proteger** → guard; OT externa ok                               |
| Detalle / Bandeja      | Validar y cerrar / devolver / rechazar ítems     | `mantenimiento:ordenes_mantenimiento:update` (no `bandeja_aprobaciones`)  | `validations.server.ts:44,149,221`                      | ok                                                                              |
| Detalle                | Pedido de materiales                             | `almacenes:pedidos:create`                                                | `materials.server.ts:124`                               | ok (`canRequest` server-side)                                                   |
| Bandeja                | Ver bloques                                      | `mantenimiento:bandeja_aprobaciones:view`                                 | `actionsServer.ts:134,238,338`                          | ok                                                                              |
| Bandeja                | Aprobar / Rechazar tarea, Reasignar              | `mantenimiento:bandeja_aprobaciones:update`                               | `actionsServer.ts:354,402,453`                          | **sin proteger** → `PermissionGuard` en cada botón                              |
| Nuevo Pedido           | Crear                                            | `mantenimiento:nuevo_pedido:create` (o empleado de campo)                 | `resource-access.server.ts:106`                         | botón del header: guard con placeholder                                         |
| Gomería                | Catálogo (crear / editar / borrar)               | `mantenimiento:catalogo_cubiertas:{create,update,delete}`                 | `tire-mutations.server.ts`                              | ok                                                                              |
| Gomería                | Órdenes (crear / cerrar o intervenir / cancelar) | `mantenimiento:ordenes_gomeria:{create,update,delete}`                    | lifecycle / operations                                  | ok                                                                              |
| Gomería                | Plantillas (C/U/D, asignar = create)             | `mantenimiento:plantillas_cubiertas:*`                                    | `template-crud.server.ts`                               | ok                                                                              |
| Gomería                | Marcas y Tipos (C/U)                             | `mantenimiento:{marcas,tipos}_cubiertas:{create,update}`                  | ok                                                      | ok                                                                              |
| Vista Taller y Desvíos | Solo lectura                                     | `mantenimiento:{workshop_view,equipments_with_deviations}:view`           | Desvíos ok; sectores **sin chequeo** (fuera de alcance) | —                                                                               |

**Protección en UI:** se usa `PermissionGuard` dentro de componentes cliente. En columnas se usa `permissionsMap` del servidor o `PermissionGuard` en la celda, como el patrón existente de `Pendientes/columns.tsx:245`. **No cambia lo que exige el servidor.**

No hace falta agregar ninguna acción al mapa: todas las claves existen. "Gestionar" se mapea a `gestion_ordenes:update` porque abrir el wizard sin poder guardar no sirve; se puede discutir si alcanza con `view`.

## 7. Flujos que no se deben romper

- **QR y acceso anónimo** (`/maintenance`, `/maintenance/equipment/[id]/{request,checklists,tire-service}`, `/maintenance/thanks`) y **operario** (`/operator/login`, `/operator/(panel)/{dashboard,work-order/[id]}`): cambia solo la presentación. Quedan intactos `useMaintenanceAnonymousLogin`, `login-schemas`, las server actions de sesión, la guarda de dos caminos (`requireResourceAccess` / `requireGomeriaAccessForCompany`) y los mensajes de error y conexión.
- **Embebidos en Equipos:**
  - `EquipoID/components/equipment-orders/_EquipmentOrdersDataTable.tsx` usa `ActivityHistoryModal` (variante dialog por defecto) y `EquipmentOrderDetailDialog`, que usa `SectorTimeline`.
  - `OtherEquipment/maintenance/*`.
  - La pestaña Cubiertas usa `TireDiagramRenderer`.
  - Solo cambian las etiquetas, vía la fuente.
- **`ActivityHistoryModal`** tiene 7 consumidores (Pendientes, Confirmados, Seguimiento, Solicitudes, Bandeja ×2 y Equipos): la API por defecto no cambia.
- **Exports:** cada `exportConfig` usa `getStatusLabel(entity, …)` en sus formatters. Las columnas compuestas van con `excludeFromExport` y las atómicas se exportan. PDF de la orden: `report-data.ts` consume `getMoStatusConfig` y `getWoStatusConfig`, ya derivados en E0; verificar el PDF de una orden en `pending_workshop_validation`. El export de tareas (`_ExportTasksButton`) ya dice "N° Orden (OM)".
- **React Query:** mantener todas las keys de §1. Las nuevas cuelgan de `['maintenance', …]`, así que `invalidateAllMaintenanceQueries` las cubre. Al cambiar el `tableId` a `-v2`, la `queryKey` de cada tabla queda igual.
- **URLs:** `?tab=` (sección), `op_step` y `taller_step` (pasos), y los params namespaced `<paramNamespace>__col`, que no cambian porque solo cambia el `tableId`. Los links o bookmarks a `?tab=maint_taller&taller_step=approvals` tienen que seguir abriendo la bandeja.

## 8. Plan de ejecución

**Etapa 0** (1 agente general-purpose; Opus/Sonnet según `feedback-modelos-por-fase`)

- [ ] 0.1 `status-presentation.ts` y conversión de los mapas a derivados (lista exacta en §3). Al terminar, `check-types` en verde.
- [ ] 0.2 Mover `Timeline`, `StackedCell` y `SegmentedProgress` (con re-exports). `SectionErrorBoundary`. Los 8 componentes de Mantenimiento más `sector-route.ts` y `order-stages.ts`.
- [ ] 0.3 `attention-thresholds.ts`.
- [ ] 0.4 `Pipeline/types` y `PipelineLayout` (`summaryQuery` y error por paso), compilando con los `*PipelineContent` actuales. Adaptar los dos `PipelineContent` a lo mínimo para que compile; P1 y P3 los terminan.
- [ ] Si se aprueba D-6B: prop opt-in `sectionNav` en `SectionManagerServer` + `src/features/TabsManager/components/SectionNav.tsx`.

**Etapa 1** (en paralelo; los archivos de cada paquete son disjuntos según §4)

- P1 (table-expert), P2 (table-expert), P3 (table-expert), P4 (table-expert), P5 (general), P6 (general), P7 (general + table-expert para `_ValidationOrdersDataTable`), P8 (general), P9a (table-expert), P9b (general), P10 (table-expert), P11 (general).
- Dependencias: todos dependen de E0. P5 no depende de los demás (los otros abren `OrderDetailDialog` con la misma API). P7 abre el panel de P5 con la API sin cambios.
- **A table-expert hay que decirle explícitamente:** no migrar facets bulk donde existan (Seguimiento), no escribir ni correr tests, y conservar los placeholders.

**Etapa 2** (1 agente general-purpose)

- [ ] `MantenimientoComponent.tsx`: `sectionNav` (si D-6B). Los fallbacks de Suspense con skeletons con forma real.
- [ ] Borrar, después de grep: `Pipeline/components/WorkflowPipeline.tsx`, `WorkflowPipelineChevrons.tsx`, `OrderManagement/components/AddItemDialog.tsx` (si quedó sin uso) y el viejo `getSectorStatus`. **No borrar** `SectorTimeline`, `RequestedItemsDialog`, `status-badge.tsx` (verificar consumidores) ni `src/features/Mantenimiento/__PIPELINE_PROPOSAL__.html` (preguntar).
- [ ] Grep final de etiquetas viejas en `src/features/**`: "Pendiente Planificar", "Por planificar", "Pendiente de planificar fecha de taller", "Pendiente de ingreso a taller", "Pend. Validacion", "Pend. Aprobacion", "Nro. Pedido", "Rechazada por Taller" usado para `rejected`, "En Proceso". Todo lo que quede tiene que salir de la fuente única.
- [ ] `check-types`, `next build` y la verificación de navegador de §10.

## 9. Protocolo de UI (lo que pude consultar)

- **El MCP `ui-skills` no estaba disponible** en este subagente. Para el diseño se reusan las dos skills que ya guiaron los mockups: `pbakaus/harden` (estados de carga, vacío, error y sin permiso; textos que dicen cuándo aparece cada vacío; nada de afirmar "todo bien" cuando falló la carga) e `ibelick/fixing-accessibility` (foco visible, Escape, foco atrapado y devuelto, `aria-label` en botones de solo ícono, `aria-pressed` y `aria-current`, `role="progressbar"`, estado nunca solo por color). **No inventé extractos.** El hilo principal debe pegar en cada prompt el extracto de esas dos skills si ya lo tiene en contexto, o pedirlo con `get_skill` (una vez).
- **Reglas de Vercel que leí y que cada paquete debe seguir:**
  - `server-cache-react`: "Use `React.cache()` for server-side request deduplication… Avoid inline objects as arguments". Aplica a los contadores de la subnav y de los pipelines (D-6B, E0): argumentos primitivos.
  - `async-suspense-boundaries`: "use Suspense boundaries to show the wrapper UI faster while data loads… share promise across components". Aplica a métricas y tabla de cada paso (P1-P4, P9a): arrancar la promesa de métricas antes del `await` de la tabla y pasarla al `<Suspense>` de las tarjetas.
  - `server-serialization`: "Only pass fields that the client actually uses". Aplica a la banda de Atención y a las métricas (P1-P4, P7, P10): `select` mínimo. Pasar números y 3 filas, no listas completas.
  - `bundle-dynamic-imports`: "Use `next/dynamic` to lazy-load large components not needed on initial render". Aplica a P5 y P6: `OrderDetailDialog` y `ManageOrderWizard` se abren a demanda. Cargarlos con `next/dynamic` desde las tablas; `@react-pdf` ya va aparte.

## 10. Riesgos y verificación

**Pantallas a verificar** (1440 y 390 px, con el snapshot de texto y DOM medido; capturas solo para layout y color):

- Operaciones: Validar, Seguimiento.
- Taller: Por Programar, Por Ingresar, En Taller, Aprobaciones.
- Panel de detalle, en estado normal y en validación.
- Wizard, los 4 pasos.
- Los 4 diálogos.
- Gomería: Catálogo, Órdenes, una orden abierta con enganche, Plantillas, Marcas, Tipos.
- Equipos con Desvíos y Vista Taller.
- Los 6 pasos del QR y las 3 pantallas del operario.
- Ficha de Equipos: órdenes, historial y cubiertas.

**Qué medir**

- Que no haya desborde horizontal.
- Que el contador de cada paso coincida con el total de su tabla por defecto: con un usuario con `view_all_requests` **y** con un supervisor sin ese permiso. Un supervisor sin ese permiso tiene que ver la misma cifra en el paso y en la tabla.
- Que cada métrica, al hacer clic, deje el total de la tabla igual al número de la métrica.
- Que el foco vuelva al disparador y que Escape cierre solo el overlay superior.
- Que no queden clases `text-blue-600` ni hex (grep).
- Fechas a las 22:30 AR con el proceso en UTC.

**Puntos delicados**

- D-1 a D-6.
- El rechazado que desaparece (D-5): verificarlo provocando un rechazo **nuevo** desde Por Programar y mirando Seguimiento con el filtro "Rechazada" y la banda.
- QR en un celular real: teclado numérico, cámara para fotos, conexión inestable, sesión CUIL o email.
- Contadores con el filtro de supervisor (D-4).
- El error por paso: forzar un throw en un TabContent y comprobar que los demás pasos siguen y el contador muestra "—".
- Preferencias `-v2`: los usuarios pierden su configuración de columnas una vez. Avisar.
- El PDF de una orden en validación ya no muestra el estado en crudo.
- `ActivityHistoryModal` en Equipos sigue siendo un dialog.

**Reglas que repite cada paquete**

- Sin `any` y sin `console.*` (usar `Logger`).
- Fechas con `formatArgentinaDay` / `formatArgentinaDateTime`; las `@db.Date` con `moment.utc`.
- `type="button"` en todo lo que no envía.
- Tokens, sin hex ni clases armadas en runtime.
- Legajo antes del nombre.
- Sin tests ni commits.

## 11. Archivos clave

1. `src/features/Mantenimiento/lib/status-presentation.ts` (nuevo)
2. `src/features/Mantenimiento/lib/attention-thresholds.ts` (nuevo)
3. `src/features/Mantenimiento/lib/order-status.ts` (máquina de estados; no se toca)
4. `src/features/Mantenimiento/Pipeline/components/PipelineLayout.tsx`
5. `src/features/Mantenimiento/Pipeline/{Operaciones,Taller}Pipeline/actions/pipeline-counts.server.ts`
6. `src/features/Mantenimiento/PedidosMantenimiento/lib/order-list-shared.ts`
7. `src/features/Mantenimiento/MaintenanceOrders/components/OrderDetailDialog.tsx`
8. `src/features/Mantenimiento/MaintenanceOrders/actions/validations.server.ts` (D-1; solo lectura)
9. `src/features/Mantenimiento/ApprovalInbox/actions/actionsServer.ts` y `components/ApprovalInboxClient.tsx`
10. `src/features/Mantenimiento/WorkshopTracking/{statuses.ts, workshopTrackingColumns.tsx, actions.server.ts}`
11. `src/features/Mantenimiento/MaintenanceOrders/table/{columns.tsx, lib/order-select.ts}`
12. `src/features/Mantenimiento/components/ActivityHistory/activity-config.ts` y `ActivityHistoryModal.tsx`
13. `src/features/Mantenimiento/WorkshopView/WorkshopSectorTasksTable/work-order-status.ts` (PDF)
14. `src/features/Equipos/EquipoID/lib/order-status.ts`
15. `src/features/Mantenimiento/OrderManagement/components/ManageOrderWizard.tsx`
16. `src/features/Mantenimiento/EquiposConDesvios/actions.server.ts`
17. `src/features/TabsManager/SectionManagerServer.tsx` (solo si D-6B)
18. `src/features/Permissions/permissions-map.ts` (solo lectura)

## 12. Tamaño estimado por paquete

| Paquete | Archivos                                     | Tamaño       |
| ------- | -------------------------------------------- | ------------ |
| E0      | ~25 (la mayoría, cambios mecánicos en mapas) | grande (M-L) |
| P1      | ~10                                          | M            |
| P2      | ~8                                           | M            |
| P3      | ~16                                          | L            |
| P4      | ~9                                           | M            |
| P5      | ~10 (el `OrderDetailDialog` de 990 líneas)   | L            |
| P6      | ~10                                          | M            |
| P7      | ~9 (query nueva y 4 bloques)                 | M-L          |
| P8      | 6 diálogos                                   | M            |
| P9a     | ~15                                          | M            |
| P9b     | ~11 (diagrama)                               | M-L          |
| P10     | ~10                                          | M            |
| P11     | ~25 (presentación móvil)                     | L            |
| E2      | —                                            | S-M          |
