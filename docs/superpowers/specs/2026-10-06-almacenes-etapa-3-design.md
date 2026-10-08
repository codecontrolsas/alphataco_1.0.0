# Almacenes — Etapa 3: pedidos de materiales con aprobación

**Fecha:** 2026-10-06
**Estado:** diseño aprobado, pendiente de revisión de la spec escrita
**Parte de:** `docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md` (§1.1, etapa 3). Rige todo lo de las etapas 1 y 2 que esta spec no cambia: motor único de escritura, `ActionResult`, costos solo con `view_prices`, multiempresa por `company_id` y orden de locks del dominio.

## 1. Objetivo y decisiones

Que una salida de material que no cumple las condiciones de salida directa pase por un **pedido** que alguien **aprueba** y que después el almacén **entrega**, aunque sea en partes.

| Tema | Decisión |
| ---- | -------- |
| Cuándo hace falta pedido | Cuando una salida no cumple la **regla triple** (etapa 1): permiso de salida directa del usuario, ningún material con `requires_approval` y total valorizado dentro del monto de la empresa. |
| Niveles de aprobación | **Uno.** Aprueba o rechaza quien tenga `pedidos:approve`. |
| Entrega | **Parcial.** Cada entrega es una salida de stock; el pedido queda parcialmente entregado hasta completarse o cerrarse con motivo. |
| Depósito | **Lo elige quien entrega**, en cada entrega (y también lote o unidades). |
| Roles existentes | La migración da `direct_exit` a **todo rol que hoy tenga `movimientos:create`**, para que nadie pierda lo que hace hoy. |

## 2. Modelo de datos

### 2.1 `material_requests`

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `number` | text | `PED-000001`, correlativo por empresa (advisory lock, como `MOV-`); único `(company_id, number)` |
| `status` | enum `material_request_status` | `PENDING_APPROVAL` · `APPROVED` · `PARTIALLY_DELIVERED` · `DELIVERED` · `REJECTED` · `CLOSED` · `CANCELLED` |
| `requested_by` | uuid | FK `profile` |
| `destination_type` + FKs | — | Mismo esquema y mismos CHECK que la salida: `employee_id`, `vehicle_id`, `other_equipment_id`, `maintenance_order_id`, `customer_id`, `customer_service_id`. El destino es obligatorio. |
| `notes` | text? | |
| `decided_by`, `decided_at`, `decision_notes` | | Aprobación o rechazo. El motivo es obligatorio al rechazar. |
| `closed_by`, `closed_at`, `close_notes` | | Cierre manual (motivo obligatorio) o cancelación. |
| `created_at`, `updated_at` | | |

### 2.2 `material_request_lines`

`request_id` (FK, cascade), `material_id`, `quantity decimal(15,4) > 0`. No lleva lote ni número de serie: los elige quien entrega. Un material puede repetirse en varias líneas.

### 2.3 Vínculo con las entregas

- `stock_movements.material_request_id uuid?` (FK).
- `stock_movement_lines.request_line_id uuid?` (FK).
- Una **entrega** es una salida (`EXIT`) con `material_request_id`, cuyas líneas apuntan a la línea del pedido que satisfacen. La anulación de una entrega copia ambos vínculos (con `direction` invertida).
- **Lo entregado de una línea** se calcula de las líneas de stock vinculadas: `Σ(−direction × quantity)`. Nunca se guarda aparte, así no puede diferir del stock.
- CHECK nuevo: `material_request_id` solo en movimientos `EXIT`.

### 2.4 `warehouse_settings`

Una fila por empresa (`company_id` PK): `direct_exit_max_amount decimal(15,2)?` (vacío = sin límite), `updated_at`, `updated_by`.

## 3. Reglas y motor

### 3.1 Máquina de estados (`lib/request-state-machine.ts`, pura)

| Acción | Desde | Hacia | Permiso |
| ------ | ----- | ----- | ------- |
| Aprobar | `PENDING_APPROVAL` | `APPROVED` | `pedidos:approve` |
| Rechazar (motivo) | `PENDING_APPROVAL` | `REJECTED` | `pedidos:approve` |
| Cancelar | `PENDING_APPROVAL` | `CANCELLED` | el solicitante |
| Entregar | `APPROVED`, `PARTIALLY_DELIVERED` | se recalcula | `pedidos:update` |
| Cerrar (motivo) | `APPROVED`, `PARTIALLY_DELIVERED` | `CLOSED` | `pedidos:update` |

**Recálculo después de entregar o de anular una entrega:**
- se aplica si el pedido está en `APPROVED`, `PARTIALLY_DELIVERED` o `DELIVERED`;
- resultado:
  - todo entregado → `DELIVERED`;
  - algo entregado → `PARTIALLY_DELIVERED`;
  - nada entregado → `APPROVED`.

Un pedido `CLOSED` sigue cerrado aunque se anule una de sus entregas.

### 3.2 Entrega: `registerRequestDelivery(tx, companyId, createdBy, input)`

- **Entrada:** `input = { requestId, warehouseId, occurredOn, notes, lines: [{ requestLineId, quantity, batchId?, unitIds? }] }`.
- **Pasos:**
  1. Lockea el pedido (`FOR UPDATE`). Tiene que ser de la empresa y estar `APPROVED` o `PARTIALLY_DELIVERED`.
  2. Cada línea de entrega tiene que pertenecer al pedido, y su cantidad no puede superar lo **pendiente** (pedido menos entregado). Si lo supera, se rechaza con `OVER_DELIVERY`: *"De Aceite 15W40 quedan 20 l por entregar: no se pueden entregar 30 l"*.
  3. Arma la salida con el destino del pedido y la registra por el camino interno del motor. Ese camino es el mismo de `registerStockMovement`: lotes, unidades, stock suficiente, lotes vencidos. Agrega el vínculo al pedido y a cada línea.
  4. Recalcula el estado del pedido (§3.1).
- La entrega **no** pasa por la regla de salida directa: el pedido ya fue aprobado.

### 3.3 Orden de locks

El dominio queda así: `movimiento original (anulaciones)` → **`pedido`** → `materials` → `stock_balances` → `material_units` → numeración.

- **Entrega:** lockea el pedido antes que los materiales.
- **Anulación de una entrega:** lockea el original, después el pedido y después los materiales.

Ninguna entrega lockea un movimiento existente, así que no hay ciclo posible.

### 3.4 Regla de salida directa (en `registerStockMovementAction`)

Para `type = EXIT` desde "Nuevo movimiento":

1. Sin `movimientos:direct_exit` → *"No tenés permiso de salida directa: hacé un pedido de materiales."*
2. Algún material con `requires_approval` → *"Aceite 15W40 requiere aprobación: hacé un pedido de materiales."*
3. El motor registra la salida dentro de la transacción. Si `totalCost` supera `direct_exit_max_amount`, se lanza `DIRECT_EXIT_LIMIT` y se revierte: *"La salida suma $ 152.000 y el máximo de salida directa es $ 100.000: hacé un pedido de materiales."* El total sale del costo real del motor, no de una estimación.

Entradas, transferencias y ajustes no cambian.

### 3.5 Alta de pedido

- Valida materiales activos de la empresa y el destino. Usa la misma validación que la salida, que se extrae del motor a una función exportada.
- Numera `PED-` y crea el pedido en `PENDING_APPROVAL`.
- El total estimado (promedio vigente × cantidad) se calcula para mostrar, solo con `view_prices`. No se guarda.

## 4. Pantallas y permisos

### 4.1 Permisos

- `ACTIONS` suma `direct_exit` ("Salida directa"). `movimientos` lo suma a sus `allowedActions`.
- **Tab nueva `pedidos`** (`b0000000-0000-0000-0000-000000000007`), con estas acciones:
  - `view`: ver los pedidos propios;
  - `view_all_requests`: ver todos;
  - `create`: pedir;
  - `approve`: aprobar o rechazar;
  - `update`: entregar y cerrar.
- **Migración:**
  - `direct_exit` sobre `movimientos` para todo rol con `movimientos:create`, de sistema o de empresa (decisión del usuario);
  - la tab `pedidos` con sus permisos solo para los 3 roles de sistema.

### 4.2 Sección "Pedidos"

- DataTable a cargo de `table-expert`, con estas columnas:
  - número;
  - estado (faceted);
  - solicitante;
  - destino (tipo y tenedor);
  - fecha;
  - avance: líneas completamente entregadas sobre el total de líneas ("2 / 3");
  - quién decidió.
- Sin `view_all_requests`, la consulta filtra por `requested_by` en el servidor. Un aprobador o el almacén necesitan `view_all_requests` para encontrar los pedidos de otros. La migración se lo da a los 3 roles de sistema; en los roles propios se asigna a mano junto con `approve` o `update`.
- El botón "Nuevo pedido" aparece con `create`.

### 4.3 Pantallas propias

- **Nuevo pedido** (`/dashboard/warehouse/requests/new`): destino (los mismos `DestinationFields` de la salida), líneas con material y cantidad, y observaciones. Con `view_prices` muestra el total estimado.
- **Detalle del pedido** (`/dashboard/warehouse/requests/[id]`):
  - cabecera con estado, solicitante, destino y decisión;
  - líneas con lo pedido, lo entregado y lo pendiente;
  - entregas con link a cada salida.
  - Acciones según estado y permiso:
    - Aprobar;
    - Rechazar (motivo);
    - Entregar;
    - Cerrar (motivo);
    - Cancelar (solo el solicitante, mientras está pendiente).
- **Entregar:** un formulario con depósito, fecha y, por línea pendiente, la cantidad (por defecto lo pendiente), más el lote (con los vencidos deshabilitados) o las unidades. Reutiliza las piezas de `MovementLineRow`.
- **Nuevo movimiento:** si el usuario no tiene `direct_exit`, el tipo Salida muestra un aviso con link a Nuevo pedido.
- **Configuración:** suma el bloque "Salida directa" con el monto máximo. Se guarda con `config-almacen:update`.
- **Detalle de movimiento:** una entrega muestra "Entrega del pedido PED-xxxxxx" con su link.

## 5. Tests

- **Unitarios:** la máquina de estados (transiciones válidas e inválidas, y el recálculo por entregas).
- **Integración del motor:**
  - entrega parcial y total, con el estado recalculado;
  - sobreentrega rechazada;
  - entrega de un pedido no aprobado, rechazada;
  - la entrega sale al costo promedio, imputada al destino del pedido;
  - anular una entrega devuelve lo pendiente y el estado;
  - un pedido cerrado sigue cerrado al anular una entrega;
  - concurrencia: dos entregas simultáneas de lo último pendiente, de las que pasa exactamente una.
- **Integración de actions** (con mocks de permisos, como el test de precios): las tres condiciones de la salida directa, incluido el límite de monto con el total real y la reversión.
- **pgTAP:** CHECK de destino del pedido, `material_request_id` solo en `EXIT` y cantidades positivas.
- **Navegador:** pedir, aprobar, entregar en dos partes, anular una entrega, cerrar y rechazar; una salida directa bloqueada por monto o por material, con el aviso que lleva al pedido.

## 6. Demo

`scripts/demo/domains/warehouses.ts` suma pedidos en todos los estados: uno pendiente, uno aprobado sin entregar, uno entregado en parte, uno entregado, uno rechazado y uno cerrado. Las entregas siguen la regla del libro en memoria. También fija un monto de salida directa para la empresa demo y marca `requires_approval` en el detector multigás.

## 7. Fuera de alcance

- Avisos por mail o notificaciones de pedidos pendientes.
- Aprobación en dos niveles.
- Editar un pedido ya creado (se cancela y se rehace).
- Pedidos de compra a proveedores (módulo Compras).
