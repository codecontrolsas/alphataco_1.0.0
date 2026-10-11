# Tesorería — Etapa 2 (cobranzas, retenciones sufridas y cuenta corriente) — Plan de implementación

> **Para quien lo ejecute:** tarea por tarea, en orden, con ejecución nativa y una revisión final de todo el branch con un revisor nuevo. Al terminar: commit de la etapa (una línea). **Sin push ni PR**: se hacen al cerrar el módulo (etapa 4).

**Objetivo:** registrar los cobros a clientes con un recibo numerado (`RE-000001`) que cancela facturas y notas de débito de Comercial, mueve las cuentas por cada medio, guarda las retenciones sufridas con su certificado y maneja anticipos. Suma la cuenta corriente del cliente.

**Arquitectura:**
- El pendiente de cada comprobante sale de una tabla de aplicación (`customer_receipt_lines`). `invoices` no se toca.
- Una sola definición SQL del pendiente y del disponible de un anticipo, en `lib/receivables.ts`, con el patrón de `Purchases/lib/payment-balances.ts`.
- Los medios escriben en el libro de la etapa 1 por `lib/movements.ts`, con el kind nuevo `CUSTOMER_RECEIPT`.
- El PDF se genera a demanda, como el de la orden de pago de Compras.

**Stack:** Next.js 16, Prisma 7 + Postgres, React Query, RHF + Zod, shadcn, `@react-pdf/renderer`, Vitest, pgTAP, exceljs (`@/shared/lib/excel-export`).

**Spec:** `docs/superpowers/specs/2026-10-10-tesoreria-etapa-2-design.md` (fuente de verdad).
**Base:** rama `feat/tesoreria` en `80a944a4` (etapa 1, al día con `main`).

## Restricciones globales

- **Empresa y errores**
  - La empresa sale de la sesión (`getActiveCompanyId`); todo id que llega del cliente se valida contra ella.
  - Mutaciones con `ActionResult`. Errores de negocio con `TreasuryError`, traducidos por `toTreasuryActionError`.
  - Funciones exportadas de archivos `'use server'` nunca reciben `companyId`. Los helpers server-only van en `lib/` con `import 'server-only'`.
- **Importes**
  - Con `invoice-math` (`parseScaled`, `formatScaled`, `AMOUNT_SCALE = 2`), en BigInt de centavos. Nada de `Number` para montos.
  - Cotizaciones con 6 decimales (`RATE_SCALE = 6`, `Decimal(18,6)`, igual que `invoices.exchange_rate`).
- **Fechas**
  - "Hoy" es `treasuryToday()` (`lib/today.ts`, Argentina). Nunca `toISOString()` ni `CURRENT_DATE` para "hoy".
  - Columnas `@db.Date` con `dateOnly()` de `lib/movements.ts`.
- **Escritura**
  - Toda escritura de `treasury_movements` pasa por `createMovement` / `cancelMovements` de `lib/movements.ts`.
  - Toda lectura de pendiente o disponible pasa por `lib/receivables.ts`.
- **Transacciones y tipos**
  - Las transacciones van con `withActor(profile.credentialId, fn, prisma, TRANSACTION_OPTIONS)`.
  - Los tipos de `lib/` que reciben cliente o `tx` usan `Pick<Prisma.TransactionClient, …>`, para evitar TS2589 en `next build`.
- **Convenciones de código**
  - Sin `any` ni `console.*`; moment.js; código en inglés y UI en español.
  - Schemas Zod en `schemas/` sin directiva.
  - Clases de Tailwind escritas completas; `type="button"` en todo botón de un formulario que no guarda; fechas escribibles; nada de modales encadenados.
- **Migraciones**
  - Carpeta manual + `npx prisma migrate deploy`. En DEV se aplica sin pedir; en PROD nunca.
  - CHECK e índices parciales en SQL, en la misma migración que los enums nuevos.
- **Permisos**
  - Por migración, solo a `admin`, `administrador` y `full-access-provisional`. Las tabs van en `permissions-map.ts`.
  - Las claves `tesoreria:<tab>:<acción>` las cubre `src/features/Treasury/tab-permission-keys.test.ts`.
  - Slugs: `cobranzas` y `retenciones-sufridas`.
- **Herramientas**
  - DataTables: agente `table-expert`.
  - Nada de `$var:x` en heredocs de zsh: generar archivos con Write.
- **Verificación**
  - `NODE_OPTIONS=--max-old-space-size=8192 npm run check-types`.
  - `npx next build` antes de cerrar, con el dev server parado y `tsconfig.tsbuildinfo` borrado.
  - Prohibido lint, prettier y format.
  - Los tests de integración corren sin `DATABASE_URL` exportado en `npm test`; con él, solo por `npm run test:treasury`.

## Foco de revisión

1. **Cobro total de una factura en USD cargado en pesos.** El usuario tipea los pesos del pendiente completo. El importe en USD que resulta tiene que dejar el pendiente en 0,00, sin un centavo colgado. "Cobrar total" fija `applied = pendiente` exacto, y la conversión desde pesos redondea al centavo de USD. Los tests van en Task 2 (ida y vuelta de `arsToApplied`/`appliedToArs`) y Task 4 (cobro total en USD deja pendiente 0 y la factura sale de "A cobrar").
2. **"Hoy" en Argentina.**
   - Un recibo con fecha de hoy, cargado a la noche (en UTC ya es mañana), no se rechaza como fecha futura.
   - Un cheque que vence hoy entra al saldo y no queda "A acreditar".
   - Test en Task 4 con `TODAY = treasuryToday()`.
3. **Anular un recibo cuyo anticipo se aplicó en un borrador.** Se bloquea con el mensaje del borrador, no con el de un recibo confirmado, y no anula nada. Test en Task 4.
4. **Una nota de crédito autorizada mientras el recibo está en borrador.** Al confirmar se recalcula el pendiente, se rechaza con el pendiente nuevo y el borrador queda como estaba. Test en Task 4.
5. **Quitar o reemplazar el certificado de una retención.**
   - Al guardar un borrador sin una retención que tenía certificado, o al reemplazar el certificado, se borra el archivo anterior de MinIO **después** del commit.
   - Si la transacción falla, se borra el archivo recién subido y no el anterior.
   - Test en Task 4, con el storage simulado.

---

### Task 1: Esquema, migraciones, permisos y bucket

**Files**
- Modify `prisma/schema.prisma`:
  - enum `treasury_movement_kind`: sumar `CUSTOMER_RECEIPT`.
  - enums nuevos `customer_receipt_status { DRAFT CONFIRMED CANCELLED }` y `customer_receipt_line_kind { INVOICE ADVANCE ADVANCE_APPLIED }`.
  - modelo `customer_receipts` (spec §2.1):
    - `number String?`; `status` con default `DRAFT`; `date @db.Date`; `notes String?`;
    - los 6 totales `Decimal @default(0) @db.Decimal(15,2)`;
    - `sent_at DateTime? @db.Timestamptz(6)`, `sent_to String[] @default([])`;
    - `created_by`, `confirmed_by?` y `cancelled_by?` a `profile`, con relaciones nombradas `customer_receipt_creator`, `customer_receipt_confirmer` y `customer_receipt_canceller`;
    - `confirmed_at?`, `cancelled_at?`, `cancel_reason?`;
    - relaciones a `company` (Cascade) y `customers` (NoAction);
    - `@@unique([company_id, number])`; índices `(company_id, date)` y `(customer_id)`.
  - modelo `customer_receipt_lines` (spec §2.2):
    - `receipt_id` (Cascade), `position Int`, `kind`;
    - `invoice_id?` a `invoices` (NoAction), `source_line_id?` autorrelación `"customer_receipt_line_source"` (NoAction);
    - `currency @db.Char(3)`, `applied_amount Decimal(15,2)`;
    - `exchange_rate` e `invoice_exchange_rate`, los dos `Decimal(18,6) @default(1)`;
    - `amount_ars Decimal(15,2)`, `fx_difference Decimal(15,2) @default(0)`, `description String?`;
    - índices `(receipt_id)`, `(invoice_id)`, `(source_line_id)`.
  - modelo `customer_receipt_withholdings` (spec §2.3):
    - `receipt_id` (Cascade), `company_id`, `customer_id`;
    - `tax withholding_tax`, `jurisdiction String?`;
    - `certificate_number String`, `certificate_date @db.Date`, `amount Decimal(15,2)`;
    - `file_path String?`, `file_name String?`;
    - índice `(company_id, customer_id, tax, certificate_number)`.
  - modelo `customer_receipt_payments` (spec §2.4): `receipt_id` (Cascade), `method payment_method`, `treasury_account_id` (NoAction), `amount Decimal(15,2)`, `reference?`, `check_number?`, `check_bank?`, `check_due_on? @db.Date`, relación `movement treasury_movements?`.
  - `treasury_movements`: `customer_receipt_payment_id String? @unique @db.Uuid` y la relación correspondiente.
  - Relaciones inversas: `customers.receipts`, `invoices.receipt_lines`, `treasury_accounts.receipt_payments` y las de `profile` y `company`.
- Create `prisma/migrations/20261014100000_treasury_collections/migration.sql`:
  - el diff sin drift (`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, tomando solo lo de estas tablas);
  - `ALTER TYPE treasury_movement_kind ADD VALUE 'CUSTOMER_RECEIPT';` va **antes** de todo lo que lo use. Postgres no deja usar el valor nuevo en la misma transacción: si `migrate deploy` corre la migración en una sola transacción, separar en `…100000_treasury_collections_enum` (solo el `ADD VALUE`) y `…100050_treasury_collections`;
  - estos CHECK:
  ```sql
  ALTER TABLE treasury_movements DROP CONSTRAINT treasury_movements_origin_check;
  ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_origin_check CHECK (
    (kind = 'OPENING' AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL)
    OR (kind = 'MANUAL' AND concept_id IS NOT NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL)
    OR (kind = 'TRANSFER' AND transfer_id IS NOT NULL AND concept_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL)
    OR (kind = 'SUPPLIER_PAYMENT' AND payment_order_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND customer_receipt_payment_id IS NULL AND amount < 0)
    OR (kind = 'CUSTOMER_RECEIPT' AND customer_receipt_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND amount > 0)
  );
  ALTER TABLE customer_receipts ADD CONSTRAINT customer_receipts_state_check CHECK (
    (status = 'DRAFT' AND number IS NULL AND confirmed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'CONFIRMED' AND number IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'CANCELLED' AND number IS NOT NULL AND confirmed_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)
  );
  ALTER TABLE customer_receipt_lines ADD CONSTRAINT customer_receipt_lines_kind_check CHECK (
    (kind = 'INVOICE' AND invoice_id IS NOT NULL AND source_line_id IS NULL)
    OR (kind = 'ADVANCE' AND invoice_id IS NULL AND source_line_id IS NULL AND currency = 'ARS' AND exchange_rate = 1)
    OR (kind = 'ADVANCE_APPLIED' AND source_line_id IS NOT NULL AND invoice_id IS NULL AND currency = 'ARS' AND exchange_rate = 1)
  );
  ALTER TABLE customer_receipt_lines ADD CONSTRAINT customer_receipt_lines_amount_check CHECK (applied_amount > 0 AND amount_ars > 0 AND exchange_rate > 0 AND invoice_exchange_rate > 0);
  CREATE UNIQUE INDEX customer_receipt_lines_one_invoice ON customer_receipt_lines (receipt_id, invoice_id) WHERE invoice_id IS NOT NULL;
  CREATE UNIQUE INDEX customer_receipt_lines_one_source ON customer_receipt_lines (receipt_id, source_line_id) WHERE source_line_id IS NOT NULL;
  ALTER TABLE customer_receipt_withholdings ADD CONSTRAINT customer_receipt_withholdings_check CHECK (
    amount > 0 AND (tax = 'IIBB') = (jurisdiction IS NOT NULL) AND (file_path IS NULL) = (file_name IS NULL)
  );
  ALTER TABLE customer_receipt_payments ADD CONSTRAINT customer_receipt_payments_check CHECK (
    amount > 0 AND (method NOT IN ('CHECK','ECHECK') OR (check_number IS NOT NULL AND check_due_on IS NOT NULL))
  );
  ```
- Create `prisma/migrations/20261014100100_treasury_collections_permissions/migration.sql`. Lleva el mismo SQL que `20261012100200_treasury_module_permissions`:
  - tabs `d0000000-0000-0000-0000-000000000005` `cobranzas` "Cobranzas" ("Recibos de clientes, comprobantes a cobrar y cuenta corriente", orden 4) y `…006` `retenciones-sufridas` "Retenciones sufridas" ("Retenciones que practicaron los clientes, con su certificado", orden 5);
  - permisos `cobranzas` → `view, create, update, delete`;
  - permisos `retenciones-sufridas` → `view, update`.
- Modify:
  - `src/features/Permissions/permissions-map.ts`: las dos tabs, con un comentario por acción como las de la etapa 1.
  - `src/features/Layout/sidebar/constants/navigation.ts`: sub-items "Cobranzas" y "Retenciones sufridas", antes de "Configuración"; íconos `'tesoreria:cobranzas': HandCoins` y `'tesoreria:retenciones-sufridas': ReceiptText`.
  - `src/shared/lib/storage-buckets.ts`: sumar `'customer-documents'` a `STORAGE_BUCKETS` (comentario `<companyId>/<customerId>/<archivo>`) y a `COMPANY_PREFIXED_BUCKETS`.
  - `docker-compose.yml`: `customer-documents` en el loop `mc mb`. Crear el bucket en el MinIO local con el mismo comando del servicio, o con `docker compose up minio-init`.
  - Cualquier test que enumere `STORAGE_BUCKETS`.
- Create `prisma/tests/05_treasury_collections.sql` (pgTAP):
  - existen las tablas;
  - `CUSTOMER_RECEIPT` sin `customer_receipt_payment_id`, con concepto o con importe negativo → 23514;
  - `MANUAL` con `customer_receipt_payment_id` → 23514;
  - `customer_receipt_payment_id` duplicado → 23505;
  - `(company_id, number)` duplicado → 23505, pero dos borradores con `number NULL` → OK;
  - `CONFIRMED` sin número → 23514; `CANCELLED` sin motivo → 23514; `DRAFT` con número → 23514;
  - línea `INVOICE` sin `invoice_id`, `ADVANCE_APPLIED` sin `source_line_id` y `ADVANCE` en USD → 23514;
  - dos líneas del mismo comprobante en un recibo → 23505;
  - IIBB sin jurisdicción y Ganancias con jurisdicción → 23514;
  - `CHECK` sin número → 23514.
  - Para insertar el comprobante: `INSERT` directo en `invoices` con `status = 'autorizada'` (solo `UPDATE`/`DELETE` tienen guarda), todo dentro del `BEGIN … ROLLBACK` del archivo.

**Verificación:**
- `npx prisma migrate deploy`; `npx prisma generate`.
- `psql \d customer_receipts`, `\d treasury_movements` (el CHECK nuevo).
- `SELECT slug FROM tabs WHERE id IN ('…005','…006')`.
- `npm run test:db` (RED antes de la migración: el archivo falla; GREEN después).
- `check-types`.

### Task 2: Reglas puras con tests unitarios

**Files** (módulos sin directiva en `src/features/Treasury/lib/`; cada uno con su `.test.ts`, escrito primero y visto fallar)
- `receipt-math.ts`:
  ```ts
  export const RATE_SCALE = 6;
  /** Pesos de una línea: round(applied × rate, 2), half-up (montos positivos). applied en centavos, rate en millonésimas. */
  export function appliedToArs(appliedCents: bigint, rateMicros: bigint): bigint;
  /** Importe en moneda del comprobante para `arsCents` pesos: round(ars / rate, 2), half-up. */
  export function arsToApplied(arsCents: bigint, rateMicros: bigint): bigint;
  /** applied × (rate − invoiceRate), redondeado al centavo (mitad lejos de cero). Con signo. */
  export function fxDifference(appliedCents: bigint, rateMicros: bigint, invoiceRateMicros: bigint): bigint;
  export type ReceiptLineAmounts = { kind: 'INVOICE' | 'ADVANCE' | 'ADVANCE_APPLIED'; amountArs: bigint; fxDifference: bigint };
  export type ReceiptTotals = {
    invoicesTotal: bigint; advanceTotal: bigint; advancesAppliedTotal: bigint;
    withholdingsTotal: bigint; receivedTotal: bigint; fxDifferenceTotal: bigint;
  };
  export function receiptTotals(input: { lines: ReceiptLineAmounts[]; withholdings: bigint[]; payments: bigint[] }): ReceiptTotals;
  /** (comprobantes + a cuenta) − (anticipos aplicados + retenciones + medios). > 0 faltan, < 0 sobran, 0 cierra. */
  export function closingGap(t: ReceiptTotals): bigint;
  /** "El recibo no cierra: faltan $ 1.250,00" / "…sobran…" / null si cierra. */
  export function closingError(gap: bigint): string | null;
  ```
  Tests:
  - `appliedToArs(100000n /*1000 USD*/, 1250500000n /*1250.5*/)` = `125050000n`;
  - el redondeo half-up de `appliedToArs` y de `arsToApplied`;
  - **ida y vuelta**: para un pendiente `p`, `arsToApplied(appliedToArs(p, r), r) === p` con 3 cotizaciones reales (Foco 1);
  - `fxDifference` positiva, negativa y 0 con cotizaciones iguales;
  - `receiptTotals` agrupa por kind;
  - `closingGap`: cierra, faltan y sobran; mensajes con `$ 1.250,00` (mismo formato de moneda que la etapa 1).
- `receipt-rules.ts`:
  ```ts
  /** Comprobantes que se cobran: facturas y notas de débito A, B y C. */
  export const COLLECTABLE_CBTE_TYPES = [1, 2, 6, 7, 11, 12] as const;
  export const CREDIT_NOTE_CBTE_TYPES = [3, 8, 13] as const;
  export function isCollectable(cbteType: number): boolean;
  /** Fecha valor del movimiento de un medio del recibo: la del cobro; en cheque y e-cheq, su vencimiento si es posterior. */
  export function receiptPaymentMovementDate(method: PaymentMethodKind, receiptDate: string, checkDueOn: string | null): string;
  export type ReceivableState = 'OVERDUE' | 'DUE' | 'IN_DRAFT';
  /** Estado en "A cobrar": en borrador si todo lo que queda está reservado; si no, vencido o por vencer contra `today`. */
  export function receivableState(input: { free: bigint; reserved: bigint; dueDate: string | null; today: string }): ReceivableState;
  export function overdueDays(dueDate: string | null, today: string): number;
  export const RECEIPT_STATUS_LABELS: Record<'DRAFT' | 'CONFIRMED' | 'CANCELLED', string>; // Borrador, Confirmado, Anulado
  ```
  Tests:
  - tipos cobrables y NC no cobrables;
  - cheque que vence después → su vencimiento; cheque vencido → fecha del cobro; transferencia → fecha del cobro;
  - estado con un vencimiento igual a hoy → `DUE` (todavía no vencido);
  - `IN_DRAFT` cuando el libre es 0 y hay reservado.
- `receipt-number-format.ts`: `formatReceiptNumber(n: number): string` → `RE-000001`. Test.
- `customer-statement-math.ts`:
  ```ts
  export type CustomerStatementEntry = {
    id: string; date: string; currency: string;
    kind: 'INVOICE' | 'DEBIT_NOTE' | 'CREDIT_NOTE' | 'RECEIPT' | 'ADVANCE' | 'ADVANCE_APPLIED';
    label: string; href: string; debit: string; credit: string;
  };
  export type CustomerStatementCurrency = { currency: string; previous: string; rows: (CustomerStatementEntry & { balance: string })[]; closing: string };
  /** Agrupa por moneda (ARS primero), ordena por fecha e id, y agrega saldo acumulado (debe − haber) desde `previous[currency]`. */
  export function buildCustomerStatement(previous: Record<string, string>, entries: CustomerStatementEntry[]): CustomerStatementCurrency[];
  ```
  Tests:
  - saldo anterior + filas;
  - dos monedas separadas, ARS primero;
  - una moneda con solo saldo anterior y sin filas aparece igual;
  - un anticipo al haber y su aplicación al debe dejan el saldo en 0.

**Verificación:** `npx vitest run src/features/Treasury/lib` (RED antes de implementar, GREEN después).

### Task 3: Lecturas de saldos de clientes

**Files**
- `src/features/Treasury/lib/receivables.ts` (server-only). Es la **única** definición SQL de pendiente y disponible (spec §2.6).
  ```ts
  type RawTx = Pick<Prisma.TransactionClient, '$queryRaw'>;
  export type InvoiceBalance = {
    invoiceId: string; companyId: string; customerId: string; cbteType: number; status: string;
    currency: string; exchangeRate: string; total: string;
    credited: string;   // NC autorizadas asociadas
    collected: string;  // líneas INVOICE en recibos CONFIRMED
    reserved: string;   // líneas INVOICE en recibos DRAFT (sin el excluido)
    pending: string;    // total − credited − collected − reserved
  };
  export async function invoiceBalances(tx: RawTx, invoiceIds: readonly string[], options?: { excludeReceiptId?: string }): Promise<Map<string, InvoiceBalance>>;
  export type CustomerAdvanceBalance = { lineId: string; receiptId: string; receiptNumber: string; customerId: string; companyId: string; date: string; amount: string; available: string; description: string | null };
  /** Solo líneas ADVANCE de recibos CONFIRMED; disponible = importe − ADVANCE_APPLIED en recibos DRAFT o CONFIRMED (sin el excluido). */
  export async function advanceBalances(tx: RawTx, lineIds: readonly string[], options?: { excludeReceiptId?: string }): Promise<Map<string, CustomerAdvanceBalance>>;
  export type OpenCustomerInvoice = InvoiceBalance & { label: string; salesPoint: number; number: number; issueDate: string; dueDate: string | null };
  /** Facturas y ND autorizadas del cliente con pendiente > 0 (contando el borrador excluido como libre), por vencimiento. */
  export async function openInvoicesOfCustomer(tx: RawTx, companyId: string, customerId: string, options?: { excludeReceiptId?: string }): Promise<OpenCustomerInvoice[]>;
  export async function availableAdvancesOfCustomer(tx: RawTx, companyId: string, customerId: string, options?: { excludeReceiptId?: string }): Promise<CustomerAdvanceBalance[]>;
  /** Saldo a favor por NC posteriores al cobro: suma de los pendientes negativos, por moneda. */
  export async function creditBalanceOfCustomer(tx: RawTx, companyId: string, customerId: string): Promise<Record<string, string>>;
  ```
  Las consultas siguen el SQL de `payment-balances.ts`: `SUM(...) FILTER (WHERE r.status = 'CONFIRMED')`, `FILTER (WHERE r.status = 'DRAFT' AND (excl IS NULL OR r.id <> excl))`, y para las NC una subconsulta `SELECT COALESCE(SUM(total),0) FROM invoices nc WHERE nc.associated_invoice_id = i.id AND nc.status = 'autorizada' AND nc.cbte_type IN (3,8,13)`. El `label` sale de `formatVoucherLabel(cbte_type, sales_points.number, number)`.
- `src/features/Treasury/lib/receipt-locks.ts` (server-only):
  ```ts
  export type LockedReceipt = { id: string; companyId: string; customerId: string; status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED'; number: string | null };
  /** SELECT … FROM customer_receipts WHERE id AND company_id FOR UPDATE. TreasuryError "El recibo no existe". */
  export async function lockReceipt(tx: RawTx, companyId: string, id: string): Promise<LockedReceipt>;
  /** Bloquea comprobantes y líneas ADVANCE de origen en orden de id (FOR UPDATE; no dispara la guarda de invoices). */
  export async function lockReceivables(tx: RawTx, invoiceIds: readonly string[], advanceLineIds: readonly string[]): Promise<void>;
  /** pg_advisory_xact_lock(hashtextextended('customer_withholding_cert:' || customerId, 0)). */
  export async function lockCustomerCertificates(tx: Pick<Prisma.TransactionClient, '$executeRaw'>, customerId: string): Promise<void>;
  ```
- `src/features/Treasury/lib/document-number.ts`: sumar `nextReceiptNumber(tx, companyId)`, igual que `nextTransferNumber`, con la clave `treasury_receipt_number:` y `MAX()` sobre `customer_receipts.number`.
- `src/features/Treasury/lib/customer-statement.ts` (server-only):
  ```ts
  export async function getCustomerStatement(db: RawTx & Pick<Prisma.TransactionClient, 'customers'>, companyId: string, customerId: string, from: string, to: string): Promise<{
    customer: { id: string; name: string; cuit: string };
    currencies: CustomerStatementCurrency[];
    advancesAvailable: string;
    creditBalance: Record<string, string>;
  }>;
  ```
  - Una consulta para el saldo anterior por moneda (`date < from`) y otra para las filas del período, cada una con `UNION ALL` de los tres orígenes:
    - comprobantes autorizados: los cobrables al debe, las NC al haber;
    - líneas `INVOICE` de recibos confirmados, al haber, en la moneda del comprobante, con la fecha del recibo;
    - líneas `ADVANCE` (haber) y `ADVANCE_APPLIED` (debe), en ARS.
  - Después, `buildCustomerStatement`.
  - Los `href` son `/dashboard/comercial/facturacion/<id>` y `/dashboard/treasury/receipts/<id>`.
- Tests: `src/features/Treasury/actions/receipts.integration.test.ts` (se crea acá; Task 4 lo amplía).
  - **Setup** con los mocks de `treasury.integration.test.ts`:
    - empresas `e9000000-…01` y `…02`, usuario `…03`;
    - un `sales_points`, dos `customers` y una cuenta banco + una caja;
    - un helper `insertInvoice({ cbteType, number, currency, exchangeRate, total, customerId, dueDate, associatedInvoiceId? })` que inserta en `invoices` con `status: 'autorizada'`, `environment: 'testing'`, `simulated: true`, `arca_currency_id`, `receiver_doc_number` y `receiver_vat_condition_id: 1`.
  - **`cleanup()`**:
    - adentro de un `prisma.$transaction` con `SET LOCAL session_replication_role = replica`, porque los comprobantes autorizados tienen guarda de `DELETE`;
    - borra, en este orden: movimientos, medios, retenciones, líneas, recibos, invoices, sales_points, customers, cuentas, profile y company.
  - Casos de esta task, contra las funciones de `lib/`:
    - pendiente = total − NC − cobrado − reservado;
    - `excludeReceiptId` libera lo del propio borrador;
    - un recibo anulado no cuenta;
    - disponible de un anticipo;
    - la NC posterior al cobro deja pendiente negativo y `creditBalanceOfCustomer` lo informa;
    - la cuenta corriente con saldo anterior y dos monedas.
- `scripts/test-treasury.sh`: sumar `src/features/Treasury/actions/receipts.integration.test.ts` a la llamada de vitest.

**Verificación:** `npm run test:treasury`; `check-types`.

### Task 4: Acciones del recibo

**Files**
- `src/features/Treasury/schemas/receipts.ts` (sin directiva):
  ```ts
  export const receiptFormSchema = z.object({
    customerId: z.string().uuid('Elegí el cliente'),
    date: z.string().regex(DATE_RE, 'Fecha inválida'),
    notes: z.string().trim().max(500),
    rates: z.array(z.object({ currency: z.enum(['USD', 'EUR']), rate: z.string().trim() })),
    invoices: z.array(z.object({ invoiceId: z.string().uuid(), amount: z.string().trim() })),       // en moneda del comprobante
    advancesApplied: z.array(z.object({ sourceLineId: z.string().uuid(), amount: z.string().trim() })),
    advance: z.object({ amount: z.string().trim(), description: z.string().trim().max(200) }),      // amount '' = sin cobro a cuenta
    withholdings: z.array(z.object({
      id: z.string(),                                                                               // '' = nueva
      tax: z.enum(['GANANCIAS', 'IVA', 'IIBB', 'SUSS']),
      jurisdiction: z.string().trim().max(60),
      certificateNumber: z.string().trim().min(1, 'Indicá el número').max(40),
      certificateDate: z.string().regex(DATE_RE, 'Fecha inválida'),
      amount: z.string().trim(),
    })),
    payments: z.array(z.object({
      method: z.enum(PAYMENT_METHODS), accountId: z.string(), amount: z.string().trim(), reference: z.string().trim().max(60),
      checkNumber: z.string().trim().max(30), checkBank: z.string().trim().max(60), checkDueOn: z.string().trim(),
    })),
  }).superRefine(/* importes > 0 (parseScaled); cotización > 0 con 6 decimales; jurisdicción si IIBB; cheque con número y vencimiento; cuenta elegida; sin comprobantes ni anticipos repetidos; sin dos cotizaciones de la misma moneda */);
  export type ReceiptFormValues = z.infer<typeof receiptFormSchema>;
  export const WITHHOLDING_TAX_LABELS: Record<'GANANCIAS' | 'IVA' | 'IIBB' | 'SUSS', string>;
  export const CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024;
  ```
  `DATE_RE` y `PAYMENT_METHODS` / `PAYMENT_METHOD_LABELS` se importan de `Purchases/schemas/payment-orders.ts`. El envío reusa `sendDocumentSchema` de `Purchases/schemas/send.ts`. Hay test unitario del schema: IIBB sin jurisdicción y cheque sin vencimiento fallan.
- `src/features/Treasury/lib/receipt-writer.ts` (server-only). Es el núcleo compartido por guardar y confirmar:
  ```ts
  type WriterTx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw' | 'customer_receipts' | 'customer_receipt_lines' | 'customer_receipt_withholdings' | 'customer_receipt_payments' | 'customers' | 'treasury_accounts'>;
  /**
   * Reemplaza líneas y medios del borrador y sincroniza retenciones por id (update / create /
   * delete). Valida contra la base (spec §3.1) con los comprobantes y anticipos ya bloqueados, y
   * recalcula los totales. Devuelve los ids de las retenciones en el orden del form y los paths
   * de los certificados de las retenciones borradas (se borran de MinIO después del commit).
   */
  export async function writeReceiptDraft(tx: WriterTx, input: { companyId: string; receiptId: string; isNew: boolean; values: ReceiptFormValues; today: string }): Promise<{ withholdingIds: string[]; removedFiles: string[]; totals: ReceiptTotals }>;
  ```
  Validaciones, con los mensajes de la spec §3.1 y §5:
  - cliente de la empresa; **activo solo al crear el borrador** (`isNew`). Un borrador existente de un cliente que después se desactivó se guarda, se confirma y se anula igual (spec §5);
  - fecha `<= today`;
  - cada comprobante: de la empresa y del cliente, `autorizada` y `isCollectable`;
  - `amount <= pending` (con `excludeReceiptId`). Si no: _"FA-A 0001-00000123: el pendiente es $ 50.000,00 y está reservado en otro borrador"_ cuando `reserved > 0`, o _"…el pendiente es $ X"_ si no;
  - en moneda extranjera, que haya cotización de esa moneda: _"Indicá la cotización del USD"_;
  - cada anticipo: del cliente, de un recibo confirmado y `amount <= available`;
  - cada cuenta: `assertActiveAccount`;
  - certificados: `lockCustomerCertificates` y búsqueda de `(customer, tax, number)` en otro recibo no anulado → _"El certificado 0001-00001234 de IIBB ya está cargado en RE-000002"_ (o "en un recibo en borrador");
  - cada línea `INVOICE` lleva `exchange_rate` = cotización del form (1 en ARS), `invoice_exchange_rate` = la de la factura, `amount_ars` y `fx_difference`.
- `src/features/Treasury/actions/receipts.server.ts` (`'use server'`; permisos `tesoreria:cobranzas:*`):
  ```ts
  export async function getReceiptFormData(input: { receiptId?: string; customerId?: string }): Promise<ActionResult<{
    customers: { id: string; name: string; cuit: string }[];          // activos, para el selector
    receipt: { id: string; values: ReceiptFormValues; withholdingFiles: Record<string, { name: string; url: string }> } | null;
    openInvoices: OpenCustomerInvoice[];                                // del cliente, sin contar este borrador
    advances: CustomerAdvanceBalance[];
    accounts: TreasuryAccountRow[];                                     // activas, con saldo (getTreasuryAccounts)
  }>>;
  export async function saveReceiptDraft(id: string | null, values: ReceiptFormValues): Promise<ActionResult<{ id: string; withholdingIds: string[] }>>; // create si id null (permiso create), si no update
  export async function deleteReceiptDraft(id: string): Promise<ActionResult>;                                   // delete; borra certificados después
  export async function confirmReceipt(id: string | null, values: ReceiptFormValues): Promise<ActionResult<{ id: string; number: string; withholdingIds: string[] }>>;
  export async function cancelReceipt(id: string, reason: string): Promise<ActionResult>;                         // delete
  export async function getReceiptDetail(id: string): Promise<ReceiptDetail | null>;                              // view
  export async function getReceiptPdf(id: string): Promise<ActionResult<{ filename: string; base64: string }>>;   // view
  export async function sendReceipt(id: string, values: SendDocumentValues): Promise<ActionResult>;              // update
  export type ReceiptDetail = { /* inferido del select: cabecera, cliente, líneas con label, retenciones con url, medios con cuenta y movimiento { id, date, future, cancelled } */ };
  ```
  - **`confirmReceipt`** (una transacción, spec §3.2):
    1. `lockReceipt` (o crea el borrador si `id` es null) y verifica `DRAFT`: _"El recibo ya fue confirmado"_;
    2. `lockReceivables`;
    3. `writeReceiptDraft`;
    4. `closingError(closingGap(totals))`;
    5. al menos una línea: _"Cargá al menos un comprobante, un anticipo o un cobro a cuenta"_;
    6. `nextReceiptNumber`;
    7. por cada medio, `createMovement(tx, { kind: 'CUSTOMER_RECEIPT', amountCents: +, date: receiptPaymentMovementDate(...), customerReceiptPaymentId, description: \`${number} — ${customer.name}${checkNumber ? \` — Cheque N° ${checkNumber}\` : ''}\` })`;
    8. `update` con `status: 'CONFIRMED'`, `number`, `confirmed_by` y `confirmed_at`.
  - **`cancelReceipt`**:
    - `lockReceipt` y verifica `CONFIRMED` (_"El recibo ya está anulado"_, _"Un borrador no se anula: borralo"_);
    - busca líneas `ADVANCE_APPLIED` de recibos no anulados que apunten a sus `ADVANCE`. Si las hay: _"El anticipo de este recibo se aplicó en RE-000005: anulá ese recibo primero"_ o _"…en un recibo en borrador: quitalo de ahí primero"_;
    - `cancelMovements(tx, { customerReceiptId: id }, …)`;
    - `status: 'CANCELLED'` con quién, cuándo y motivo.
  - **`sendReceipt`**, como `sendPaymentOrder`:
    - solo `CONFIRMED`;
    - `renderCustomerReceiptPdf`;
    - `sendCustomerReceiptEmail`;
    - si se envió, guarda `sent_at` / `sent_to`.
  - Después de cada mutación: `revalidateTreasury()` y `revalidatePath('/dashboard/comercial/facturacion', 'layout')`.
- `src/features/Treasury/lib/movements.ts`:
  - `CreateMovementInput.customerReceiptPaymentId?: string | null`, que se escribe en `customer_receipt_payment_id`;
  - `cancelMovements` acepta `customerReceiptId?: string` (`{ customer_receipt_payment: { receipt_id } }`);
  - `MovementsTx` suma lo que haga falta;
  - `LockedMovement.receiptNumber` (LEFT JOIN a medios y recibos);
  - `assertEditableMovement` suma `CUSTOMER_RECEIPT`: _"Este movimiento es del recibo RE-000001. Para revertirlo, anulá el recibo"_.
- `src/features/Treasury/actions/withholdings.server.ts` (`'use server'`):
  ```ts
  /** FormData { file }. Permiso retenciones-sufridas:update o cobranzas:update. Solo PDF ≤ 10 MB; recibo no anulado. */
  export async function attachWithholdingCertificate(withholdingId: string, formData: FormData): Promise<ActionResult<{ name: string; url: string }>>;
  ```
  - key `${companyId}/${customerId}/withholdings/${Date.now()}-${safeFileName(file.name)}` en `CUSTOMER_FILES_BUCKET = 'customer-documents'`, en `lib/storage-files.ts`;
  - sube, actualiza bajo `lockReceipt`, y después del commit borra el archivo anterior;
  - si la transacción falla, borra el nuevo (Foco 5);
  - `url` = `storagePublicUrl`.
- PDF:
  - `src/features/Treasury/pdf/receipt-pdf-data.ts` + test: arma filas, totales y la leyenda de diferencia de cambio desde datos planos;
  - `src/features/Treasury/pdf/ReceiptPdfDocument.tsx`: mismo estilo que `PaymentPdfDocuments.tsx`, reusando `loadReactPdf`, `loadCompanyLogo`, `companySource` y `COMPANY_SELECT` de `Purchases/pdf/render-purchase-pdf.server.ts`, con marca de agua "ANULADO" si está anulado;
  - `src/features/Treasury/pdf/render-receipt-pdf.server.ts`: `renderCustomerReceiptPdf(receiptId, companyId): Promise<RenderedPdf>`, con filename `RE-000001.pdf` (o `recibo-borrador.pdf`).
- Mail: `src/shared/lib/mail/templates/treasury.ts`, `sendCustomerReceiptEmail({ to, number, companyName, customerName, message, attachment }): Promise<boolean>`, con el texto de `sendSupplierDocumentEmail` para `payment`: _"{empresa} le envía el recibo {número} por los pagos recibidos, adjunto en PDF."_.
- Tests en `receipts.integration.test.ts`, con mocks de `@/shared/lib/storage` (`storageUpload`, `storageRemove` y `storagePublicUrl` como `vi.fn`) y de `@/shared/lib/mail/templates/treasury`:
  1. Borrador con factura ARS parcial + transferencia → sin número y sin movimientos. Confirmar → `RE-000001` y un movimiento `CUSTOMER_RECEIPT` positivo con la fecha del cobro; pendiente reducido.
  2. E-cheq a 30 días → movimiento con su vencimiento (futuro). Cheque con vencimiento ayer → fecha del cobro.
  3. **Foco 2**:
     - recibo con fecha `TODAY` se acepta; fecha `TOMORROW` → _"La fecha no puede ser futura"_;
     - cheque que vence `TODAY` → en el saldo (`getAccountIndicators`).
  4. **Foco 1**: factura USD 1.000,00 a 1.000; cobro a 1.250 de `applied = pendiente` → `amount_ars = 1.250.000,00`, `fx_difference = 250.000,00`, pendiente 0, ya no está en `openInvoicesOfCustomer`.
  5. Dos borradores con el mismo comprobante completo, guardados en paralelo (`Promise.all`) → uno ok y el otro con el mensaje de reservado.
  6. Dos `confirmReceipt` en paralelo de dos borradores distintos → `RE-000001` y `RE-000002`. Dos `confirmReceipt` del mismo borrador → uno ok y el otro _"El recibo ya fue confirmado"_, con un solo juego de movimientos.
  7. Recibo que no cierra → _"El recibo no cierra: faltan $ …"_; sigue en borrador.
  8. Comprobante de otro cliente y de otra empresa → _"El comprobante no existe"_; NC → _"Las notas de crédito no se cobran"_.
  9. **Foco 4**: con el borrador cargado, se inserta una NC autorizada por el total → `confirmReceipt` falla con el pendiente nuevo; el recibo sigue `DRAFT` y sin movimientos.
  10. Anticipo: recibo con excedente a cuenta → disponible. Otro recibo lo aplica sin medios → sin movimientos nuevos; el saldo de la cuenta no cambia.
  11. **Foco 3**: con el anticipo aplicado en un **borrador**, anular el recibo de origen → mensaje de borrador; el recibo sigue `CONFIRMED` y sus movimientos vigentes.
  12. Anular un recibo confirmado → movimientos anulados con el motivo, el pendiente vuelve, el número se conserva. Anular de nuevo → _"El recibo ya está anulado"_.
  13. Un recibo confirmado no se guarda: `saveReceiptDraft(id, …)` → _"El recibo ya fue confirmado"_.
  14. Certificado repetido (mismo cliente, impuesto y número) en otro recibo → mensaje con su número.
  15. **Foco 5**:
      - `attachWithholdingCertificate` dos veces → `storageRemove` se llama con el path anterior, después del update;
      - con la transacción forzada a fallar (recibo anulado entre medio), se borra el nuevo y no el anterior;
      - guardar el borrador sin esa retención → `storageRemove` con su path.
  16. `sendReceipt`:
      - de un borrador → error;
      - de un confirmado → llama al mail con el PDF y guarda `sent_to`;
      - si el mail devuelve `false` → no guarda.
  17. Permisos: con `tesoreria:cobranzas:delete` negado, `cancelReceipt` → `NO_PERMISSION`.
  18. Una NC posterior al cobro total → pendiente negativo y `creditBalance` lo informa.
  19. Movimiento `CUSTOMER_RECEIPT` editado desde Movimientos (`updateManualMovement`) → mensaje del recibo.
  20. Cliente desactivado con un borrador abierto → crear un recibo nuevo falla (_"El cliente está inactivo"_), pero ese borrador se confirma igual.

**Verificación:** `npm run test:treasury` (todos); `npx vitest run src/features/Treasury`; `check-types`.

### Task 5: Pantallas

**Files**
- `src/features/Treasury/TreasuryComponent.tsx`: dos tabs nuevas.
  - `cobranzas`, con ícono `HandCoins` y `CollectionsTabContent`;
  - `retenciones-sufridas`, con ícono `ReceiptText` y `WithholdingsTabContent`, que es el `<Suspense>` de la tabla de Task 6;
  - las dos con el skeleton `TreasurySectionSkeleton`.
- `src/features/Treasury/Collections/CollectionsTabContent.tsx` (Server Component):
  - toggle "A cobrar" / "Recibos" con `?view=receivables|receipts` (default `receivables`), con links que conservan `tab=cobranzas`;
  - botón **Nuevo recibo** (`cobranzas:create`) a `/dashboard/treasury/receipts/new`;
  - selector de cliente que lleva a `/dashboard/treasury/customers/[id]`;
  - monta la tabla de Task 6 según la vista.
  - Arriba de "A cobrar": `ReceivablesSummary`, tarjetas con el **vencido** y el **a vencer en 30 días** por moneda (`getReceivablesSummary()` en `actions/receipts.server.ts`, una consulta agregada sobre `invoiceBalances`).
- Páginas finas:
  - `src/app/dashboard/treasury/receipts/new/page.tsx` (`searchParams.customerId`, `searchParams.invoiceId`) → `ReceiptEditorPage`;
  - `src/app/dashboard/treasury/receipts/[id]/page.tsx` → `ReceiptPage`, que muestra el editor si el recibo es `DRAFT` y el detalle si no;
  - `src/app/dashboard/treasury/customers/[id]/page.tsx` → `CustomerStatementPage`.
  - Todas con `PermissionGuard`/`checkPermissionServer` y `NoPermission` como la página de extracto de la etapa 1.
- `src/features/Treasury/Collections/components/ReceiptEditor.tsx` (`'use client'`, RHF + `zodResolver(receiptFormSchema)`): un solo formulario con las 7 secciones de la spec §4.3, separadas por `<Separator />`.
  - **Cliente:** al cambiarlo, en el handler (sin `useEffect`), se resetean comprobantes y anticipos y se carga `getReceiptFormData({ customerId })` con `useQuery` (`enabled` por cliente).
  - **Comprobantes:**
    - check + importe;
    - "Total" fija el pendiente exacto (Foco 1);
    - en moneda extranjera, un input auxiliar "en pesos" convierte con `arsToApplied` al salir del campo;
    - la diferencia de cambio por línea se calcula con `receipt-math`.
  - **Retenciones:** `useFieldArray`, con un input de archivo por fila que guarda el `File` en estado local. Después de guardar o confirmar, se suben con `attachWithholdingCertificate(withholdingIds[i], formData)`.
  - **Medios:** `useFieldArray`; selector de cuenta con "Galicia — saldo $ X", como `RegisterPaymentDialog`; campos de cheque si el medio es `CHECK` o `ECHECK`.
  - **Resumen** `sticky bottom-0`, con `receiptTotals` + `closingGap` en vivo: "Cierra", "Faltan $ X" o "Sobran $ X", con `tabular-nums`.
  - **Botones:**
    - **Guardar borrador**: `saveReceiptDraft`; después navega a `/receipts/[id]` si era nuevo.
    - **Confirmar**: deshabilitado si no cierra. Abre un `AlertDialog` con el resumen y llama a `confirmReceipt`; después navega al detalle.
    - **Borrar borrador**: `cobranzas:delete`, con `AlertDialog`.
    - Todos `type="button"`, salvo el submit de guardar.
  - Al terminar, `invalidateTreasury(queryClient)` + `router.refresh()`.
- `src/features/Treasury/Collections/components/ReceiptDetailView.tsx`:
  - cabecera con número, estado (badge), cliente con link a la cuenta corriente, fecha y quién confirmó;
  - tablas simples (no DataTable) de comprobantes (link a Comercial), anticipos, retenciones (con "Adjuntar certificado" si no está anulado) y medios con su movimiento (link al extracto, badge "A acreditar");
  - diferencia de cambio total;
  - acciones:
    - **Descargar PDF**: `getReceiptPdf` → blob, como en Compras.
    - **Enviar al cliente**: `SendReceiptDialog` con RHF + `sendDocumentSchema`, que propone `client_email`.
    - **Anular**: `CancelReasonDialog` de la etapa 1.
  - Si está anulado: quién, cuándo y motivo.
- `src/features/Treasury/Customers/components/CustomerStatementView.tsx`, con el patrón de `AccountStatementView`:
  - encabezado con saldo por moneda, anticipos disponibles y saldo a favor;
  - Desde/Hasta (default: mes en curso), con `useQuery` sobre `getCustomerStatementData` (`actions/customer-statement.server.ts`, permiso `cobranzas:view`);
  - una tabla por moneda con saldo anterior, filas linkeadas y saldo final;
  - Excel con `exportToExcel`.
- `src/features/Treasury/actions/customer-statement.server.ts`:
  - `getCustomerStatementData(customerId, from, to)`;
  - `getInvoiceReceivable(invoiceId): Promise<{ pending: string; currency: string; customerId: string } | null>`, que devuelve null sin permiso o si no es cobrable.
- Comercial (solo los dos links, spec §4.6):
  - `src/features/Comercial/Facturacion/InvoicePage.tsx`: si `permissionsMap['tesoreria:cobranzas:view']`, carga `getInvoiceReceivable(id)` y lo pasa a `InvoiceDetail` como prop `receivable` (opcional).
  - `components/detail/InvoiceDetail.tsx`: si hay `receivable`, una línea _"Pendiente de cobro: USD 1.000,00 · Ver cuenta corriente"_ y el botón "Cobrar" (`cobranzas:create`) a `/dashboard/treasury/receipts/new?customerId=…&invoiceId=…`.
  - `src/features/Empresa/Clientes/components/CustomerDetail/CustomerDetail.tsx`: botón **Cuenta corriente** en la cabecera, junto a "Cerrar", envuelto en `<PermissionGuard module="tesoreria" tab="cobranzas" action="view">`, con link a `/dashboard/treasury/customers/${customer.id}`.
- Origen del movimiento en la etapa 1 (lo que no es DataTable):
  - `lib/balances.ts`, `getAccountStatement`: seleccionar `customer_receipt_payment: { select: { receipt: { select: { id: true, number: true } } } }` y exponer `customerReceipt`;
  - `AccountStatementView.tsx`: link `/dashboard/treasury/receipts/${id}` y el origen en el Excel;
  - `actions/movements.server.ts`, `getMovementDetail`: `customerReceipt`.
- Fallbacks en `src/features/Treasury/Collections/fallback/`: `ReceiptEditorSkeleton.tsx` y `CustomerStatementSkeleton.tsx`.
- `src/features/Treasury/lib/query-keys.ts`: sumar `receivables`, `receipts`, `withholdings`, `customerStatement` y `receiptForm`. `invalidateTreasury` ya recorre todas.
- `src/features/Treasury/tab-permission-keys.test.ts`: subir el mínimo a 6 tabs.

**Verificación:**
- `check-types`; `npx vitest run src/features/Treasury/tab-permission-keys.test.ts`.
- Navegador como admin P4:
  - recibo desde "Nuevo recibo" con factura ARS, otra en USD, retención con PDF y dos medios;
  - "Faltan" y "Sobran" en vivo; confirmar;
  - detalle, PDF, envío y anulación;
  - cuenta corriente;
  - links desde la factura y la ficha del cliente;
  - en el extracto, el link al recibo;
  - todo a 375 px.

### Task 6: Tablas (agente `table-expert`)

Pasarle al agente:
- la spec §4.2 y §4.5;
- las funciones de `lib/receivables.ts` (la tabla **no** recalcula el pendiente por su cuenta);
- las acciones de fila de Task 5;
- las reglas de `datatable.md` / `datatable-filters.md`.

Tablas:
- **A cobrar** (`Collections/ReceivablesList/`):
  - Columnas: cliente, comprobante (label), fecha, vencimiento, moneda, total, pendiente, días de atraso, estado (Vencido / Por vencer / En borrador).
  - Acción **Cobrar** (`cobranzas:create`) a `/dashboard/treasury/receipts/new?customerId=…&invoiceId=…`.
  - La query paginada filtra `pending > 0` con el mismo SQL de `invoiceBalances` (o la reusa con una CTE exportada desde `receivables.ts`, sin duplicar la fórmula).
- **Recibos** (`Collections/ReceiptsList/`):
  - Columnas: número ("Borrador" si null), fecha, cliente, estado, comprobantes (cantidad), retenciones, total recibido, enviado (Sí/No).
  - Cada fila linkea a `/dashboard/treasury/receipts/[id]`.
- **Retenciones sufridas** (`Withholdings/WithholdingsList/`):
  - Solo de recibos `CONFIRMED`.
  - Columnas: fecha del certificado, impuesto, jurisdicción, número, cliente, CUIT, recibo (link), importe, certificado ("Ver" o badge "Sin certificado").
  - Filtro de rango de fechas, por defecto el mes en curso. Totales por impuesto del filtro activo arriba de la tabla.
  - Excel con la columna "Certificado": URL absoluta `window.location.origin + storagePublicUrl(...)`, o vacía.
  - Acción **Adjuntar certificado** (`retenciones-sufridas:update`).
- **Movimientos** (tabla de la etapa 1): el origen `CUSTOMER_RECEIPT` muestra el número del recibo con link, y el filtro de texto de origen busca también por número de recibo (`MovementsList/actions.server.ts` + `columns.tsx`).

**Verificación:** `check-types`; navegador (filtros, facets, export, acciones, totales).

### Task 7: Demo

- `scripts/demo/domains/customer-receipts.ts`, función `seedCustomerReceipts(ctx)`, llamada en `reset.ts` después de `seedTreasury(ctx)`.
  - **Comprobantes** autorizados simulados en el punto de venta `demoId('sales_point', 'casa-central')`:
    - `environment` el de la demo, `simulated: true`, `cae` ficticio de 14 dígitos, números correlativos por tipo;
    - receptor tomado del cliente;
    - clientes: `andes`, `vaca_muerta`, `petro_comahue` y `neuquen_og`;
    - facturas A en ARS (dos vencidas);
    - una ND A;
    - una NC A asociada a una factura;
    - una factura A en USD con `exchange_rate` 1.050.
    - Se insertan con `tx.invoices.create` directo: no hay guarda en el `INSERT`.
  - **Recibos**, con los casos de la spec §7, insertados directo con sus líneas, retenciones, medios y movimientos `CUSTOMER_RECEIPT`, aplicando `receiptPaymentMovementDate`. Los números van de `RE-000001` a `RE-000006`; el borrador va sin número.
  - **Certificado** de ejemplo con `addPdf(ctx, 'customer-documents', key, …)`.
  - **`verify`:**
    - cada `customer_receipt_payments` tiene su movimiento;
    - el pendiente de cada comprobante (por `invoiceBalances` en SQL equivalente, sin importar `src/`) coincide con el esperado;
    - ningún anticipo queda con disponible negativo;
    - los saldos de las cuentas: extender el `verify` de `treasury.ts` para sumar los cobros, o verificar acá el delta.
- `scripts/demo/reset.ts`: sumar `'customer-documents'` a `ensureBuckets` y `{ bucket: 'customer-documents', prefix: \`${DEMO_COMPANY_ID}/\` }` a la poda. El borrado de tablas es genérico.

**Verificación:** reset de la demo con `verify` OK; en el navegador, "A cobrar" muestra vencidos y "En borrador", y RE-000003 muestra la diferencia de cambio y el e-cheq "A acreditar".

### Task 8: Manual

- `src/features/Ayuda/Manual/catalog/sections/tesoreria.ts`: guías nuevas.
  - `cobrar-facturas` (screens: `cobranzas` + `/dashboard/treasury/receipts/*`);
  - `cobros-en-moneda-extranjera`;
  - `anticipos-de-clientes`;
  - `retenciones-sufridas` (screen: tab `retenciones-sufridas`);
  - `cuenta-corriente-de-clientes` (screen: `/dashboard/treasury/customers/*`);
  - `anular-un-recibo`.
  - Todas con `access` a `tab('tesoreria', 'cobranzas')` o a `'retenciones-sufridas'`.
  - Sumar las tabs nuevas al `access` de la guía `tesoreria`, y `related` cruzados.
- MDX en `src/content/manual/tesoreria/` (uno por guía), en el tono de las de la etapa 1, con "qué es", "paso a paso" y "qué pasa si…".
- Actualizar:
  - `tesoreria.mdx` (la etapa 2 ya no es futura);
  - `cuentas-y-saldos.mdx` ("A acreditar" ahora incluye cheques recibidos);
  - `comercial/facturacion.mdx` (pendiente de cobro y link a la cuenta corriente);
  - `comercial/clientes.mdx` (botón Cuenta corriente).

**Verificación:** `npm run manual:check`.

### Task 9: Verificación final y commit de la etapa

- Correr todo:
  - `check-types`;
  - `npm test`, sin `DATABASE_URL` exportado;
  - `npm run test:db`, `npm run test:treasury`, `npm run test:purchases`, `npm run manual:check`;
  - `npx next build`, con el dev server parado y `tsconfig.tsbuildinfo` borrado;
  - navegador.
- Revisión final con un revisor nuevo (modelo más capaz) sobre `80a944a4..HEAD`. Cada Critical o Important se corrige con un test RED→GREEN.
- Commit `feat(tesoreria): etapa 2 - cobranzas, retenciones sufridas y cuenta corriente`, con el spec y el plan incluidos (sin `.codex/` ni `AGENTS.md`). Sin push.
