# Almacenes — Etapa 4: repuestos de Mantenimiento por pedido de materiales

**Fecha:** 2026-10-07
**Estado:** diseño aprobado, pendiente de revisión de la spec escrita
**Parte de:** `docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md` (§1.1, etapa 4). Se apoya en la etapa 3 (`2026-10-06-almacenes-etapa-3-design.md`): rige todo lo de pedidos (aprobación, entrega parcial, anulación, cierre), el motor único de escritura, `ActionResult`, costos solo con `view_prices` y multiempresa por `company_id`.

## 1. Objetivo y decisiones

Que los repuestos de una reparación salgan del stock imputados a la orden de mantenimiento y a la orden de trabajo (OT) donde se usan, y que Mantenimiento muestre qué se pidió, qué se entregó y cuánto costó.

Hoy Mantenimiento no registra nada de repuestos ni costos. El único vínculo es de Almacenes hacia la orden (`stock_movements.maintenance_order_id`, `material_requests.maintenance_order_id`), y Mantenimiento no lo muestra.

| Tema | Decisión |
| ---- | -------- |
| Cómo se consumen | **Por pedido de materiales** (etapa 3). Desde Mantenimiento no hay salida directa: el almacén entrega el pedido. |
| Quién pide | El **operario desde su OT**, en el panel `/operator`: solo materiales y cantidades, sin depósito, lote ni serie. También quien tenga `pedidos:create`, desde el detalle de la orden. |
| Aprobación | **Igual que cualquier pedido**: entra en `PENDING_APPROVAL` y lo aprueba quien tenga `pedidos:approve`. |
| Imputación | **A la orden y a la OT** desde la que se pidió. |
| La OT mientras espera | **No cambia de estado.** El panel informa "Esperando materiales"; pausarla sigue siendo decisión del operario. |
| Dónde se ve | Detalle de la orden, panel del operario y PDF de la orden. |
| Cierre de la orden | **Bloqueado** mientras queden pedidos abiertos de la orden. |

## 2. Modelo de datos

- `material_requests.work_order_id uuid?`: FK a `work_orders`, con índice.
- CHECK `material_requests_work_order_check`: `work_order_id IS NULL OR destination_type = 'MAINTENANCE_ORDER'`.
- Que la OT pertenezca a la orden del pedido se valida en código. La relación OT → orden no es una FK directa: pasa por `work_order_items` → `maintenance_order_items.maintenance_order_id`.
- El stock no cambia. Lo entregado a una OT se calcula por el vínculo entrega → pedido → OT (`stock_movements.material_request_id` → `material_requests.work_order_id`).

## 3. Reglas

### 3.1 Alta de pedidos: una sola función, tres entradas

Se extrae de `createMaterialRequestAction` una función de servidor `createMaterialRequest(tx, companyId, requestedBy, input)` en `lib/requests.ts`.

- **Qué hace:** valida los materiales (activos, de la empresa; enteros en serializados) y el destino con `validateExitDestination`, numera `PED-` y crea el pedido en `PENDING_APPROVAL`.
- **Con `workOrderId`:** además valida que la OT sea de la empresa, que pertenezca a la orden del destino y que no esté `completed`, `completed_partial` ni `cancelled`.

Cada entrada aplica su propia autorización antes de llamarla:

| Entrada | Autorización | Destino |
| ------- | ------------ | ------- |
| Almacenes → Nuevo pedido | `pedidos:create` (como hoy) | Cualquiera, sin OT |
| Panel del operario, en la OT | Perímetro: `assertWorkOrderInScope` (la OT es de un sector asignado al operario) | La orden de la OT y la OT, fijados por el servidor |
| Detalle de la orden | `pedidos:create` y la orden en `in_workshop` | La orden; la OT es opcional y se elige de las OTs abiertas de la orden |

El operario no necesita permisos de Almacenes: su autorización es el perímetro, igual que el resto de las acciones del panel.

### 3.2 Buscador de materiales del operario

Una acción del panel busca en el catálogo **activo** de la empresa del operario, por código o nombre, con tope de resultados y aviso "Mostrando X de Y". Devuelve código, nombre, unidad y tipo de control. No devuelve stock ni costos.

### 3.3 Bloqueo del cierre

`workshopChiefValidateOrder` lockea la orden y, antes de completarla, busca pedidos de la orden en `PENDING_APPROVAL`, `APPROVED` o `PARTIALLY_DELIVERED`. Si encuentra alguno, rechaza con *"PED-000012 sigue abierto: entregalo, cerralo o cancelalo antes de completar la orden"*. Si hay varios, nombra el primero y la cantidad: *"PED-000012 y 2 pedidos más siguen abiertos…"*.

Los pedidos `DELIVERED`, `CLOSED`, `REJECTED` y `CANCELLED` no bloquean.

Orden de locks: la orden de mantenimiento se lockea antes que el pedido. Ningún camino de Almacenes lockea la orden de mantenimiento, así que no hay ciclo.

### 3.4 Historial

Al crear un pedido con orden, se registra en `maintenance_activity_log` el tipo nuevo `ACTIVITY_LOG.materialRequestCreated` (`material_request_created`): número del pedido, OT y cantidad de líneas en `metadata`. `action_type` es texto, así que no hace falta migración para el tipo.

## 4. Pantallas

### 4.1 Panel del operario (`/operator`, detalle de la OT)

- Botón **"Pedir materiales"** mientras la OT no esté cerrada ni cancelada.
- Diálogo con líneas (material del buscador §3.2 y cantidad) y una nota opcional. Toast: *"PED-000012 enviado: queda pendiente de aprobación"*.
- Bloque **"Materiales"** con los pedidos de esa OT: número, estado y, por línea, lo pedido y lo entregado. Mientras haya pedidos sin entregar del todo, muestra "Esperando materiales". Sin costos.

### 4.2 Detalle de la orden (`OrderDetailDialog`)

- Sección **"Materiales"** entre "Secuencia de Sectores" y "Comentarios de la Solicitud":
  - los pedidos de la orden: número (link a `/dashboard/warehouse/requests/[id]`), estado, OT (o "Orden") y fecha;
  - lo entregado, agrupado por OT: material, cantidad neta (entregas menos anulaciones) y, con `movimientos:view_prices`, costo por línea y total por OT y de la orden.
- Botón **"Pedir materiales"** con `pedidos:create` y la orden `in_workshop`. Abre el mismo diálogo del operario, con un selector de OT (las abiertas de la orden, u "Orden sin OT").
- El footer de cierre informa el bloqueo de §3.3 antes de intentar: si hay pedidos abiertos, lo dice junto al botón de validar.

### 4.3 PDF de la orden

Sección nueva **"Materiales utilizados"** después de "Detalle de los trabajos realizados": material, cantidad neta y OT. Con `movimientos:view_prices`, suma costo por línea y total. Sin materiales entregados, la sección dice "No se registraron materiales".

### 4.4 Almacenes

- El detalle del pedido muestra la orden y la OT cuando las tiene ("Orden OM-000045 · OT-000102 (Chapa y pintura)").
- La tabla de Pedidos no cambia.

## 5. Tests

- **Integración (actions con perímetro y permisos simulados):**
  - el operario pide en una OT de su sector: queda `PENDING_APPROVAL` con la orden y la OT;
  - OT fuera de su sector: rechazado;
  - OT cerrada o cancelada: rechazado;
  - desde el detalle, una OT de otra orden: rechazado;
  - completar la orden con un pedido abierto: rechazado; cerrado el pedido, se completa.
- **Cálculo:** lo entregado por OT descuenta las anulaciones.
- **pgTAP:** el CHECK de OT con destino distinto de orden de mantenimiento.
- **Navegador:**
  - pedir desde el panel del operario;
  - aprobar y entregar desde Almacenes;
  - verlo en el detalle de la orden y en el PDF, con y sin `view_prices`;
  - el cierre bloqueado y luego permitido.

## 6. Demo

`scripts/demo/domains/warehouses.ts` suma pedidos de una orden en taller hechos desde su OT: uno entregado y uno pendiente de aprobación. Requiere que Mantenimiento ya esté sembrado antes de Almacenes (hoy lo está).

## 7. Fuera de alcance

- Costo de mano de obra y costo total de la orden más allá de los materiales.
- Salidas directas imputadas a una OT.
- Pausar la OT automáticamente al pedir materiales.
- Devolver a stock repuestos no usados (hoy: anular la entrega o registrar una entrada).
- Avisos por mail de pedidos pendientes.
