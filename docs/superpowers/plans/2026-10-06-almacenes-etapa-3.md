# Almacenes — Etapa 3 (pedidos con aprobación) — Plan de implementación

**Spec:** `docs/superpowers/specs/2026-10-06-almacenes-etapa-3-design.md` (fuente de verdad).
**Base:** rama `feat/almacenes-etapa-1` (etapas 1 y 2 commiteadas: `e54fe093`, `4820791e`). Las restricciones globales y el criterio de "tarea terminada" son los del plan de la etapa 1.

## Notas que condicionan el orden

- El enum nuevo `material_request_status` se crea con `CREATE TYPE`, que sí se puede usar en la misma migración: no hay `ADD VALUE`, así que alcanza con una migración.
- **IDs:** la tab `pedidos` usa `b0000000-0000-0000-0000-000000000007`. Se verifica libre contra la base, y el test de IDs únicos lo cubre.
- **Orden de locks nuevo:** `movimiento original` → `pedido` → `materials` → `stock_balances` → `material_units` → numeración (spec §3.3). Se documenta en el encabezado del motor.

---

### Task 1: Esquema, migración y permisos

**Files:**
- Modify: `prisma/schema.prisma`:
  - enum `material_request_status`;
  - modelos `material_requests`, `material_request_lines` y `warehouse_settings`;
  - `stock_movements.material_request_id` y `stock_movement_lines.request_line_id`;
  - relaciones inversas (incluidas `profile` y los destinos).
- Create: `prisma/migrations/20261006120000_warehouse_material_requests/migration.sql`:
  - tablas, FK e índices;
  - CHECK de destino del pedido (los mismos que la salida, con el destino obligatorio);
  - CHECK de `quantity > 0` en las líneas;
  - CHECK `stock_movements_request_check` (`material_request_id` solo en `EXIT`);
  - la acción `direct_exit`;
  - `direct_exit` sobre `movimientos` para todo rol con `movimientos:create`;
  - la tab `pedidos` (`WHERE EXISTS` del módulo) con permisos solo para los 3 roles de sistema.
- Modify: `permissions-map.ts`:
  - `ACTIONS.direct_exit`;
  - `movimientos.allowedActions` suma `direct_exit`;
  - tab `pedidos` con `view`, `view_all_requests`, `create`, `approve` y `update`.
- Modify: `navigation.ts` (ítem "Pedidos" con el ícono `ClipboardList`, entre Préstamos y Materiales).
- Modify: `prisma/tests/02_warehouses.sql`. Casos nuevos:
  - pedido sin destino;
  - `material_request_id` en un `ENTRY`;
  - línea con cantidad 0.

**Verificación:** `db:deploy`, `generate`, `psql`, `migrate diff` sin drift nuevo, `test:db` y `npm test`.

### Task 2: Lógica pura

**Files:**
- Create: `src/features/Warehouses/lib/request-state-machine.ts` + `.test.ts`:
  - transiciones permitidas por acción;
  - `statusAfterDeliveries(lines: {requested, delivered}[])`.
- Modify: `lib/labels.ts` (`REQUEST_STATUS_LABELS`) y `lib/stock-errors.ts` (`OVER_DELIVERY`, `DIRECT_EXIT_LIMIT`, `INVALID_STATE`).
- Create: `src/features/Warehouses/schemas/requests.ts`: alta (destino y líneas), decisión (rechazo con motivo), cierre (motivo), entrega (depósito, fecha y líneas con lote o unidades) y monto de salida directa.

### Task 3: Motor y pedidos (servidor)

**Files:**
- Modify: `src/features/Warehouses/lib/stock-engine.ts`:
  - exportar `validateExitDestination` (la validación de destino, generalizada);
  - camino interno de registro que acepta los vínculos de pedido;
  - `registerRequestDelivery` (spec §3.2);
  - en `reverseStockMovement`, si el original es una entrega: lockear el pedido después del original, copiar los vínculos y recalcular el estado.
- Create: `src/features/Warehouses/lib/requests.ts` (`server-only`):
  - `lockRequest`;
  - `deliveredByLine(tx, requestId)`;
  - `recomputeRequestStatus`.
- Create: `src/features/Warehouses/lib/request-numbering.ts` + `.test.ts` (`PED-000001`).
- Modify: `stock-engine.integration.test.ts`. Casos de spec §5:
  - entrega parcial y total;
  - sobreentrega;
  - pedido no aprobado;
  - costo y destino de la entrega;
  - anulación de una entrega, con el estado recalculado;
  - un pedido cerrado sigue cerrado;
  - concurrencia de dos entregas por lo último pendiente;
  - el kardex coincide con el motor.

### Task 4: Server actions

**Files:**
- Create: `src/features/Warehouses/actions/requests.server.ts`:
  - `createMaterialRequestAction`;
  - `approveRequestAction` y `rejectRequestAction` (`approve`);
  - `cancelRequestAction` (solo el solicitante);
  - `closeRequestAction` y `deliverRequestAction` (`update`);
  - `getMaterialRequestDetail`, que exige `view_all_requests` salvo para el solicitante;
  - `getRequestDeliveryOptions`.
- Create: `src/features/Warehouses/actions/settings.server.ts`: `getDirectExitSettings` y `updateDirectExitLimitAction` (`config-almacen:update`).
- Modify: `actions/movements.server.ts`. Regla de salida directa (spec §3.4): el permiso, `requires_approval`, y el monto contra el total real del motor, con reversión.
- Modify: `actions/movements.server.ts`. El detalle incluye `materialRequest` (número y link).
- Create: `src/features/Warehouses/actions/direct-exit.integration.test.ts`. Prueba las tres condiciones con mocks de permisos, como el test de precios. Se suma a `scripts/test-warehouses.sh`.

### Task 5: Tabla de Pedidos (agente `table-expert`)

**Files:** `src/features/Warehouses/Requests/components/RequestsList/`, con la query key `WAREHOUSE_QUERY_KEYS.requests`.

- **Filtro por usuario:** sin `view_all_requests`, solo los pedidos propios (en el servidor).
- **Columnas:**
  - número (link al detalle);
  - estado (faceted, `REQUEST_STATUS_LABELS`);
  - solicitante;
  - tipo de destino y destino;
  - fecha;
  - avance (líneas completas sobre el total);
  - quién decidió.

### Task 6: Pantallas

**Files:**
- Create: `Requests/RequestsTabContent.tsx`, `app/dashboard/warehouse/requests/new/page.tsx` y `app/dashboard/warehouse/requests/[id]/page.tsx`.
- Create: en `Requests/components/`:
  - `NewRequestForm.tsx`, que reutiliza `DestinationFields` y el buscador de materiales;
  - `RequestDetail.tsx`;
  - `RequestDecisionDialogs.tsx` (aprobar, rechazar, cerrar y cancelar);
  - `DeliverRequestForm.tsx`, que reutiliza la lógica de lotes y unidades de `MovementLineRow`, extraída si hace falta.
- Modify: `WarehousesComponent.tsx` (sección `pedidos`) y `lib/query-keys.ts`.
- Modify: `Movements/components/NewMovementForm.tsx`. En el tipo Salida, sin `direct_exit`, muestra un aviso con link a Nuevo pedido; el permiso llega como prop desde la página.
- Modify: `Settings/components/SettingsPanel.tsx`. Bloque "Salida directa" con el monto máximo.
- Modify: `Movements/components/MovementDetail.tsx` ("Entrega del pedido PED-…").

### Task 7: Demo

**File:** `scripts/demo/domains/warehouses.ts`.
- Pedidos en todos los estados, con las entregas hechas por el libro en memoria y vinculadas a las líneas.
- `warehouse_settings` con un monto.
- El detector multigás con `requires_approval`.
- Se verifica con el arnés en transacción descartada.

### Task 8: Verificación final

- `check-types`, `npm test`, `test:db`, `test:warehouses` y `test:jobs`.
- En el navegador:
  - pedir, aprobar, entregar en dos partes, anular una entrega, cerrar, rechazar y cancelar;
  - salida directa bloqueada por permiso, por material y por monto, con el aviso que lleva al pedido.
- Revisión de calidad (correctitud, y convenciones con simplicidad) antes de proponer el commit.
