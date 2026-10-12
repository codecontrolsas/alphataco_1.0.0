# Tesorería — Etapa 1 (cuentas, saldos, movimientos y transferencias) — Plan de implementación

> **Para quien lo ejecute:** tarea por tarea, en orden, con ejecución nativa y una revisión final de todo el branch con un revisor nuevo. Al terminar: commit de la etapa (una línea). **Sin push ni PR**: se hacen al cerrar el módulo (etapa 4).

**Objetivo:** que cada cuenta y caja tenga saldo, a debitar, a acreditar y proyectado, con extracto, movimientos manuales y transferencias, y que los pagos de Compras muevan el saldo (los cheques y e-cheqs en su fecha de pago).

**Arquitectura:** feature nueva `src/features/Treasury/` con un solo libro `treasury_movements`. Toda escritura de movimientos pasa por `lib/movements.ts` y toda lectura de saldos por `lib/balances.ts`; la clasificación pasado/futuro vive solo en la consulta SQL de `balances.ts`. Las cuentas (`treasury_accounts`) se mudan de Compras a Tesorería; Compras llama a `lib/movements.ts` dentro de sus transacciones de pago y anulación.

**Stack:** Next.js 16, Prisma 7 + Postgres, React Query, RHF + Zod, shadcn, Vitest, pgTAP, exceljs (`@/shared/lib/excel-export`).

**Spec:** `docs/superpowers/specs/2026-10-10-tesoreria-etapa-1-design.md` (fuente de verdad).
**Base:** rama `feat/tesoreria`, creada desde `feat/compras-etapa-1` en `e82c1a3f`.

## Restricciones globales

- Empresa de la sesión (`getActiveCompanyId`); todo id que llega del cliente se valida contra ella. Mutaciones con `ActionResult`; errores de negocio `TreasuryError` (mensaje para el usuario).
- Importes con `invoice-math` (`parseScaled`, `formatScaled`, `AMOUNT_SCALE = 2`, BigInt en centavos). Nada de `Number` para montos.
- "Hoy" es la fecha local: `moment().format('YYYY-MM-DD')`, nunca `toISOString()`.
- Funciones exportadas de archivos `'use server'` nunca reciben `companyId`; los helpers server-only van en `lib/` con `import 'server-only'`.
- Tipos de `lib/` que reciben cliente o `tx`: `Pick<Prisma.TransactionClient, …>` (evita TS2589 en `next build`).
- Sin `any`, sin `console.*`; moment.js; código en inglés y UI en español; schemas Zod en `schemas/` sin directiva; clases de Tailwind escritas completas; `type="button"` en botones de formulario que no guardan; fechas escribibles.
- Migraciones: carpeta manual + `npx prisma migrate deploy` (en DEV se aplica sin pedir; PROD nunca). Enums nuevos en la misma migración; CHECK e índices parciales en SQL.
- Permisos por migración solo a `admin`, `administrador`, `full-access-provisional`; tabs en `permissions-map.ts`; claves `tesoreria:tab:acción` cubiertas por `src/features/Treasury/tab-permission-keys.test.ts`.
- DataTables: agente `table-expert`. Al generar archivos con shell, nada de `$var:x` en heredocs (zsh): usar Write.
- Verificación: `NODE_OPTIONS=--max-old-space-size=8192 npm run check-types`; `npx next build` antes de cerrar (dev server parado y `tsconfig.tsbuildinfo` borrado). Prohibido lint/prettier/format.

## Foco de revisión

1. **Cheque con fecha de pago igual a hoy**: entra al saldo y no figura "a debitar"; uno de mañana, al revés. Test en Task 2 (`classify`) y Task 4 (pago con e-cheq de hoy y de mañana).
2. **Zona horaria**: un movimiento manual cargado con la fecha de hoy a la noche (UTC ya es mañana) cuenta en el saldo. Los tests usan `TODAY = moment().format('YYYY-MM-DD')`, y la consulta recibe `today` como parámetro `::date`, nunca `CURRENT_DATE`. Task 3.
3. **Editar un manual cambiando Ingreso → Egreso** con un concepto solo de ingresos: rechazado con el mensaje del concepto; el movimiento queda como estaba. Task 3.
4. **Doble anulación** (dos usuarios anulan la misma transferencia u orden de pago): la segunda falla con "ya estaba anulada" y no pisa el motivo ni la fecha de la primera. Task 3 y Task 4.
5. **Pagar desde una cuenta desactivada en otra pestaña**: el usuario ve "La cuenta «X» está inactiva", no el mensaje genérico (el `TreasuryError` que lanza `lib/movements.ts` lo traduce `toPurchaseActionError`). Task 4.

---

### Task 1: Esquema, migraciones y permisos

**Files**
- Modify `prisma/schema.prisma`:
  - `treasury_accounts`: `currency String @default("ARS") @db.VarChar(3)`, `updated_at DateTime @default(now()) @updatedAt @db.Timestamptz(6)`, relaciones `movements`, `transfers_from`, `transfers_to`.
  - enums `treasury_movement_kind { OPENING MANUAL TRANSFER SUPPLIER_PAYMENT }` y `treasury_concept_direction { IN OUT BOTH }`.
  - modelos `treasury_movements`, `treasury_concepts`, `treasury_transfers` (spec §2.2) con `created_by`/`cancelled_by` a `profile`, `payment_order_payment_id @unique`, índices `(account_id, date)` y `(company_id, date)`; relación inversa `movement treasury_movements?` en `payment_order_payments`.
- Create `prisma/migrations/20261012100000_treasury_core/migration.sql`: diff sin drift + los CHECK de la spec §2.3:
  ```sql
  ALTER TABLE treasury_accounts ADD CONSTRAINT treasury_accounts_currency_check CHECK (currency = 'ARS');
  ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_amount_check CHECK (amount <> 0);
  ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_origin_check CHECK (
    (kind = 'OPENING' AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL)
    OR (kind = 'MANUAL' AND concept_id IS NOT NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL)
    OR (kind = 'TRANSFER' AND transfer_id IS NOT NULL AND concept_id IS NULL AND payment_order_payment_id IS NULL)
    OR (kind = 'SUPPLIER_PAYMENT' AND payment_order_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND amount < 0)
  );
  ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_cancel_check CHECK (
    (cancelled_by IS NULL) = (cancelled_at IS NULL) AND (cancelled_at IS NULL) = (cancel_reason IS NULL));
  CREATE UNIQUE INDEX treasury_movements_one_opening ON treasury_movements (account_id)
    WHERE kind = 'OPENING' AND cancelled_at IS NULL;
  ALTER TABLE treasury_transfers ADD CONSTRAINT treasury_transfers_accounts_check CHECK (from_account_id <> to_account_id);
  ALTER TABLE treasury_transfers ADD CONSTRAINT treasury_transfers_amount_check CHECK (amount > 0);
  ALTER TABLE treasury_transfers ADD CONSTRAINT treasury_transfers_cancel_check CHECK (
    (cancelled_by IS NULL) = (cancelled_at IS NULL) AND (cancelled_at IS NULL) = (cancel_reason IS NULL));
  ```
  más los únicos `(company_id, name)` en conceptos y `(company_id, number)` en transferencias.
- Create `prisma/migrations/20261012100100_treasury_backfill_supplier_payments/migration.sql`: un movimiento por cada `payment_order_payments` (spec §3.1):
  ```sql
  INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, description, payment_order_payment_id,
                                  created_by, created_at, cancelled_by, cancelled_at, cancel_reason)
  SELECT po.company_id, p.treasury_account_id,
         CASE WHEN p.method IN ('CHECK','ECHECK') THEN p.check_due_on ELSE po.paid_on END,
         -p.amount, 'SUPPLIER_PAYMENT',
         po.number || ' — ' || s.name || CASE WHEN p.check_number IS NOT NULL THEN ' — Cheque N° ' || p.check_number ELSE '' END,
         p.id, COALESCE(po.paid_by, po.created_by), po.updated_at,
         CASE WHEN po.status = 'CANCELLED' THEN po.cancelled_by END,
         CASE WHEN po.status = 'CANCELLED' THEN po.cancelled_at END,
         CASE WHEN po.status = 'CANCELLED' THEN po.cancel_reason END
  FROM payment_order_payments p
  JOIN payment_orders po ON po.id = p.payment_order_id
  JOIN suppliers s ON s.id = po.supplier_id
  ON CONFLICT (payment_order_payment_id) DO NOTHING;
  ```
  (`paid_by` es nullable en el schema: el `COALESCE` cubre las órdenes donde falte).
- Create `prisma/migrations/20261012100200_treasury_module_permissions/migration.sql`: módulo `d0000000-0000-0000-0000-000000000000` (`tesoreria`, "Tesorería"), tabs `…001 cuentas` (0), `…002 movimientos` (1), `…003 transferencias` (2), `…004 config-tesoreria` (3), y `role_permissions` (cuentas view; movimientos view/create/update; transferencias view/create/update; config view/update) para los 3 roles, con el mismo SQL que `20261008100100_purchases_module_permissions`.
- Modify `src/features/Permissions/permissions-map.ts` (módulo `tesoreria` con `moduleId` y las 4 tabs, comentado como el de Compras), `src/shared/constants/module-icons.ts` (`tesoreria: Landmark`), `src/features/Layout/sidebar/constants/navigation.ts` (Tesorería `position: 11` después de Compras, corriendo uno los siguientes; `href: '/dashboard/treasury'`; sub-items Cuentas, Movimientos, Transferencias, Configuración; íconos `tesoreria:cuentas: Landmark`, `tesoreria:movimientos: ArrowLeftRight`, `tesoreria:transferencias: Repeat`, `tesoreria:config-tesoreria: Settings`).
- Create `prisma/tests/04_treasury.sql` (pgTAP): tablas; `amount = 0` → 23514; cada `kind` con un origen ajeno → 23514; `SUPPLIER_PAYMENT` positivo → 23514; segundo OPENING vigente → 23505 y uno anulado + uno vigente OK; anulación parcial → 23514; transferencia misma cuenta y `amount <= 0` → 23514; `currency = 'USD'` → 23514; `payment_order_payment_id` duplicado → 23505.

**Verificación:** `npx prisma migrate deploy`; `npx prisma generate`; `psql \d treasury_movements`; `SELECT count(*) FROM payment_order_payments` = `SELECT count(*) FROM treasury_movements WHERE kind='SUPPLIER_PAYMENT'`; `npm run test:db`; `check-types`.

### Task 2: Reglas puras con tests unitarios

**Files** (módulos sin directiva, en `src/features/Treasury/lib/`)
- `treasury-errors.ts`: `export class TreasuryError extends Error` (como `PurchaseError`).
- `movement-rules.ts` + `movement-rules.test.ts`:
  ```ts
  export type MovementDirection = 'IN' | 'OUT';
  /** Importe con signo en centavos: positivo entra, negativo sale. `amount` es el texto del form (> 0). */
  export function signedCents(direction: MovementDirection, amount: string): bigint;
  /** El concepto admite el sentido. */
  export function conceptAllows(conceptDirection: 'IN' | 'OUT' | 'BOTH', direction: MovementDirection): boolean;
  /** Fecha valor del movimiento de un medio de pago de Compras (spec §3.1). */
  export function paymentMovementDate(method: 'TRANSFER' | 'CHECK' | 'ECHECK' | 'CASH', paidOn: string, checkDueOn: string | null): string;
  /** Pasado (cuenta en el saldo) o futuro. `date` y `today` en YYYY-MM-DD. */
  export function isFuture(date: string, today: string): boolean;
  ```
  Tests: signo por sentido; `BOTH` admite los dos; e-cheq → `checkDueOn`, transferencia → `paidOn`; **fecha igual a hoy no es futura** (Foco 1).
- `statement-math.ts` + test:
  ```ts
  export type StatementRow = { id: string; date: string; amount: string; cancelled: boolean };
  /** Agrega el saldo acumulado; los anulados no suman y llevan el saldo de la fila anterior. */
  export function withRunningBalance<T extends StatementRow>(previous: string, rows: T[]): { rows: (T & { balance: string })[]; closing: string };
  export function indicatorsFromBuckets(b: { balance: string; toDebit: string; toCredit: string }): { balance: string; toDebit: string; toCredit: string; projected: string };
  ```
  Tests: saldo anterior + filas; anulada en el medio; proyectado = saldo + a debitar + a acreditar (a debitar negativo).
- `document-number.ts` (server-only): `nextTransferNumber(tx, companyId): Promise<string>` con `pg_advisory_xact_lock(hashtextextended('treasury_transfer_number:' || companyId, 0))` y `MAX()+1` sobre `treasury_transfers`; `transfer-number-format.ts` + test: `formatTransferNumber(n) → 'TR-000001'`.

**Verificación:** `npx vitest run src/features/Treasury/lib` (RED antes de implementar, GREEN después).

### Task 3: Libro de movimientos y acciones de Tesorería

**Files**
- `lib/movements.ts` (server-only): única escritura.
  ```ts
  type MovementsTx = Pick<Prisma.TransactionClient, 'treasury_movements' | 'treasury_accounts' | '$queryRaw'>;
  export async function assertActiveAccount(tx, companyId: string, accountId: string): Promise<{ id: string; name: string; kind: 'BANK' | 'CASH' }>; // TreasuryError "La cuenta «X» está inactiva" / "La cuenta no existe"
  export async function createMovement(tx, input: { companyId: string; accountId: string; date: string; amountCents: bigint; kind: TreasuryMovementKind; conceptId?: string | null; description?: string | null; transferId?: string | null; paymentOrderPaymentId?: string | null; createdBy: string }): Promise<{ id: string }>;
  export async function cancelMovements(tx, where: { ids?: string[]; transferId?: string; paymentOrderId?: string }, cancel: { by: string; reason: string; at: Date }): Promise<number>; // solo los no anulados
  export async function lockMovement(tx, companyId: string, id: string): Promise<…>; // SELECT … FOR UPDATE
  ```
- `lib/balances.ts` (server-only): única lectura.
  ```ts
  export async function getAccountIndicators(db, companyId: string, today: string, accountIds?: string[]): Promise<Map<string, { balance: string; toDebit: string; toCredit: string; projected: string }>>;
  // una consulta: SUM(amount) FILTER (WHERE date <= ${today}::date), FILTER (WHERE date > ${today}::date AND amount < 0), FILTER (… amount > 0), WHERE cancelled_at IS NULL, GROUP BY account_id
  export async function getAccountStatement(db, companyId: string, accountId: string, from: string, to: string, today: string): Promise<{ previous: string; rows: …; closing: string }>; // usa withRunningBalance
  ```
- `lib/action-errors.ts` (server-only): `toTreasuryActionError(error, logger, context, duplicateMessage?)` (mismo criterio que Compras; también traduce `PurchaseError`), `NO_PERMISSION`, `UUID_RE`, `firstIssue` reexportados de Compras.
- Schemas sin directiva: `schemas/accounts.ts` (el `treasuryAccountFormSchema` se muda desde `Purchases/schemas/payment-settings.ts` + `openingDate?`, `openingAmount?` que van juntos), `schemas/concepts.ts`, `schemas/movements.ts` (`direction`, `amount > 0`, `date`, `accountId`, `conceptId`, `description`), `schemas/transfers.ts` (refine origen ≠ destino), `schemas/opening.ts`, `schemas/cancel.ts` (motivo obligatorio). `TREASURY_ACCOUNT_KIND_LABELS` se muda a `schemas/accounts.ts`; `payment-settings.ts` los reexporta para no romper imports.
- Actions (`'use server'`):
  - `actions/accounts.server.ts`: `getTreasuryAccounts()` (permiso `tesoreria:config-tesoreria:view` **o** `compras:pagos:update`; devuelve cada cuenta con sus indicadores), `getTreasuryAccountCards()` (`tesoreria:cuentas:view`), `createTreasuryAccount` (con saldo inicial opcional en la misma transacción), `updateTreasuryAccount`, `setTreasuryAccountActive`, `deleteTreasuryAccount` (solo sin movimientos ni pagos: "La cuenta tiene movimientos: desactivala"). Todo con `tesoreria:config-tesoreria:update`. Se borra `Purchases/actions/treasury-accounts.server.ts`; `TreasuryAccountRow` pasa a exportarse de acá.
  - `actions/concepts.server.ts`: listar, crear, editar, activar/desactivar, borrar si no se usó.
  - `actions/movements.server.ts`: `createManualMovement`, `updateManualMovement`, `cancelManualMovement`, `setOpeningBalance` (crea o edita el vigente; segundo → "La cuenta ya tiene saldo inicial al DD/MM/AAAA: editalo"), `getMovementDetail`. Editar/anular un `TRANSFER` o `SUPPLIER_PAYMENT` → TreasuryError con el documento ("Este movimiento es del pago de la OP-000012. Para revertirlo, anulá la orden de pago"). Concepto inactivo o de otro sentido → mensaje de la spec §5.
  - `actions/transfers.server.ts`: `createTransfer` (número, dos movimientos), `cancelTransfer` (lock `FOR UPDATE` de la transferencia; "La TR-000004 ya estaba anulada").
  - `actions/statement.server.ts`: `getAccountStatementData(accountId, from, to)` para la página y el Excel.
- Create `scripts/test-treasury.sh` (copia de `test-purchases.sh` con los archivos de Tesorería) y `package.json` `"test:treasury": "bash scripts/test-treasury.sh"`; sumarlo al job `db-tests` de `.github/workflows/ci.yml` (`- run: bash scripts/test-treasury.sh`, después de `test-purchases.sh`).
- Tests `actions/treasury.integration.test.ts` (empresa propia, CUIT de prueba no usado por Compras, cleanup de movimientos/transferencias/conceptos/cuentas): spec §6 Integración (todo menos Compras), más Foco 2 (manual con `TODAY` entra al saldo), Foco 3 (cambio de sentido rechazado y sin cambios) y Foco 4 (dos `cancelTransfer` en paralelo con `Promise.all`: una ok, otra error; el motivo es el de la primera).

**Verificación:** `npm run test:treasury`; `check-types`.

### Task 4: Enganche con Compras

**Files**
- `src/features/Purchases/actions/payment-orders.server.ts`:
  - `registerPayment`: reemplazar `createMany` por un loop `create` que devuelva cada `id` y llame `createMovement(tx, { kind: 'SUPPLIER_PAYMENT', accountId, date: paymentMovementDate(method, v.paidOn, checkDueOn), amountCents: -cents(amount), paymentOrderPaymentId, description: \`${order.number} — ${supplierName}${checkNumber ? \` — Cheque N° ${checkNumber}\` : ''}\`, createdBy: profile.id })`. La validación de cuentas activas pasa a `assertActiveAccount` (mensaje con el nombre).
  - `cancelPaymentOrder`: si estaba `PAID`, `cancelMovements(tx, { paymentOrderId: id }, { by: profile.id, reason: motive.data, at: now })`.
  - `getPaymentOrderDetail`: cada pago trae `movement: { date, cancelled }` y `toDebit` (fecha > hoy).
- `src/features/Purchases/lib/action-errors.ts`: `toPurchaseActionError` también devuelve el mensaje de `TreasuryError` (Foco 5).
- `src/app/dashboard/purchases/payments/[id]/page.tsx`, `PaymentPages.tsx`, `RegisterPaymentDialog.tsx`: importan `getTreasuryAccounts`/`TreasuryAccountRow` de Tesorería; el selector muestra "Galicia — saldo $ 1.234.567,89".
- `PaymentOrderDetailView.tsx`: por medio de pago, "Débito: DD/MM/AAAA" y badge "A debitar" si es futuro.
- `Purchases/Settings/SettingsTabContent.tsx`: quitar `TreasuryAccountsSection` y poner una `Card` con "Las cuentas bancarias y cajas se administran en Tesorería" y link a `/dashboard/treasury?tab=config-tesoreria`; borrar `Purchases/Settings/components/TreasuryAccountsSection.tsx` (se muda en Task 5).
- `src/features/Purchases/actions/payments.integration.test.ts`: el CRUD de cuentas sale de acá (lo cubre Tesorería) y se suman: pago con transferencia + e-cheq a mañana → dos movimientos, el del e-cheq con la fecha del cheque y fuera del saldo; e-cheq a `TODAY` → en el saldo (Foco 1); anular la orden anula los dos con el motivo; doble anulación de la orden no reescribe el motivo (Foco 4); neto 0 no crea movimientos; pagar con una cuenta desactivada → "La cuenta «X» está inactiva" (Foco 5). Cleanup: borrar `treasury_movements` antes que `payment_order_payments`.
- `src/features/Purchases/actions/invoices.integration.test.ts`: agregar `treasury_movements` al cleanup si borra órdenes pagadas.

**Verificación:** `npm run test:purchases` (todos), `npm run test:treasury`, `check-types`.

### Task 5: Pantallas

**Files**
- `src/app/dashboard/treasury/page.tsx` (fino) → `src/features/Treasury/TreasuryComponent.tsx` con `SectionManagerServer` (`defaultTab="cuentas"`), como `PurchasesComponent`.
- `Accounts/AccountsTabContent.tsx` + `components/AccountCards.tsx`: tarjetas por cuenta activa (saldo, a debitar, a acreditar, proyectado), totales de bancos y cajas, link al extracto; saldo negativo en rojo. Skeleton en `fallback/`.
- `src/app/dashboard/treasury/accounts/[id]/page.tsx` + `Accounts/components/AccountStatementView.tsx`: indicadores, datos de la cuenta, Desde/Hasta (default mes en curso, `useQuery` con `getAccountStatementData`), saldo anterior, filas con saldo acumulado, anulados tachados con motivo, futuros con badge, saldo final, botón Excel (`exportToExcel`, como `SupplierAccountView`) y "Nuevo movimiento" con la cuenta elegida.
- `Movements/components/MovementFormDialog.tsx`: RHF + Zod, Ingreso/Egreso, concepto filtrado por sentido, saldo resultante a la fecha; en caja negativa pide confirmar con `AlertDialog` antes de enviar (spec §3); `CancelMovementDialog.tsx` con motivo. `OpeningBalanceDialog.tsx`.
- `Transfers/components/TransferFormDialog.tsx` (destino sin la de origen, saldo de las dos, misma confirmación en caja) y `CancelTransferDialog.tsx`.
- `Settings/SettingsTabContent.tsx` + `components/TreasuryAccountsSection.tsx` (mudada desde Compras, con sección "Saldo inicial (opcional)" en el alta, borrar sin uso, confirmación al desactivar con saldo ≠ 0) + `components/ConceptsSection.tsx`.
- `src/features/Treasury/tab-permission-keys.test.ts` (copia del de Compras sobre `src/features/Treasury`, mínimo 4 tabs).
- Query keys en `lib/query-keys.ts`; invalidar indicadores, extracto y tablas tras cada mutación.

**Verificación:** `check-types`; `npx vitest run src/features/Treasury/tab-permission-keys.test.ts`; navegador como admin: cada tab con su botón de alta, extracto con Excel, alta de cuenta con saldo inicial, manual, transferencia, confirmación de caja negativa, 375 px.

### Task 6: Tablas (agente `table-expert`)

- **Movimientos** (`Movements/MovementsTabContent.tsx` + `MovementsList`/`_MovementsDataTable`/`columns`/`actions.server.ts` de la tabla): fecha, cuenta, tipo, concepto, descripción, origen (link a OP / TR), ingreso, egreso, estado (vigente/anulado); acciones editar/anular solo en manuales y saldo inicial con `tesoreria:movimientos:update`; botón "Nuevo movimiento" con `create`.
- **Transferencias**: número, fecha, origen, destino, importe, notas, estado; anular con `tesoreria:transferencias:update`; "Nueva transferencia" con `create`.
- Pasarle al agente los diálogos de Task 5 para las acciones de fila y las reglas de `datatable.md` / `datatable-filters.md`.

**Verificación:** `check-types`; navegador (filtros, export, acciones).

### Task 7: Demo

- `scripts/demo/domains/treasury.ts`: `seedTreasury(ctx, accounts)` con los conceptos de la spec §7, saldo inicial al primer día del mes anterior para Galicia, Nación y Caja, gastos bancarios del mes, un aporte, una transferencia banco → caja, y `verify` (cada `payment_order_payments` con su movimiento; saldos esperados).
- `scripts/demo/domains/supplier-payments.ts`: sus pagos crean el movimiento con la misma regla (`paymentMovementDate`); un e-cheq con fecha futura queda "a debitar". Si la demo inserta pagos por Prisma directo, insertar también el movimiento ahí (no hay trigger).
- `scripts/demo/domains/purchases.ts` (o el orquestador): llamar `seedTreasury` después de `seedSupplierPayments`.

**Verificación:** reset de demo + `verify` OK.

### Task 8: Manual

- Sección nueva `src/features/Ayuda/Manual/catalog/sections/tesoreria.ts` (registrada en `catalog/index.ts`, ícono nuevo si el catálogo lo exige) y guías en `src/content/manual/tesoreria/`: `tesoreria.mdx` (cómo funciona, saldo vs. a debitar, las etapas que vienen), `cuentas-y-saldos.mdx`, `movimientos-de-tesoreria.mdx`, `transferencias.mdx`, `configuracion-de-tesoreria.mdx`. Recorrido en `home.ts`.
- Actualizar `compras/configuracion-de-compras.mdx` (las cuentas se mudaron), `compras/ordenes-de-pago.mdx` (el callout "Solo se registra el pago" pasa a explicar el movimiento y el débito del cheque en su fecha; los links de "Cuenta o caja" apuntan a Configuración de Tesorería) y `compras/compras.mdx` si menciona Tesorería como futura.

**Verificación:** `npm run manual:check`.

### Task 9: Verificación final y commit de la etapa

- `check-types`, `npm test`, `npm run test:db`, `npm run test:treasury`, `npm run test:purchases`, `npm run test:warehouses`, `npm run manual:check`, `npx next build` (dev server parado, `tsconfig.tsbuildinfo` borrado), navegador.
- Revisión final con revisor nuevo (modelo más capaz) sobre `git merge-base feat/compras-etapa-1 HEAD..HEAD`; Critical/Important con test RED→GREEN.
- Commit `feat(tesoreria): etapa 1 - cuentas con saldo, movimientos y transferencias` con el spec y el plan incluidos (sin `.codex/` ni `AGENTS.md`). Sin push.
