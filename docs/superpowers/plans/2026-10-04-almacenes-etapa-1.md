# Almacenes — Etapa 1 (núcleo de inventario) — Plan de implementación

**Goal:** Módulo `almacenes` con catálogo de materiales, depósitos, movimientos inmutables (entrada, salida, transferencia, ajuste, anulación), saldos materializados y costo promedio ponderado, con salidas imputadas a empleado, vehículo, otro equipo, orden de mantenimiento o cliente/contrato.

**Spec:** `docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md` (fuente de verdad; este plan no la repite).

**Architecture:** Enfoque A — un único motor (`src/features/Warehouses/lib/stock-engine.ts`, `server-only`) es el único escritor de saldos, unidades, lotes y costo promedio; recibe el `tx` de `withActor`. Lógica pura (costo, validaciones) separada y testeada. Server actions devuelven `ActionResult`. Módulo montado con `SectionManagerServer`.

**Tech Stack:** Prisma 7 (Postgres 16 del compose), Zod, React Hook Form, React Query 5, shadcn/ui, Vitest, pgTAP.

## Restricciones globales

- Reglas del repo: sin `any`; `Logger`, no `console.*`; moment, no date-fns; sin `useEffect` para fetch; sin diálogos nativos; código en inglés, UI en español; nada de prettier/eslint; commits sólo cuando el usuario lo pida, una línea, sin Co-Authored-By.
- Perímetro: toda action chequea `checkPermissionServer('almacenes', <tab>, <action>)` antes de leer/escribir; la empresa sale de `getActiveCompanyId()`; todo `where` lleva `company_id`; todo id recibido del cliente (material, depósito, destino, movimiento) se verifica contra la empresa activa.
- Costos: sin `view_prices`, `average_cost`, `unit_cost`, `total_cost` y valorizado **no salen del servidor** (se omiten del `select`), además de ocultarse en UI.
- Decimales: `Prisma.Decimal` en el servidor, string hacia el cliente. Nunca `number` para cantidades o costos persistidos.
- Errores: el motor lanza `StockError`; las actions devuelven `fail(message)` para `StockError` y un mensaje genérico para el resto (logueado). El cliente usa `useMutation` con un `mutationFn` que convierte `!ok` en `Error`.
- Orden de locks único en el motor: `materials` (por id) → `stock_balances` (por id) → `material_units` (por id) → advisory lock de numeración.
- DataTables: delegadas al agente `table-expert` (regla del repo).
- Migraciones: carpeta manual + `npm run db:deploy` contra el compose; CHECKs e índice `NULLS NOT DISTINCT` escritos a mano; nunca `migrate dev`. Aplicar en dev está autorizado (alcance validado por la spec).

## Criterio de "task terminada"

1. `npm run check-types` verde.
2. `npm test` verde (y `npm run test:db` / `bash scripts/test-warehouses.sh` cuando la task toca base o motor).
3. Sin `any`, `console.*`, `date-fns` en archivos tocados (grep).
4. Pantallas: verificadas en navegador (si no, se reporta "verificación visual pendiente").

---

### Task 1: Schema y migración de tablas

**Files:**
- Modify: `prisma/schema.prisma` (4 enums, 8 modelos, relaciones inversas en `company`, `employees`, `vehicles`, `other_equipment`, `maintenance_orders`, `customers`, `customer_services`, `profile`)
- Create: `prisma/migrations/20261004100000_warehouses_core/migration.sql`
- Create: `prisma/tests/02_warehouses.sql`

**Pasos:**
- [ ] Modelos `warehouses`, `material_categories`, `measurement_units`, `materials`, `material_batches`, `material_units`, `stock_balances`, `stock_movements`, `stock_movement_lines` según spec §2. Enums `material_tracking_type`, `material_unit_status`, `stock_movement_type`, `stock_destination_type`.
- [ ] `stock_balances`: en el schema sólo `@@index([material_id, warehouse_id])`; la unicidad va a mano en SQL (`CREATE UNIQUE INDEX ... NULLS NOT DISTINCT`) para que `migrate diff` no reporte drift.
- [ ] `migrate diff --from-config-datasource --to-schema` → copiar sólo lo de Almacenes (ignorar drift de columnas GENERATED).
- [ ] Sección final "Lo que Prisma no sabe expresar": índice `NULLS NOT DISTINCT`; `UNIQUE (reverses_movement_id)`; CHECKs: `stock_balances_quantity_check`, `stock_movement_lines_quantity_check` (`> 0`), `stock_movement_lines_direction_check` (`IN (-1, 1)`), `stock_movements_transfer_check`, `stock_movements_exit_destination_check`, `stock_movements_single_destination_check`, `stock_movements_customer_service_check`, `material_units_warehouse_check`.
- [ ] `npm run db:deploy`, `npx prisma generate`, verificar con `psql \d`.
- [ ] pgTAP `02_warehouses.sql`: `has_table` ×9, `throws_ok(..., '23514')` por cada CHECK, unicidad de `reverses_movement_id` y del saldo con `batch_id NULL` (dos inserts → `23505`).
- [ ] `npm run test:db` verde.

### Task 2: Permisos, módulo y navegación

**Files:**
- Modify: `src/features/Permissions/permissions-map.ts` (ACTIONS `adjust`, `reverse`; módulo `almacenes` con tabs `stock`, `movimientos`, `materiales`, `depositos`, `config-almacen`, ids `b0000000-…`)
- Modify: `src/shared/constants/module-icons.ts` (`almacenes: Boxes`)
- Modify: `src/features/Layout/sidebar/constants/navigation.ts` (entrada con `items`, `position` y renumeración, `SUB_ITEM_ICONS`)
- Modify: `scripts/seed-company.ts` (unidades de medida default por empresa, upsert con `update: {}`)
- Create: `prisma/migrations/20261004110000_warehouses_module_permissions/migration.sql` (acciones con `ON CONFLICT`, módulo, tabs con `WHERE EXISTS`, `role_permissions` sólo para los 3 roles; unidades default para las empresas existentes)

**Pasos:**
- [ ] Mapa + íconos + sidebar; `check-types` (obliga a completar `MODULE_ICONS`).
- [ ] Migración y seed; `npm run db:deploy`; verificar tabs y permisos con `psql`.
- [ ] `npm test` (incluye `scripts/seed/permission-rows.test.ts`) y `npm run test:db` (`01_permissions.sql` sigue verde).

### Task 3: Lógica pura y schemas

**Files:**
- Create: `src/features/Warehouses/lib/average-cost.ts` + `.test.ts`
- Create: `src/features/Warehouses/lib/stock-errors.ts` (`StockError`, `StockErrorCode`)
- Create: `src/features/Warehouses/schemas/stock-movement.ts` (sin directiva; schema plano del form + `superRefine` por `tracking_type` y tipo; `toStockMovementInput()` a la unión discriminada) + `.test.ts`
- Create: `src/features/Warehouses/schemas/catalog.ts` (materiales, depósitos, categorías, unidades)

**Interfaces:**
```ts
// lib/average-cost.ts — puro, sin server-only
export function averageCostAfterEntry(q: Decimal, c: Decimal, qIn: Decimal, cIn: Decimal): Decimal;
export function averageCostAfterEntryReversal(q: Decimal, c: Decimal, qOut: Decimal, cOut: Decimal): Decimal;
```

**Pasos:**
- [ ] Tests primero: stock 0, entradas sucesivas, redondeo a 4 decimales, anulación con `Q − q = 0`.
- [ ] Tests del schema: serial con `quantity ≠ 1`, batch sin lote, entrada sin costo, salida sin destino, transferencia al mismo depósito, ajuste sin motivo.

### Task 4: Motor de stock

**Files:**
- Create: `src/features/Warehouses/lib/stock-engine.ts` (`server-only`)
- Create: `src/features/Warehouses/lib/movement-numbering.ts` (`nextStockMovementNumber`, mismo patrón que `order-numbering.ts`) + `.test.ts` (fakeTx: lock antes del `MAX`)
- Create: `src/features/Warehouses/lib/stock-engine.integration.test.ts`
- Create: `scripts/test-warehouses.sh`; Modify: `package.json` (`test:warehouses`), `.github/workflows/ci.yml` (job `db-tests`)

**Interfaces:**
```ts
export async function registerStockMovement(tx: Prisma.TransactionClient, companyId: string, createdBy: string, input: StockMovementInput): Promise<RegisteredMovement>;
export async function reverseStockMovement(tx: Prisma.TransactionClient, companyId: string, createdBy: string, movementId: string, reason: string): Promise<RegisteredMovement>;
```

**Pasos:**
- [ ] Secuencia de spec §3.2 con el orden de locks global; `INSERT … ON CONFLICT DO NOTHING` de saldos antes del `FOR UPDATE`.
- [ ] Integración (rollback forzado, patrón `allocated-to.integration.test.ts`): entrada/salida/transferencia/ajuste, costo resultante, stock insuficiente con mensaje, lotes (reutiliza, vencimiento distinto), serializados (duplicado, no disponible, discard en ajuste −), anulaciones (salida, entrada consumida → rechazo, doble anulación, anular anulación), aislamiento entre dos empresas.
- [ ] Concurrencia (commit real + cleanup, patrón `jobs.integration.test.ts`): dos salidas paralelas por el último stock → exactamente una `INSUFFICIENT_STOCK`; saldo final correcto.
- [ ] Invariante saldo = Σ líneas verificada al final de la suite.

### Task 5: Server actions de catálogo

**Files:**
- Create: `src/features/Warehouses/actions/catalog.server.ts` (CRUD de depósitos, categorías, unidades, materiales; desactivar en vez de borrar con movimientos/stock; `tracking_type` bloqueado con movimientos)
- Create: `src/features/Warehouses/actions/options.server.ts` (buscadores: materiales, empleados con `file_number`, vehículos/otros equipos activos, órdenes abiertas, clientes y contratos; búsqueda server-side con tope)

**Pasos:**
- [ ] `ActionResult` (importado de `@/features/Empresa/Clientes/lib/action-result`), permisos por tab/acción, `revalidatePath`.
- [ ] Tests unitarios de las reglas de bloqueo (función pura).

### Task 6: Server actions de movimientos y lecturas

**Files:**
- Create: `src/features/Warehouses/actions/movements.server.ts` (`registerStockMovementAction`, `reverseStockMovementAction`, `getStockMovementById`)
- Create: `src/features/Warehouses/actions/materials-detail.server.ts` (`getMaterialStock`, `getMaterialKardex` con saldo acumulado por ventana SQL)
- Create: `src/features/Warehouses/lib/serializers.ts` (Decimal → string, omisión de costos sin `view_prices`)

**Pasos:**
- [ ] `ADJUSTMENT` exige `adjust`; anulación exige `reverse`; resto `create`.
- [ ] `withActor(profileId, tx => registerStockMovement(tx, …))` con `timeout` ampliado; toast de éxito con número, líneas y total (total sólo con `view_prices`).

### Task 7: Shell del módulo

**Files:**
- Create: `src/app/dashboard/warehouse/page.tsx`, `loading.tsx`
- Create: `src/features/Warehouses/WarehousesComponent.tsx` (`SectionManagerServer`, 5 secciones con `Suspense`)
- Create: `src/features/Warehouses/{Stock,Movements,Materials,Warehouses,Settings}/*TabContent.tsx` + `fallback/*Skeleton.tsx`

### Task 8: DataTables (agente `table-expert`)

Stock, Movimientos, Materiales, Depósitos: `List.tsx` + `_DataTable.tsx` + `columns.tsx` + `actions.server.ts` (paginado, export, `getXSingleFacet`), client-side mode, `fetchFacet`, columnas de costo condicionales a `view_prices` (y omitidas en el `select`), indicador "bajo mínimo" en Stock.

### Task 9: Formularios de catálogo y Configuración

**Files:** `Materials/components/MaterialFormDialog.tsx`, `Warehouses/components/WarehouseFormDialog.tsx`, `Settings/components/{CategoriesSection,UnitsSection}.tsx` — RHF + Zod (schemas de Task 3), `useMutation` + `invalidateQueries`, `PermissionGuard`/permisos del server.

### Task 10: Nuevo movimiento

**Files:**
- Create: `src/app/dashboard/warehouse/movements/new/page.tsx` (chequea `create`; pasa permisos `adjust`/`view_prices`)
- Create: `src/features/Warehouses/Movements/components/NewMovementForm.tsx`, `MovementLinesGrid.tsx` (`useFieldArray`), `DestinationFields.tsx`, `shared/{MaterialCombobox,EmployeeCombobox,SearchCombobox}.tsx`

**Pasos:**
- [ ] Form plano + `superRefine`; campos dependientes del tipo y de `tracking_type` por línea; `EnhancedDatePicker` para fecha y vencimiento; stock disponible por línea; sugerencia FEFO; todos los botones no-submit con `type="button"`.
- [ ] Al guardar: `router.push` al detalle del movimiento + toast con números.

### Task 11: Detalles y anulación

**Files:**
- Create: `src/app/dashboard/warehouse/movements/[id]/page.tsx` + `Movements/components/MovementDetail.tsx`, `ReverseMovementDialog.tsx` (`AlertDialog`, motivo obligatorio)
- Create: `src/app/dashboard/warehouse/materials/[id]/page.tsx` + `Materials/components/{MaterialHeader,MaterialStockByWarehouse,MaterialKardex}.tsx` (dos `Suspense` independientes)

### Task 12: Demo

**Files:** Create `scripts/demo/domains/warehouses.ts` (`seedWarehouses(ctx)` usando el motor); Modify `scripts/demo/reset.ts`, `scripts/demo/domains/users.ts`.

### Task 13: Verificación final

- [ ] `npm run check-types`, `npm test`, `npm run test:db`, `npm run test:warehouses`.
- [ ] Navegador: alta de catálogo, un movimiento de cada tipo (incl. lote y serializado), stock y kardex coherentes, anulación, usuario sin `view_prices` no recibe costos (verificar en la respuesta de red), sin `adjust` no ve ajuste.
- [ ] Revisión de calidad (fase 6 de feature-dev: 3 revisores) antes de proponer commit.
