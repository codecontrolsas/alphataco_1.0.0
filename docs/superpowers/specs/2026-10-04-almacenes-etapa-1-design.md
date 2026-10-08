# Almacenes — Etapa 1: núcleo de inventario

**Fecha:** 2026-10-04
**Estado:** diseño aprobado por secciones, pendiente de revisión de la spec escrita

## 1. Contexto y objetivo

El sistema no tiene gestión de inventario. Lo más cercano:

- **Ropa de trabajo** tiene catálogo y entregas a empleados con firma, pero ni cantidades, ni stock, ni costos.
- **Cubiertas** se llevan por número de serie con su ciclo de vida, pero sin costo ni ubicación ("disponible" = no montada en un vehículo).
- **Mantenimiento** no registra repuestos: el enum `repair_state.Esperando_repuestos` existe pero ninguna columna lo usa.
- **Proveedores** no existen.

El objetivo del módulo **Almacenes** es un **inventario general de la empresa**: varios depósitos, cualquier tipo de material, con entradas, salidas, transferencias y ajustes, valorizado a costo promedio ponderado.

Criterio de éxito: en cualquier momento se puede responder qué hay, en qué depósito, cuánto vale, y cada salida queda imputada con su costo a un destino concreto (empleado, equipo, orden de mantenimiento o cliente/contrato).

### 1.1 Plan general por etapas

El alcance completo se divide en etapas, cada una con su propio ciclo spec → plan → implementación:

| Etapa | Alcance |
| ----- | ------- |
| **1 (esta spec)** | Núcleo: catálogo, depósitos, movimientos, saldos, costo promedio, destinos de imputación |
| 2 | Serializados y lotes: préstamo/devolución de herramientas ("quién tiene qué"), avisos de vencimiento |
| 3 | Pedidos con aprobación (regla triple: permiso del usuario, material crítico, monto) |
| 4 | Integración con Mantenimiento: consumo de repuestos desde las órdenes |
| 5 | Integración con Ropa de trabajo: las entregas descuentan stock |
| 6 | Integración con Cubiertas: ubicación en depósito, costo, movimientos al instalar/desinstalar |

Después: **Compras** (proveedores, órdenes de compra, recepciones que generan entradas con costo).

### 1.2 Decisiones de base

- **Enfoque A**: movimientos inmutables + saldos materializados actualizados en la misma transacción. Los módulos existentes (Ropa, Cubiertas, Mantenimiento) conservan sus tablas y flujos y en sus etapas sólo llaman al motor de stock.
- **Costo promedio ponderado por material, a nivel empresa** (no por depósito). Las transferencias no alteran el costo.
- **Una sola moneda**: la de la empresa. Multimoneda, si hace falta, la resuelve Compras.
- **Stock nunca negativo.**
- **Todo filtrado por `company_id`.**

## 2. Modelo de datos

Nombres en inglés (regla `code-language`). Todas las tablas llevan `company_id` (FK a `company`), `created_at` y, las editables, `updated_at`. UUIDs con `gen_random_uuid()`. Cantidades y costos `Decimal(15,4)`.

### 2.1 Catálogos

**`warehouses`** — depósitos.

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `code` | text | único por empresa |
| `name` | text | único por empresa |
| `address` | text? | |
| `manager_employee_id` | uuid? | FK `employees` |
| `is_active` | bool | default `true` |

**`material_categories`** — un solo nivel. `name` único por empresa, `is_active`.

**`measurement_units`** — `name`, `abbreviation` (ambos únicos por empresa), `is_active`. El seed carga por empresa: Unidad (u), Litro (l), Kilogramo (kg), Metro (m), Par (par), Caja (caja).

**`materials`**

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `code` | text | único por empresa |
| `name` | text | |
| `description` | text? | |
| `category_id` | uuid? | FK `material_categories` |
| `unit_id` | uuid | FK `measurement_units` |
| `tracking_type` | enum `material_tracking_type` | `QUANTITY` · `SERIAL` · `BATCH`. **No editable** una vez que el material tiene movimientos |
| `requires_approval` | bool | default `false`. Se persiste en etapa 1, se usa en etapa 3 |
| `min_stock` | decimal? | stock mínimo a nivel empresa (suma de depósitos) |
| `average_cost` | decimal | default `0`. Sólo lo escribe el motor de stock |
| `is_active` | bool | default `true` |

### 2.2 Stock

**`material_batches`** — `material_id`, `batch_number`, `expires_at date?`. Único `(material_id, batch_number)`.

**`material_units`** — unidades serializadas.

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `material_id` | uuid | FK `materials` (con `tracking_type = SERIAL`) |
| `serial_number` | text | único `(material_id, serial_number)` |
| `status` | enum `material_unit_status` | `IN_STOCK` · `OUT` · `DISCARDED` |
| `warehouse_id` | uuid? | lleno sólo si `IN_STOCK` (CHECK) |
| `last_movement_id` | uuid? | FK `stock_movements`; indica dónde/quién la tiene |

**`stock_balances`** — saldo materializado.

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `material_id` | uuid | |
| `warehouse_id` | uuid | |
| `batch_id` | uuid? | lleno sólo para materiales `BATCH` |
| `quantity` | decimal | `CHECK (quantity >= 0)` |

Único `(material_id, warehouse_id, batch_id)` con `NULLS NOT DISTINCT` (Postgres 16). Sólo lo escribe el motor de stock.

### 2.3 Movimientos (inmutables)

**`stock_movements`** — cabecera.

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `number` | text | `MOV-000001`, correlativo por empresa, único `(company_id, number)` |
| `type` | enum `stock_movement_type` | `ENTRY` · `EXIT` · `TRANSFER` · `ADJUSTMENT` |
| `warehouse_id` | uuid | depósito origen (o destino, en entradas) |
| `target_warehouse_id` | uuid? | sólo `TRANSFER`; distinto de `warehouse_id` (CHECK) |
| `occurred_on` | date | fecha del hecho (editable al cargar, default hoy). Dentro del mismo día, el orden lo da `created_at` |
| `reference` | text? | remito, factura, etc. |
| `notes` | text? | obligatorio en `ADJUSTMENT` y en anulaciones (validación en el motor) |
| `destination_type` | enum `stock_destination_type`? | sólo `EXIT`: `EMPLOYEE` · `VEHICLE` · `OTHER_EQUIPMENT` · `MAINTENANCE_ORDER` · `CUSTOMER` |
| `employee_id` | uuid? | FK `employees` |
| `vehicle_id` | uuid? | FK `vehicles` |
| `other_equipment_id` | uuid? | FK `other_equipment` |
| `maintenance_order_id` | uuid? | FK `maintenance_orders` |
| `customer_id` | uuid? | FK `customers` |
| `customer_service_id` | uuid? | FK `customer_services`; opcional, sólo con `customer_id` |
| `reverses_movement_id` | uuid? | FK `stock_movements`, **único** (una anulación por movimiento) |
| `total_cost` | decimal | suma de las líneas |
| `created_by` | uuid | profile del usuario |

CHECKs:
- `EXIT` ⇔ `destination_type IS NOT NULL`. Vale también para anulaciones: la anulación de una salida es de tipo `EXIT` y conserva el destino (§3.5).
- Exactamente la FK correspondiente a `destination_type` está llena y las demás de destino son `NULL` (`customer_service_id` acompaña a `CUSTOMER`).
- `target_warehouse_id IS NOT NULL` ⇔ `type = TRANSFER`.

**`stock_movement_lines`**

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `movement_id` | uuid | FK, cascade |
| `material_id` | uuid | |
| `quantity` | decimal | `> 0`. En `ADJUSTMENT` el signo lo da `direction` |
| `direction` | smallint | efecto sobre el saldo de `warehouse_id`: `+1` entra, `-1` sale. `ENTRY` = `+1`, `EXIT` y `TRANSFER` = `-1` (el destino de la transferencia recibe el opuesto), `ADJUSTMENT` = el elegido. En una anulación, el opuesto de la línea original |
| `unit_cost` | decimal | costo aplicado a la línea |
| `total_cost` | decimal | `quantity × unit_cost` |
| `batch_id` | uuid? | obligatorio si el material es `BATCH` |
| `unit_id` | uuid? | obligatorio si el material es `SERIAL`; entonces `quantity = 1` |

Índices: `stock_movements (company_id, occurred_on, created_at)`, `stock_movement_lines (material_id)`, y los de cada FK de destino.

## 3. Motor de stock

### 3.1 Punto único de escritura

`src/features/Warehouses/lib/stock-engine.ts` (`server-only`) expone:

```ts
registerStockMovement(tx: Prisma.TransactionClient, input: StockMovementInput): Promise<RegisteredMovement>
reverseStockMovement(tx: Prisma.TransactionClient, movementId: string, reason: string): Promise<RegisteredMovement>
```

Es la **única** pieza que escribe `stock_balances`, `material_units`, `material_batches` (alta) y `materials.average_cost`. Recibe la transacción del llamador para que las integraciones futuras (Ropa, Cubiertas, Mantenimiento, Compras) confirmen su operación y el movimiento de stock juntos. `StockMovementInput` es una unión discriminada por `type`; el tipo se valida además con Zod en las server actions.

### 3.2 Secuencia dentro de la transacción

1. **Bloqueo**: `SELECT … FOR UPDATE` sobre las filas de `materials` y `stock_balances` involucradas, **ordenadas por id** (evita deadlocks). Las filas de saldo inexistentes se crean con `INSERT … ON CONFLICT DO NOTHING` antes de bloquear.
2. **Validación**: material activo y de la empresa; depósitos activos y de la empresa; cantidades `> 0`; reglas por `tracking_type` (§3.4); stock suficiente en el depósito/lote/unidad.
3. **Costeo** (§3.3).
4. **Escritura**: cabecera, líneas, saldos, unidades/lotes, `average_cost`.
5. **Numeración**: `MOV-` con `pg_advisory_xact_lock` + `MAX()+1`, igual que `order-numbering.ts` de Mantenimiento.
6. **Actor**: la transacción corre bajo `withActor`; `created_by` es el profile de la sesión.

### 3.3 Costeo

Sea `Q` el stock total del material en la empresa (todos los depósitos) y `C` su `average_cost` antes del movimiento.

| Tipo | `unit_cost` de la línea | Nuevo `average_cost` |
| ---- | ----------------------- | -------------------- |
| `ENTRY` | el informado por el usuario (obligatorio, `>= 0`) | `Q <= 0` → `c`; si no, `(Q·C + q·c) / (Q + q)` |
| `EXIT` | `C` | sin cambio |
| `TRANSFER` | `C` | sin cambio |
| `ADJUSTMENT +` | `C` | sin cambio |
| `ADJUSTMENT −` | `C` | sin cambio |

Redondeo del promedio a 4 decimales. Varias líneas del mismo material en una entrada se aplican en orden.

### 3.4 Reglas por tipo de control

- **`QUANTITY`**: sin lote ni unidad.
- **`BATCH`**: `batch_id` obligatorio en salidas, transferencias y ajustes negativos. En entradas y ajustes positivos se informa `batch_number` (+ `expires_at`): si el lote existe se reutiliza; si existe con otra fecha de vencimiento, se rechaza.
- **`SERIAL`**: una línea por unidad, `quantity = 1`.
  - Entrada / ajuste positivo: se informan números de serie nuevos → se crean en `IN_STOCK` en el depósito. Un número ya existente se rechaza.
  - Salida: la unidad debe estar `IN_STOCK` en el depósito → `OUT`, `warehouse_id = NULL`.
  - Transferencia: `IN_STOCK` en origen → cambia `warehouse_id`.
  - Ajuste negativo: `IN_STOCK` → `DISCARDED`.
  - En todos los casos se actualiza `last_movement_id`.

Sugerencia de lote en la UI de salida: primero el de vencimiento más próximo (FEFO); el usuario puede elegir otro.

### 3.5 Anulación

`reverseStockMovement` crea un movimiento nuevo con `reverses_movement_id` = original, mismo `type`, mismas líneas con efecto inverso y **el `unit_cost` original de cada línea**:

- Anular una **salida**: reingresa al depósito a su costo original y recalcula el promedio como una entrada. Las unidades serializadas vuelven a `IN_STOCK`. El movimiento de anulación conserva el destino del original, así el costo imputado al destino se compensa.
- Anular una **entrada**: retira la cantidad a su costo original; nuevo promedio `(Q·C − q·c) / (Q − q)` (si `Q − q = 0`, el promedio queda en su último valor). Si el stock actual no alcanza (ya se consumió), se rechaza.
- Anular **transferencias y ajustes**: efecto inverso a costo original; sujeto a stock suficiente.
- No se puede anular una anulación ni anular dos veces el mismo movimiento (índice único).
- El motivo es obligatorio y queda en `notes`.

### 3.6 Errores

El motor lanza `StockError` con `code` (`INSUFFICIENT_STOCK`, `INACTIVE_MATERIAL`, `INVALID_TRACKING`, `BATCH_EXPIRY_MISMATCH`, `DUPLICATE_SERIAL`, `UNIT_NOT_AVAILABLE`, `ALREADY_REVERSED`, `CANNOT_REVERSE_REVERSAL`, …) y un mensaje para el usuario con datos concretos, p. ej. *"Stock insuficiente de Aceite 15W40 en Depósito Base: hay 12 l, se pidieron 20 l"*.

Las server actions **devuelven** `ActionResult` (`{ ok: true, data } | { ok: false, error }`, el mismo tipo de Comercial) en lugar de lanzar: en producción Next.js reemplaza el mensaje de un error lanzado desde una server action por uno genérico, y el mensaje con datos no llegaría al usuario. La action captura `StockError` → `fail(error.message)`; cualquier otro error se loguea (`Logger`) y devuelve un mensaje genérico (nunca el mensaje crudo de Prisma/SQL). En el cliente, el `mutationFn` de `useMutation` convierte `!result.ok` en un `Error`, de modo que `onError` muestra el toast y `onSuccess` sólo corre ante un éxito real — nunca un toast de éxito sobre una operación fallida.

## 4. Pantallas, permisos y navegación

### 4.1 Estructura

Feature en `src/features/Warehouses/`, página delgada en `src/app/dashboard/warehouse/`. Cada tab en su subcarpeta con `TabContent` server component, client component interno y skeleton en `fallback/`.

| Tab (slug) | Contenido | Acciones |
| ---------- | --------- | -------- |
| Stock (`stock`) | DataTable de `stock_balances`: material, código, categoría, depósito, lote, vencimiento, cantidad, unidad, indicador "bajo mínimo"; costo promedio y valorizado sólo con `view_prices`. Click → detalle de material | `view`, `view_prices` |
| Movimientos (`movimientos`) | DataTable de `stock_movements`: número, tipo, fecha, depósito(s), destino, referencia, total (sólo con `view_prices`), creado por. Botón "Nuevo movimiento". Click → detalle | `view`, `create`, `adjust`, `reverse`, `view_prices` |
| Materiales (`materiales`) | DataTable + alta/edición. Con movimientos: no se borra, se desactiva; `tracking_type` bloqueado | `view`, `create`, `update`, `delete` |
| Depósitos (`depositos`) | DataTable + alta/edición, mismo criterio de desactivación (no se desactiva con stock > 0) | `view`, `create`, `update`, `delete` |
| Configuración (`config-almacen`) | Categorías y unidades de medida, dos bloques en la misma pantalla | `view`, `create`, `update`, `delete` |

### 4.2 Pantallas fuera de tabs

- **Nuevo movimiento** — `/dashboard/warehouse/movements/new`. Un único form (React Hook Form + Zod, componentes shadcn): tipo → campos dependientes (depósito, depósito destino, bloque destino con tipo + combobox; empleados como `[legajo] Apellido Nombre`), fecha con escritura directa, referencia, notas; grilla de líneas con material (combobox con código), cantidad, costo (sólo entradas) y, según `tracking_type`, lote o números de serie. Un solo botón de guardar. `ADJUSTMENT` sólo visible con `adjust`. Muestra stock disponible por línea antes de confirmar.
- **Detalle de movimiento** — `/dashboard/warehouse/movements/[id]`: cabecera, destino, líneas, vínculo a la anulación (o al original). Botón **Anular** con `reverse`, confirmación por `AlertDialog` con motivo obligatorio.
- **Detalle de material** — `/dashboard/warehouse/materials/[id]`: datos, stock por depósito (y por lote / unidades), y **kardex**: movimientos del material con saldo acumulado y, con `view_prices`, costo unitario y promedio resultante.

Todos los `<Button>` dentro de forms que no guardan llevan `type="button"`.

Opciones de los destinos: sólo empleados, vehículos y otros equipos **activos**; sólo órdenes de mantenimiento **abiertas** (excluye `completed` y `rejected`); clientes activos y, en cascada, sus contratos. Los buscadores de materiales y empleados filtran en el servidor con tope de resultados y aviso "Mostrando X de Y" fuera del área scrolleable.

### 4.3 Permisos y navegación

- Módulo `almacenes` en `permissions-map.ts` con `moduleId` y `tabId` fijos (prefijo `b0000000-…`).
- Acciones nuevas en `ACTIONS`: `adjust` ("Ajustar stock") y `reverse` ("Anular movimiento").
- Migración Prisma (`INSERT … ON CONFLICT`) con: módulo, tabs, acciones nuevas y `role_permissions` **sólo** para `admin`, `administrador` y `full-access-provisional`. El seed (`scripts/seed-company.ts`) los toma del mapa.
- Sidebar: entrada "Almacenes" en `navigation.ts`, ícono `Boxes`, con los tabs de primer nivel.
- Todos los botones de crear/editar/ajustar/anular protegidos por permisos; en tablas, los permisos llegan del server como prop.

### 4.4 DataTables

Todas con el `DataTable` de `shared/components/common/DataTable`: client-side mode (`queryFn`), facets lazy (`fetchFacet`), un filtro por columna según `datatable-filters.md`, export Excel con formatters, `paramNamespace`/`tableId`, skeleton dedicado. Se implementan con el agente `table-expert`.

### 4.5 Demo

La instancia demo (reset nocturno, `scripts/demo/`) incluye Almacenes: `scripts/demo/domains/warehouses.ts` con depósitos, categorías, unidades, materiales de los tres `tracking_type` y movimientos variados de los cuatro tipos (incluida una anulación), generados **a través del motor de stock** para que saldos y costos sean coherentes; y el módulo visible para los roles demo (`scripts/demo/domains/users.ts`).

### 4.6 Convenciones

Enums de Postgres en snake_case como la mayoría del schema: `material_tracking_type`, `material_unit_status`, `stock_movement_type`, `stock_destination_type` (los valores quedan en mayúsculas como en la spec). Módulo montado con `SectionManagerServer`: cada "tab" de §4.1 es una sección del sidebar (`?tab=<slug>`).

## 5. Tests y verificación

- **Unitarios (vitest)**: fórmula de costo promedio (entrada con stock 0, entradas sucesivas, salida, anulación de entrada incl. caso `Q − q = 0`), validaciones por `tracking_type`, CHECK lógico de destinos en el schema Zod.
- **Integración (vitest contra el Postgres del compose)**: los cuatro tipos de movimiento de punta a punta; rechazo por stock insuficiente; anulaciones (incl. anular entrada ya consumida); concurrencia: dos salidas en paralelo por el último stock → exactamente una falla con `INSUFFICIENT_STOCK`; lotes (reutilización, vencimiento distinto) y serializados (duplicados, unidad no disponible).
- **pgTAP**: `CHECK quantity >= 0`, CHECK de destino único, CHECK de transferencia, unicidad de anulación, e invariante **saldo = Σ líneas** por material/depósito/lote.
- **Verificación en navegador**: un movimiento de cada tipo, tabla de stock y kardex coherentes, anulación. Hasta esa pasada el estado se reporta como "verificación visual pendiente".

## 6. Fuera de alcance de la etapa 1

- Préstamo/devolución con "quién tiene qué" y avisos de vencimiento → etapa 2 (las unidades y lotes ya entran y salen).
- Pedidos con aprobación y regla triple → etapa 3 (`requires_approval` existe pero no se usa).
- Integraciones con Mantenimiento, Ropa y Cubiertas → etapas 4–6.
- Proveedores, órdenes de compra, multimoneda → Compras.
- Alertas por mail de stock bajo mínimo (sólo indicador en la tabla).
- Inventario físico / conteo cíclico (se resuelve con ajustes).
