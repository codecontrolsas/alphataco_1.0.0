# Almacenes — Etapa 2 (préstamos y vencimientos) — Plan de implementación

**Spec:** `docs/superpowers/specs/2026-10-06-almacenes-etapa-2-design.md` (fuente de verdad).
**Base:** rama `feat/almacenes-etapa-1` (etapa 1 commiteada en `e54fe093`). Las restricciones globales y el criterio de "tarea terminada" son los del plan de la etapa 1 (`docs/superpowers/plans/2026-10-04-almacenes-etapa-1.md`).

## Notas técnicas que condicionan el orden

- **`ALTER TYPE ... ADD VALUE` va en una migración propia.** Postgres no deja usar un valor de enum nuevo en la misma transacción que lo crea ("unsafe use of new enum value"). Los CHECK que mencionan `'RETURN'` van en una segunda migración.
- **"Hoy" en Argentina:** se reutiliza `argentinaDate()` de `src/features/Jobs/lib/dates.ts`. El motor y el job tienen que coincidir en qué lote está vencido.
- **IDs:** la tab nueva usa `b0000000-0000-0000-0000-000000000006`. Antes de la migración se verifica contra la base que esté libre; el test de IDs únicos del mapa de permisos lo cubre.

---

### Task 1: Esquema, migraciones y permisos

**Files:**
- Modify: `prisma/schema.prisma`
  - enum `stock_movement_type` += `RETURN`;
  - enum nuevo `material_write_off_reason`;
  - enum `notification_kind` += `stock_batch_expiry`;
  - `stock_movements.returned_from_movement_id` con su relación;
  - modelo `material_unit_write_offs`;
  - relaciones inversas.
- Create: `prisma/migrations/20261006100000_warehouses_loans_enums/migration.sql`. Solo los `ADD VALUE` y el `CREATE TYPE`.
- Create: `prisma/migrations/20261006100100_warehouses_loans/migration.sql`:
  - columna, tabla e índices;
  - los CHECK: el `exit_destination` reemplazado y el `return` nuevo;
  - el único de las bajas;
  - `notification_settings` para las empresas existentes;
  - la tab `prestamos`, con `WHERE EXISTS` del módulo;
  - `role_permissions` de los 3 roles de sistema.
- Modify: `src/features/Permissions/permissions-map.ts` (tab `prestamos`: `view`, `create`, `delete`).
- Modify: `src/features/Layout/sidebar/constants/navigation.ts` (ítem y `SUB_ITEM_ICONS` con `HandHelping`).
- Modify: `scripts/seed-company.ts` (`stock_batch_expiry` en la lista de tipos).
- Modify: `prisma/tests/02_warehouses.sql`: CHECK de `RETURN` sin salida de origen, destino obligatorio en `RETURN` y único de las bajas.

**Verificación:**
- `db:deploy`, `prisma generate` y `\d` en `psql`;
- `migrate diff` sin drift nuevo;
- `npm run test:db` y `npm test` (incluye el test de IDs únicos).

### Task 2: Lógica pura

**Files:**
- Create: `src/features/Warehouses/lib/batch-expiry.ts` + `.test.ts`:
  - `classifyBatch(expiresAt, today)` devuelve `'EXPIRED' | 'EXPIRING' | 'OK'`;
  - `EXPIRING_WINDOW_DAYS = 30`;
  - casos borde: vence hoy (no está vencido), vence en el día 30 y en el 31, y sin vencimiento.
- Modify: `src/features/Warehouses/lib/kardex.ts` + `.test.ts`. Reglas nuevas:
  - una `RETURN` se reproduce como entrada al costo de la línea;
  - la anulación de una `RETURN`, como anulación de entrada.
- Modify: `src/features/Warehouses/lib/labels.ts` (`RETURN: 'Devolución'`, `WRITE_OFF_REASON_LABELS`).
- Modify: `src/features/Warehouses/lib/stock-errors.ts` (`EXPIRED_BATCH`).

### Task 3: Motor de stock

**Files:**
- Modify: `src/features/Warehouses/lib/stock-engine.ts`:
  - `registerReturn` (spec §3.1);
  - `writeOffLoanedUnit` (spec §3.2);
  - el bloqueo de lotes vencidos en salidas y transferencias (§3.3);
  - en `reverseStockMovement`, el caso `RETURN`: la unidad vuelve a `OUT` y se copia `returned_from_movement_id` (§3.4);
  - `registerStockMovement` rechaza `RETURN`.
- Modify: `src/features/Warehouses/lib/stock-engine.integration.test.ts`, con los casos de spec §5:
  - devolución al costo y destino compensado;
  - unidad ajena rechazada;
  - anular la devolución, reabrir el préstamo y volver a devolver;
  - una salida ya devuelta no se puede anular;
  - baja doble rechazada;
  - lote vencido rechazado en salida y transferencia, y permitido en ajuste;
  - el kardex coincide con el motor.
- Verificación: `npm run test:warehouses`.

### Task 4: Server actions

**Files:**
- Create: `src/features/Warehouses/actions/loans.server.ts`:
  - `returnLoanedUnitsAction` (`prestamos:create`) y `writeOffLoanedUnitAction` (`prestamos:delete`), con `ActionResult` y `withActor`;
  - `getLoanForAction(unitId)`, para el diálogo de devolución.
- Modify: `actions/options.server.ts`. En `getMaterialAvailability`, cada lote suma `expired` (calculado con `classifyBatch`).
- Modify: `actions/materials-detail.server.ts`. El detalle suma `unitsOnLoan` (con el tenedor) y `writeOffs`.
- Modify: `actions/stock-alerts.server.ts`. Suma `getExpiringBatches()`: lotes con saldo `> 0`, vencidos o por vencer, agrupados por depósito.
- Modify: `actions/movements.server.ts`. El detalle incluye `returnedFrom`.

### Task 5: Tabla de Préstamos (agente `table-expert`)

**Files:** `src/features/Warehouses/Loans/components/LoansList/` (`LoansList`, `actions.server.ts`, `columns.tsx`, `_LoansDataTable.tsx`, `fallback/LoansTableSkeleton`).

- **Filas:** `material_units` en estado `OUT` de la empresa.
- **Tenedor:** sale del destino del último movimiento.
- **Fecha "desde":** la de la salida original, siguiendo `returned_from_movement_id` cuando el último movimiento es una anulación de devolución.
- **Columnas y filtros:** según spec §4.1.
- **Columna `actions`:** `<LoanRowActions />`. Lo escribo yo y el agente lo importa, con el mismo contrato que en la etapa 1.
- **Query key:** `WAREHOUSE_QUERY_KEYS.loans`.

### Task 6: Pantallas

**Files:**
- Create: `src/features/Warehouses/Loans/LoansTabContent.tsx`, `Loans/components/{LoanRowActions,ReturnLoanDialog,WriteOffLoanDialog}.tsx`.
- Modify: `WarehousesComponent.tsx` (sección `prestamos`).
- Modify: `Stock/StockTabContent.tsx` + Create `Stock/components/BatchExpiryAlert.tsx`.
- Modify: `Movements/components/MovementDetail.tsx` (vínculo "Devuelve el préstamo de…").
- Modify: `Movements/components/MovementLineRow.tsx`. En salidas y transferencias, los lotes vencidos aparecen deshabilitados con la etiqueta "Vencido".
- Modify: `Materials/components/MaterialHeader.tsx` (bloques "Unidades prestadas" y "Dadas de baja").
- Modify: `Movements/components/MovementsList/columns.tsx`, `_MovementsDataTable.tsx`. El filtro de tipo toma `RETURN` desde los labels; verificarlo con `table-expert` si hace falta.

### Task 7: Mail semanal

**Files:**
- Create: `src/features/Jobs/jobs/warehouse-batch-expiry.ts` (`runWarehouseBatchExpiryJob`, con el patrón de `documents-expiry`). Si la empresa no tiene lotes que avisar, queda `skipped` y no se manda mail.
- Create: `src/features/Jobs/templates/warehouse-batch-expiry.ts`, más sus casos en `templates.test.ts`.
- Create: `src/app/api/jobs/warehouse-batch-expiry/route.ts`.
- Modify: `src/features/Jobs/lib/types.ts` (`JOB_NAMES`) y `docker/cron/crontab` (`5 8 * * 1`).
- Create: `src/features/Jobs/jobs/warehouse-batch-expiry.integration.test.ts`, con dos empresas, una sin lotes. Verifica:
  - un mail por empresa;
  - que la empresa sin lotes queda salteada;
  - la idempotencia.
- Modify: `scripts/test-jobs.sh` (suma el test nuevo) y `docs/desarrollo/entornos.md` (tabla de jobs).

### Task 8: Demo

**File:** `scripts/demo/domains/warehouses.ts`.
- Suma una devolución al pañol, una baja por extravío y un lote vencido con saldo.
- El libro en memoria refleja las reglas nuevas: la devolución entra al costo de la salida.
- Se verifica con el arnés en transacción descartada, como en la etapa 1.

### Task 9: Verificación final

- `check-types`, `npm test`, `test:db`, `test:warehouses` y `test:jobs`.
- En el navegador:
  - prestar y devolver una herramienta, y dar de baja otra;
  - la tabla de Préstamos y el detalle del material;
  - un lote vencido rechazado en una salida y deshabilitado en el selector;
  - el aviso en Stock.
- El job disparado a mano contra Mailpit.
- Revisión de calidad con tres revisores, antes de proponer el commit.
