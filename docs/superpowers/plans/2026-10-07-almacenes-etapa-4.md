# Almacenes — Etapa 4 (repuestos de Mantenimiento) — Plan de implementación

**Spec:** `docs/superpowers/specs/2026-10-07-almacenes-etapa-4-design.md` (fuente de verdad).
**Base:** rama `feat/almacenes-etapa-1` (etapas 1 a 3 commiteadas; la 3 en `4e4780df`). Las restricciones globales y el criterio de "tarea terminada" son los del plan de la etapa 1.

## Notas que condicionan el orden

- **La OT no tiene FK directa a la orden.** La relación es `work_order_items.maintenance_order_item_id` → `maintenance_order_items.maintenance_order_id`. Ya existe `findMaintenanceOrderIdByWorkOrder` (privada) en `src/features/OperatorPanel/actions/work-orders.server.ts:40`. Se exporta a un módulo `server-only` compartido en lugar de duplicarla.
- **Orden de locks:** al completar la orden, primero la orden de mantenimiento (`lockMaintenanceOrder`) y después la lectura de pedidos. No hace falta lockear los pedidos: un pedido de una orden que ya no está `in_workshop` no se puede crear (spec §3.1), y la entrega a una orden cerrada ya la rechaza el motor.
- **Perímetro del operario:** las acciones del panel se autorizan con `getOperatorIdentity()` + `assertWorkOrderInScope`. No se usan permisos de Almacenes.
- **Fuera de alcance de esta etapa** (§7 de la spec): mano de obra, salidas directas a una OT, pausa automática y devolución de repuestos.

## Revisión: riesgos que los tests de cada tarea tienen que cubrir

- Un operario manda el `workOrderId` de otro sector o de otra empresa: rechazado sin revelar si existe.
- Pedido desde el detalle con una OT de **otra** orden: rechazado.
- Pedido en una OT `completed`, `completed_partial` o `cancelled`, o en una orden que no está `in_workshop`: rechazado.
- Lo entregado por OT tiene que descontar las anulaciones de entregas (cantidad neta), en el detalle y en el PDF.
- Completar la orden con un pedido `PARTIALLY_DELIVERED`: bloqueado aunque ya tenga entregas.

---

### Task 1: Esquema, migración y extracción del alta de pedidos

**Files:**
- Modify: `prisma/schema.prisma`: `material_requests.work_order_id` + relación con `work_orders` (inversa `material_requests`), con índice.
- Create: `prisma/migrations/20261007190000_material_requests_work_order/migration.sql`:
  - columna, FK, índice;
  - CHECK `material_requests_work_order_check` (`work_order_id IS NULL OR destination_type = 'MAINTENANCE_ORDER'`).
- Modify: `prisma/tests/02_warehouses.sql`. Caso nuevo: pedido con OT y destino `CUSTOMER` → `throws_ok`.
- Create: `src/features/Mantenimiento/shared/work-order-order.ts` (`server-only`):
  - `findMaintenanceOrderIdByWorkOrder(tx, workOrderId)`, movida desde `OperatorPanel/actions/work-orders.server.ts`, que pasa a importarla.
- Modify: `src/features/Warehouses/lib/requests.ts`:
  - `createMaterialRequest(tx, companyId, requestedBy, input: { destination: DestinationInput; workOrderId: string | null; notes: string | null; lines: { materialId; quantity }[] })`, extraída de `createMaterialRequestAction` (materiales, destino con `validateExitDestination`, `nextMaterialRequestNumber`, alta).
  - Con `workOrderId`: OT de la empresa, perteneciente a la orden del destino y no `completed`/`completed_partial`/`cancelled` (`StockError('INVALID_DESTINATION', …)`).
  - Si el destino es una orden: registra `ACTIVITY_LOG.materialRequestCreated` con `logActivity`.
  - Devuelve `{ id, number }`.
- Modify: `src/features/Mantenimiento/shared/activity-log/action-types.ts` (`materialRequestCreated: 'material_request_created'`) y su label, si el historial tiene un mapa de labels.
- Modify: `src/features/Warehouses/actions/requests.server.ts`: `createMaterialRequestAction` delega en `createMaterialRequest`.

**Verificación:** `db:deploy`, `generate`, `psql \d material_requests`, `test:db`, `test:warehouses` (el alta existente sigue pasando) y `check-types`.

### Task 2: Pedidos desde el panel del operario

**Files:**
- Create: `src/features/OperatorPanel/actions/materials.server.ts`:
  - `searchOperatorMaterialOptions(query)`: catálogo activo de la empresa del operario; código, nombre, unidad y control; tope 30 y total. Sin stock ni costos.
  - `createOperatorMaterialRequest(values)`: `getOperatorIdentity()`, `assertWorkOrderInScope(workOrderId)`, orden por `findMaintenanceOrderIdByWorkOrder`, destino `MAINTENANCE_ORDER` fijado por el servidor; `withMaintenanceActor` + `createMaterialRequest`. Devuelve `ActionResult<{ number }>`.
  - `getWorkOrderMaterialRequests(workOrderId)`: perímetro; pedidos de la OT con estado y, por línea, pedido y entregado (`deliveredByLine`).
- Create: `src/features/Warehouses/schemas/operator-requests.ts`: `operatorMaterialRequestSchema` (`workOrderId`, `notes`, `lines` con material y cantidad; misma validación de cantidad que `materialRequestSchema`).
- Create: `src/features/OperatorPanel/components/WorkOrderDetail/MaterialRequestDialog.tsx`: líneas con buscador y cantidad, nota, toast "PED-xxxxxx enviado: queda pendiente de aprobación".
- Create: `src/features/OperatorPanel/components/WorkOrderDetail/WorkOrderMaterials.tsx`: bloque "Materiales" con los pedidos y "Esperando materiales" si alguno no está entregado del todo.
- Modify: el detalle de la OT del panel (`components/WorkOrderDetail.tsx` o su carpeta) para montar el botón (OT no cerrada ni cancelada) y el bloque.
- Create: `src/features/OperatorPanel/actions/materials.integration.test.ts`. Con la identidad del operario simulada:
  - pedido en una OT propia: `PENDING_APPROVAL`, con `maintenance_order_id` y `work_order_id`;
  - OT de otro sector: rechazado;
  - OT cerrada: rechazado.
  - Se suma a `scripts/test-warehouses.sh`.

### Task 3: Mantenimiento — detalle de la orden, pedido desde la orden y bloqueo del cierre

**Files:**
- Create: `src/features/Mantenimiento/MaintenanceOrders/actions/materials.server.ts`:
  - `getMaintenanceOrderMaterials(orderId)`: pedidos de la orden (número, estado, OT, fecha) y lo entregado agrupado por OT. Cantidad neta = Σ(−direction × quantity) de las líneas de stock cuyos movimientos tienen `material_request_id` de esos pedidos. Costos solo con `almacenes:movimientos:view_prices`. Sin `ordenes_mantenimiento:view` devuelve vacío.
  - `getOrderOpenWorkOrders(orderId)`: OTs abiertas de la orden, para el selector.
  - `createOrderMaterialRequestAction(values)`: `pedidos:create`, orden `in_workshop`, OT opcional; `createMaterialRequest`.
- Create: `src/features/Mantenimiento/MaintenanceOrders/lib/open-material-requests.ts` (`server-only`): `findOpenMaterialRequests(tx, orderId)` (pedidos en `PENDING_APPROVAL`/`APPROVED`/`PARTIALLY_DELIVERED`, ordenados por número) y `openRequestsMessage(numbers)`: *"PED-000012 sigue abierto…"* / *"PED-000012 y 2 pedidos más siguen abiertos…"*.
- Modify: `MaintenanceOrders/actions/validations.server.ts`. En `workshopChiefValidateOrder`, con la orden lockeada y antes de completarla: si hay pedidos abiertos, devolver el error con el mensaje.
- Create: `MaintenanceOrders/components/order-detail/OrderMaterialsSection.tsx`: pedidos con link, entregado por OT, costos si llegan y botón "Pedir materiales" (`pedidos:create` y `in_workshop`) que abre un diálogo con selector de OT. Reutiliza las líneas del diálogo del operario: se extraen a `src/features/Warehouses/Requests/components/MaterialLinesFields.tsx`, parametrizado por la función de búsqueda.
- Modify: `MaintenanceOrders/components/OrderDetailDialog.tsx`: monta la sección entre "Secuencia de Sectores" y "Comentarios", y avisa en el footer de cierre si hay pedidos abiertos.
- Modify: `src/features/Warehouses/Requests/components/RequestDetail.tsx` + `getMaterialRequestDetail`: muestra la orden y la OT cuando las hay.
- Test: `src/features/Mantenimiento/MaintenanceOrders/actions/materials.integration.test.ts`:
  - pedido desde la orden con una OT de otra orden: rechazado;
  - completar con un pedido `PARTIALLY_DELIVERED`: rechazado con el mensaje; tras cerrarlo, se completa;
  - lo entregado por OT descuenta una anulación.
  - Se suma a `scripts/test-warehouses.sh`.

### Task 4: PDF de la orden

**Files:**
- Modify: `src/features/Mantenimiento/MaintenanceOrders/pdf/report-data.ts` y `types.ts`: `materials: { workOrder: string | null; material: string; quantity: string; unit: string; totalCost: string | null }[]` + `materialsTotal`, con costos solo con `view_prices`. Reutiliza la consulta de `getMaintenanceOrderMaterials` (se extrae la parte de cálculo a una función interna compartida, sin duplicar el SQL).
- Modify: `pdf/MaintenanceOrderReportLayout.tsx`: sección "Materiales utilizados" después de "Detalle de los trabajos realizados"; vacía: "No se registraron materiales".
- Verificación: generar el PDF de una orden con materiales y rasterizarlo con `mupdf` para mirarlo (con y sin `view_prices`).

### Task 5: Demo

**File:** `scripts/demo/domains/warehouses.ts`.
- Para la primera orden `in_workshop` con OT: un pedido de su OT entregado (salida del libro con `request_line_id`) y uno pendiente de aprobación, con `work_order_id`.
- Se verifica con el arnés en transacción descartada.

### Task 6: Verificación final

- `check-types`, `npm test`, `test:db`, `test:warehouses` y `test:jobs`.
- En el navegador:
  - operario: pedir materiales desde una OT y ver "Esperando materiales";
  - Almacenes: aprobar y entregar;
  - detalle de la orden: sección Materiales con y sin `view_prices`, y pedir desde la orden;
  - el cierre bloqueado con un pedido abierto y permitido después de cerrarlo;
  - el PDF con la sección nueva.
- Revisión de calidad antes de proponer el commit.
