# Tesorería — Etapa 3a (cheques de terceros) — Plan de implementación

> **Para quien lo ejecute:** tarea por tarea, en orden, con ejecución nativa y una revisión final de todo el branch con un revisor nuevo. Al terminar: commit de la etapa (una línea). **Sin push ni PR**: se hacen al cerrar el módulo (etapa 4).

**Objetivo:** seguir cada cheque recibido de un cliente desde que entra a una cartera (recibo o carga inicial) hasta que sale (depósito, endoso en una orden de pago, descuento), con su rechazo, su deuda y sus anulaciones.

**Arquitectura:**
- La cartera es una cuenta de Tesorería más (`CHECK_PORTFOLIO`): su saldo sale del mismo libro `treasury_movements`.
- El cheque vive en `third_party_checks`; las operaciones que agrupan cheques, en `third_party_check_operations` (+ items); el historial, en `third_party_check_events`.
- **Única escritura del estado del cheque:** `lib/checks.ts`. Toda escritura del libro sigue pasando por `lib/movements.ts`.
- **Única definición de la deuda por cheques rechazados:** `lib/rejected-checks.ts`, con el patrón de `receivables.ts` (lección del 712).
- El endoso es un medio nuevo (`THIRD_PARTY_CHECK`) dentro de `registerPayment` de Compras.

**Stack:** Next.js 16, Prisma 7 + Postgres, React Query, RHF + Zod, shadcn, `@react-pdf/renderer`, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-11-tesoreria-etapa-3a-design.md` (fuente de verdad).
**Base:** rama `feat/tesoreria` en `cb8037bf`.

## Restricciones globales

- **Empresa y errores**
  - La empresa sale de la sesión (`getActiveCompanyId`); todo id que llega del cliente se valida contra ella (UUID con `UUID_RE` y `company_id`).
  - Mutaciones con `ActionResult`. Errores de negocio con `TreasuryError` (o `PurchaseError` en Compras), traducidos por `toTreasuryActionError` / `toPurchaseActionError`.
  - Funciones exportadas de archivos `'use server'` nunca reciben `companyId`. Los helpers server-only van en `lib/` con `import 'server-only'`.
- **Importes:** con `invoice-math` (`parseScaled`, `formatScaled`, `AMOUNT_SCALE = 2`), en BigInt de centavos. Nada de `Number` para montos.
- **Hora argentina (regla del usuario)**
  - "Hoy" es `treasuryToday()`. Nunca `moment()` pelado, `new Date().toISOString()` ni `CURRENT_DATE` para "hoy".
  - Columnas `@db.Date` con `dateOnly()` al escribir y `toISOString().slice(0, 10)` al leer.
  - Timestamps a la vista con `formatArgentinaDateTime` / `formatArgentinaDay`.
  - Toda función SQL nueva que calcule con fechas lleva `SET TimeZone = 'America/Argentina/Buenos_Aires'` (lo verifica `prisma/tests/06_timezone.sql`). Este plan no crea funciones SQL.
- **Escritura**
  - `treasury_movements`: solo `createMovement` / `cancelMovements` de `lib/movements.ts`.
  - `third_party_checks.status` y `third_party_check_events`: solo `lib/checks.ts`.
  - Deuda de cheques rechazados: solo `lib/rejected-checks.ts`.
- **Transacciones y tipos**
  - `withActor(profile.credentialId, fn, prisma, TRANSACTION_OPTIONS)`.
  - Cheques bloqueados con `SELECT … FOR UPDATE` en orden de id, y el estado se vuelve a validar dentro de la transacción.
  - Los tipos de `lib/` que reciben `tx` usan `Pick<Prisma.TransactionClient, …>` (TS2589 en `next build`).
- **Convenciones de código**
  - Sin `any` ni `console.*`; moment.js; código en inglés y UI en español.
  - Schemas Zod en `schemas/` sin directiva.
  - Clases de Tailwind escritas completas; `type="button"` en todo botón de un formulario que no guarda; fechas escribibles; nada de modales encadenados; nada de `useEffect` para reaccionar a cambios propios.
- **Migraciones**
  - Carpeta manual + `npx prisma migrate deploy`. En DEV se aplica sin pedir; en PROD nunca.
  - `ALTER TYPE … ADD VALUE` en una migración propia, antes de la que usa el valor.
  - CHECK e índices parciales en SQL, en la misma migración que las tablas.
- **Permisos**
  - Por migración, solo a `admin`, `administrador` y `full-access-provisional`. La tab va en `permissions-map.ts`.
  - Slug `cheques`, id `d0000000-0000-0000-0000-000000000007`.
- **Herramientas**
  - DataTables: agente `table-expert`.
  - Nada de `$var:x` en heredocs de zsh: generar archivos con Write.
- **Verificación**
  - `NODE_OPTIONS=--max-old-space-size=8192 npm run check-types`.
  - `npx next build` antes de cerrar, con el dev server parado y `tsconfig.tsbuildinfo` borrado.
  - Prohibido lint, prettier y format.
  - Los tests de integración corren sin `DATABASE_URL` exportado en `npm test`; con él, solo por `npm run test:treasury` / `npm run test:purchases`.

## Foco de revisión

1. **Depósito a la noche.**
   - Un depósito con fecha de hoy cargado a las 22:30 AR (en UTC ya es mañana) se acepta.
   - Un cheque con fecha de pago hoy se acredita hoy y entra al saldo del banco, no a "A acreditar".
   - Test en Task 5 con `TODAY = treasuryToday()`, y unitario en Task 2 con `TZ=UTC`.
2. **El mismo cheque en dos borradores de recibo.**
   - Los dos borradores se guardan (el aviso no bloquea).
   - Al confirmar el segundo, el índice único lo rechaza con el mensaje del cheque, no con un error 500.
   - El borrador queda como estaba.
   - Test en Task 4.
3. **Pagar una orden con un cheque que otro usuario acaba de depositar.**
   - `registerPayment` falla con "El cheque Nº … ya no está en cartera".
   - La orden sigue APROBADA, sin certificados numerados ni movimientos.
   - Test en Task 6.
4. **Rechazo de un depositado antes de su fecha de acreditación.**
   - La salida del banco va a `max(fecha del rechazo, acreditación)`.
   - El banco nunca queda con una salida anterior a la entrada de ese cheque.
   - Test en Task 5.
5. **Anular un rechazo cuya deuda se aplicó en un borrador.**
   - Se bloquea con el mensaje del borrador ("…está en un recibo en borrador: quitalo de ahí primero").
   - El cheque sigue RECHAZADO.
   - Test en Task 5, para el cliente y para el proveedor.

---

### Task 1: Esquema, migraciones, permisos y pgTAP

**Files**
- Modify `prisma/schema.prisma`:
  - `treasury_account_kind`: sumar `CHECK_PORTFOLIO`.
  - `treasury_movement_kind`: sumar `CHECK_OPERATION`.
  - `payment_method`: sumar `THIRD_PARTY_CHECK`.
  - `customer_receipt_line_kind`: sumar `REJECTED_CHECK`.
  - `payment_line_kind`: sumar `REJECTED_CHECK`.
  - Enums nuevos:
    ```prisma
    enum third_party_check_kind { PHYSICAL ECHECK  @@schema("public") }
    enum third_party_check_status { IN_PORTFOLIO DEPOSITED ENDORSED DISCOUNTED REJECTED CANCELLED  @@schema("public") }
    enum check_operation_kind { OPENING DEPOSIT DISCOUNT REJECTION  @@schema("public") }
    enum check_returned_by { BANK SUPPLIER  @@schema("public") }
    ```
  - Modelo `third_party_checks` (spec §2.2):
    - `id`, `company_id` (Cascade);
    - `kind`, `number String`, `bank String`, `drawer_name String`, `drawer_cuit String @db.VarChar(11)`;
    - `issue_date @db.Date`, `payment_date @db.Date`, `amount Decimal(15,2)`;
    - `customer_id` → `customers` (NoAction);
    - `status third_party_check_status @default(IN_PORTFOLIO)`;
    - `portfolio_id` → `treasury_accounts` (relación `"third_party_check_portfolio"`);
    - `receipt_payment_id String? @unique` → `customer_receipt_payments`;
    - `opening_operation_id String?` → `third_party_check_operations` (relación `"third_party_check_opening"`);
    - `credited_on @db.Date?`;
    - `bank_account_id String?` → `treasury_accounts` (relación `"third_party_check_bank"`);
    - `supplier_id String?` → `suppliers`;
    - `rejected_from third_party_check_status?`;
    - `created_by` → `profile` (relación `"third_party_check_creator"`), `created_at`, `updated_at @updatedAt`;
    - índices `(company_id, status)`, `(customer_id)`, `(supplier_id)`, `(portfolio_id)`.
  - Modelo `third_party_check_operations` (spec §2.3):
    - `id`, `company_id` (Cascade), `kind check_operation_kind`, `number String?`, `date @db.Date`;
    - `bank_account_id String?` → `treasury_accounts` (relación `"check_operation_bank"`);
    - `slip_number String?`, `interest Decimal(15,2) @default(0)`, `fee Decimal(15,2) @default(0)`, `reference String?`;
    - `reason String?`, `returned_by check_returned_by?`;
    - `created_by` (relación `"check_operation_creator"`), `created_at`;
    - `cancelled_by?` (relación `"check_operation_canceller"`), `cancelled_at?`, `cancel_reason?`;
    - `@@unique([company_id, kind, number])`; índice `(company_id, date)`.
  - Modelo `third_party_check_operation_items`:
    - `id`, `operation_id` (Cascade), `check_id` (NoAction);
    - `previous_status third_party_check_status`, `credited_on @db.Date?`;
    - `@@unique([operation_id, check_id])`; índice `(check_id)`.
  - Modelo `third_party_check_events` (spec §2.4):
    - `id`, `check_id` (Cascade), `from_status third_party_check_status?`, `to_status third_party_check_status`, `date @db.Date`;
    - `operation_id String?`, `receipt_id String?`, `payment_order_id String?` (FK NoAction);
    - `user_id` → `profile` (relación `"third_party_check_event_user"`), `created_at @default(now()) @db.Timestamptz(6)`;
    - índice `(check_id, created_at)`.
  - `customer_receipt_payments`: sumar `check_issue_date @db.Date?`, `drawer_name String?`, `drawer_cuit String? @db.VarChar(11)`, relación inversa `check third_party_checks?`.
  - `customer_receipt_lines`: sumar `third_party_check_id String?` → `third_party_checks`; índice.
  - `payment_order_lines`: sumar `third_party_check_id String?` → `third_party_checks`; índice.
  - `payment_order_payments`: sumar `third_party_check_id String?` → `third_party_checks`; índice (sin unique: un cheque puede volver a endosarse después de una anulación).
  - `treasury_movements`: sumar `check_operation_id String?` → `third_party_check_operations` y `third_party_check_id String?` → `third_party_checks`; índices de los dos.
  - Relaciones inversas en `company`, `customers`, `suppliers`, `treasury_accounts`, `profile`, `customer_receipts`, `payment_orders`.
- Create `prisma/migrations/20261016100000_treasury_checks_enum/migration.sql`: solo los `ALTER TYPE … ADD VALUE` de los 5 enums existentes.
- Create `prisma/migrations/20261016100050_treasury_checks/migration.sql`:
  - el diff sin drift (`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`), quedándose solo con lo de estas tablas, columnas y enums nuevos;
  - estos CHECK e índices:
  ```sql
  ALTER TABLE treasury_movements DROP CONSTRAINT treasury_movements_origin_check;
  ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_origin_check CHECK (
    (kind = 'OPENING' AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL)
    OR (kind = 'MANUAL' AND concept_id IS NOT NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL)
    OR (kind = 'TRANSFER' AND transfer_id IS NOT NULL AND concept_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL)
    OR (kind = 'SUPPLIER_PAYMENT' AND payment_order_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL AND amount < 0)
    OR (kind = 'CUSTOMER_RECEIPT' AND customer_receipt_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND check_operation_id IS NULL AND amount > 0)
    OR (kind = 'CHECK_OPERATION' AND check_operation_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL)
  );

  ALTER TABLE third_party_checks ADD CONSTRAINT third_party_checks_data_check CHECK (
    amount > 0 AND payment_date >= issue_date AND drawer_cuit ~ '^[0-9]{11}$'
    AND length(trim(number)) > 0 AND length(trim(bank)) > 0
    AND ((receipt_payment_id IS NULL) <> (opening_operation_id IS NULL))
  );
  ALTER TABLE third_party_checks ADD CONSTRAINT third_party_checks_state_check CHECK (
    (status IN ('IN_PORTFOLIO', 'CANCELLED') AND credited_on IS NULL AND bank_account_id IS NULL AND supplier_id IS NULL AND rejected_from IS NULL)
    OR (status = 'DEPOSITED' AND credited_on IS NOT NULL AND bank_account_id IS NOT NULL AND supplier_id IS NULL AND rejected_from IS NULL)
    OR (status = 'ENDORSED' AND supplier_id IS NOT NULL AND credited_on IS NULL AND bank_account_id IS NULL AND rejected_from IS NULL)
    OR (status = 'DISCOUNTED' AND bank_account_id IS NOT NULL AND credited_on IS NULL AND supplier_id IS NULL AND rejected_from IS NULL)
    OR (status = 'REJECTED' AND rejected_from IN ('DEPOSITED', 'ENDORSED', 'DISCOUNTED')
        AND (rejected_from <> 'ENDORSED' OR supplier_id IS NOT NULL)
        AND (rejected_from = 'ENDORSED' OR bank_account_id IS NOT NULL))
  );
  CREATE UNIQUE INDEX third_party_checks_alive_key ON third_party_checks (company_id, bank, number, drawer_cuit) WHERE status <> 'CANCELLED';

  ALTER TABLE third_party_check_operations ADD CONSTRAINT third_party_check_operations_kind_check CHECK (
    interest >= 0 AND fee >= 0
    AND ((kind = 'OPENING') = (number IS NULL))
    AND ((kind IN ('DEPOSIT', 'DISCOUNT')) = (bank_account_id IS NOT NULL))
    AND ((kind = 'REJECTION') = (reason IS NOT NULL AND returned_by IS NOT NULL))
    AND (kind = 'DISCOUNT' OR (interest = 0 AND fee = 0 AND reference IS NULL))
    AND (kind = 'DEPOSIT' OR slip_number IS NULL)
    AND ((cancelled_at IS NULL) = (cancelled_by IS NULL) AND (cancelled_at IS NULL) = (cancel_reason IS NULL))
  );

  ALTER TABLE third_party_check_events ADD CONSTRAINT third_party_check_events_origin_check CHECK (
    num_nonnulls(operation_id, receipt_id, payment_order_id) = 1
  );

  ALTER TABLE customer_receipt_payments DROP CONSTRAINT customer_receipt_payments_check;
  ALTER TABLE customer_receipt_payments ADD CONSTRAINT customer_receipt_payments_check CHECK (
    amount > 0 AND method <> 'THIRD_PARTY_CHECK'
    AND (method NOT IN ('CHECK','ECHECK') OR (check_number IS NOT NULL AND check_due_on IS NOT NULL))
  );

  ALTER TABLE customer_receipt_lines DROP CONSTRAINT customer_receipt_lines_kind_check;
  ALTER TABLE customer_receipt_lines ADD CONSTRAINT customer_receipt_lines_kind_check CHECK (
    (kind = 'INVOICE' AND invoice_id IS NOT NULL AND source_line_id IS NULL AND third_party_check_id IS NULL)
    OR (kind = 'ADVANCE' AND invoice_id IS NULL AND source_line_id IS NULL AND third_party_check_id IS NULL AND currency = 'ARS' AND exchange_rate = 1)
    OR (kind = 'ADVANCE_APPLIED' AND source_line_id IS NOT NULL AND invoice_id IS NULL AND third_party_check_id IS NULL AND currency = 'ARS' AND exchange_rate = 1)
    OR (kind = 'REJECTED_CHECK' AND third_party_check_id IS NOT NULL AND invoice_id IS NULL AND source_line_id IS NULL AND currency = 'ARS' AND exchange_rate = 1)
  );
  CREATE UNIQUE INDEX customer_receipt_lines_one_check ON customer_receipt_lines (receipt_id, third_party_check_id) WHERE third_party_check_id IS NOT NULL;

  ALTER TABLE payment_order_lines DROP CONSTRAINT payment_order_lines_kind_check;
  ALTER TABLE payment_order_lines ADD CONSTRAINT payment_order_lines_kind_check CHECK (
    (kind IN ('INVOICE', 'CREDIT_NOTE') AND invoice_id IS NOT NULL AND source_line_id IS NULL AND purchase_order_id IS NULL AND third_party_check_id IS NULL)
    OR (kind = 'ADVANCE' AND invoice_id IS NULL AND source_line_id IS NULL AND third_party_check_id IS NULL)
    OR (kind = 'ADVANCE_APPLIED' AND source_line_id IS NOT NULL AND invoice_id IS NULL AND purchase_order_id IS NULL AND third_party_check_id IS NULL)
    OR (kind = 'REJECTED_CHECK' AND third_party_check_id IS NOT NULL AND invoice_id IS NULL AND source_line_id IS NULL AND purchase_order_id IS NULL)
  );

  ALTER TABLE payment_order_payments DROP CONSTRAINT payment_order_payments_check_check;
  ALTER TABLE payment_order_payments ADD CONSTRAINT payment_order_payments_check_check CHECK (
    (method NOT IN ('CHECK', 'ECHECK') OR (check_number IS NOT NULL AND check_due_on IS NOT NULL))
    AND ((method = 'THIRD_PARTY_CHECK') = (third_party_check_id IS NOT NULL))
  );
  ```
  - Si el nombre real de algún CHECK difiere, tomarlo de `\d tabla` antes de escribir el `DROP`.
- Create `prisma/migrations/20261016100100_treasury_checks_permissions/migration.sql`, con el SQL de `20261014100100_treasury_collections_permissions`:
  - tab `d0000000-0000-0000-0000-000000000007`, `cheques` "Cheques" ("Cartera de cheques de terceros: depósitos, descuentos y rechazos"), orden 5;
  - `UPDATE tabs SET order_index = 6 WHERE id = 'd0000000-0000-0000-0000-000000000006'` (Retenciones sufridas, después de Cheques);
  - permisos `view, create, update, delete` a los 3 roles de sistema.
- Modify:
  - `src/features/Permissions/permissions-map.ts`: tab `cheques` entre `cobranzas` y `retenciones-sufridas`, con el comentario de las acciones (spec §4.1).
  - `src/features/Layout/sidebar/constants/navigation.ts`: sub-item "Cheques" (`tabSlug: 'cheques'`) entre Cobranzas y Retenciones sufridas; ícono `'tesoreria:cheques': Banknote`.
  - `src/features/Treasury/tab-permission-keys.test.ts`: subir el mínimo a 7 tabs.
- Create `prisma/tests/07_treasury_checks.sql` (pgTAP, `BEGIN … ROLLBACK`, datos con prefijo `a7000000-`):
  - existen las 4 tablas;
  - `CHECK_OPERATION` sin `check_operation_id` → 23514; `MANUAL` con `check_operation_id` → 23514;
  - cheque con importe 0, fecha de pago anterior a la emisión, CUIT de 10 dígitos o sin origen → 23514;
  - `DEPOSITED` sin `credited_on`, `ENDORSED` sin proveedor, `REJECTED` sin `rejected_from` → 23514;
  - dos cheques vigentes con el mismo banco, número y CUIT → 23505; si el primero está `CANCELLED` → OK;
  - operación `DEPOSIT` sin banco, `REJECTION` sin motivo y `OPENING` con número → 23514;
  - `CL-000001` repetido en la empresa → 23505;
  - evento con dos orígenes → 23514;
  - medio de recibo `THIRD_PARTY_CHECK` → 23514;
  - línea `REJECTED_CHECK` sin cheque (recibo y orden) → 23514;
  - medio de orden `THIRD_PARTY_CHECK` sin cheque → 23514.

**Verificación:**
- `npm run test:db` antes de la migración (el archivo 07 falla: RED).
- `npx prisma migrate deploy`; `npx prisma generate`.
- `psql`: `\d third_party_checks`, `\d treasury_movements`, `SELECT slug, order_index FROM tabs WHERE module_id = 'd0000000-0000-0000-0000-000000000000' ORDER BY order_index`.
- `npm run test:db` (GREEN, con el 06 incluido); `check-types` (va a fallar en los `Record<payment_method, …>` y `Record<treasury_account_kind, …>`: se arreglan en Task 2).

### Task 2: Reglas puras y schemas con tests unitarios

**Files** (módulos sin directiva; cada uno con su `.test.ts`, escrito primero y visto fallar)
- `src/features/Treasury/lib/checks-dates.ts`:
  ```ts
  export const DEPOSIT_WINDOW_DAYS = 30;
  export const DUE_SOON_DAYS = 5;
  /** Último día para presentar el cheque: fecha de pago + 30 días (YYYY-MM-DD, aritmética de fecha pura con moment.utc). */
  export function depositDeadline(paymentDate: string): string;
  export type DepositWarning = 'OK' | 'DUE_SOON' | 'EXPIRED';
  /** Solo tiene sentido EN CARTERA: EXPIRED si today > deadline; DUE_SOON si faltan 0 a 5 días; si no, OK. */
  export function depositWarning(paymentDate: string, today: string): DepositWarning;
  /** Acreditación mínima de un cheque depositado: la mayor entre el depósito y la fecha de pago. */
  export function minCreditDate(depositDate: string, paymentDate: string): string;
  /** Fecha de la salida del banco por un rechazo: max(rechazo, acreditación). Spec Foco 4. */
  export function rejectionMovementDate(rejectionDate: string, creditedOn: string | null): string;
  export const DEPOSIT_WARNING_LABELS: Record<DepositWarning, string>; // '', 'Por vencer', 'Vencido para depositar'
  ```
  Tests:
  - `depositDeadline('2026-10-11')` = `'2026-11-10'`; cruce de mes y de año;
  - `depositWarning` en los límites: faltan 6 → OK, faltan 5 → DUE_SOON, faltan 0 → DUE_SOON, pasado 1 → EXPIRED;
  - `minCreditDate` en los dos órdenes;
  - `rejectionMovementDate` con acreditación futura, pasada y `null`;
  - **Foco 1:** con `vi.setSystemTime(new Date('2026-10-12T01:30:00Z'))` (22:30 AR del 11), `depositWarning(x, treasuryToday())` usa el 11. Correrlo también con `TZ=UTC npx vitest run src/features/Treasury/lib/checks-dates.test.ts`.
- `src/features/Treasury/lib/check-discount.ts`:
  ```ts
  /** neto = nominal − intereses − comisión, en centavos. */
  export function discountNet(input: { nominals: bigint[]; interest: bigint; fee: bigint }): { nominal: bigint; net: bigint };
  /** "El neto da $ -1.000,00: los intereses y la comisión superan el nominal" o null si el neto es > 0. */
  export function discountError(net: bigint): string | null;
  ```
  Tests: suma de varios cheques; neto exacto al centavo; neto 0 y negativo → mensaje con `$ ` y formato de la etapa 1.
- `src/features/Treasury/lib/check-transitions.ts`:
  ```ts
  export type CheckStatus = 'IN_PORTFOLIO' | 'DEPOSITED' | 'ENDORSED' | 'DISCOUNTED' | 'REJECTED' | 'CANCELLED';
  export type CheckAction = 'DEPOSIT' | 'ENDORSE' | 'DISCOUNT' | 'REJECT' | 'CANCEL_ORIGIN' | 'UNDO_EXIT' | 'UNDO_REJECTION';
  /** Estado resultante, o null si la transición no está permitida (spec §3.1). UNDO_REJECTION devuelve `rejectedFrom`. */
  export function nextCheckStatus(from: CheckStatus, action: CheckAction, rejectedFrom?: CheckStatus | null): CheckStatus | null;
  export const CHECK_STATUS_LABELS: Record<CheckStatus, string>; // En cartera, Depositado, Endosado, Descontado, Rechazado, Anulado
  export const CHECK_KIND_LABELS: Record<'PHYSICAL' | 'ECHECK', string>; // Cheque, E-cheq
  /** "El cheque Nº 123 (Banco Galicia) está Depositado: no se puede endosar". */
  export function transitionError(check: { number: string; bank: string; status: CheckStatus }, action: CheckAction): string;
  ```
  Tests: la tabla completa de spec §3.1 (7 válidas), y todas las combinaciones restantes de `CheckStatus × CheckAction` devuelven null.
- `src/features/Treasury/lib/check-number-format.ts`:
  ```ts
  export const CHECK_OPERATION_PREFIX = { DEPOSIT: 'CD', DISCOUNT: 'CL', REJECTION: 'CR' } as const;
  export function formatCheckOperationNumber(kind: keyof typeof CHECK_OPERATION_PREFIX, n: number): string; // CD-000001
  /** Banco normalizado para el índice único: trim, espacios simples, mayúsculas. */
  export function normalizeBank(bank: string): string;
  ```
  Tests: `formatCheckOperationNumber('DISCOUNT', 12)` = `'CL-000012'`; `normalizeBank('  banco   galicia ')` = `'BANCO GALICIA'`.
- `src/features/Treasury/schemas/checks.ts`:
  ```ts
  /** Datos de un cheque, compartidos por el recibo y la carga inicial. */
  export const checkDataSchema = z.object({
    kind: z.enum(['PHYSICAL', 'ECHECK']),
    number: z.string().trim().min(1, 'Indicá el número del cheque').max(30),
    bank: z.string().trim().min(1, 'Indicá el banco').max(60),
    drawerName: z.string().trim().min(1, 'Indicá el librador').max(120),
    drawerCuit: z.string().trim().refine(isValidCuit, 'CUIT inválido'),
    issueDate: z.string().trim().regex(DATE_RE, 'Fecha inválida'),
    paymentDate: z.string().trim().regex(DATE_RE, 'Fecha inválida'),
    amount: z.string().trim().refine(isPositiveAmount, 'Importe inválido'),
  }).refine((c) => c.paymentDate >= c.issueDate, { path: ['paymentDate'], message: 'La fecha de pago no puede ser anterior a la de emisión' });
  export const openingChecksSchema = z.object({ portfolioId: z.string().uuid('Elegí la cartera'), date: dateField, customerId: z.string().uuid('Elegí el cliente'), checks: z.array(checkDataSchema).min(1, 'Cargá al menos un cheque') });
  export const depositSchema = z.object({ bankAccountId: z.string().uuid('Elegí la cuenta'), date: dateField, slipNumber: z.string().trim().max(40), items: z.array(z.object({ checkId: z.string().uuid(), creditedOn: dateField })).min(1, 'Elegí al menos un cheque') });
  export const discountSchema = z.object({ bankAccountId: z.string().uuid('Elegí la cuenta'), date: dateField, interest: nonNegativeAmount, fee: nonNegativeAmount, reference: z.string().trim().max(60), checkIds: z.array(z.string().uuid()).min(1, 'Elegí al menos un cheque') });
  export const rejectionSchema = z.object({ checkId: z.string().uuid(), date: dateField, reason: z.string().trim().min(1, 'Indicá el motivo').max(300), returnedBy: z.enum(['BANK', 'SUPPLIER']) });
  export type …Values = z.infer<…> (uno por schema);
  export const RETURNED_BY_LABELS: Record<'BANK' | 'SUPPLIER', string>; // Banco, Proveedor
  ```
  - `isValidCuit` se importa de `@/features/Empresa/General/lib/company-form` (módulo puro); `DATE_RE` e `isPositiveAmount` de `./shared`.
  - `depositSchema` rechaza ids repetidos; `discountSchema`, también.
  - Tests: CUIT con dígito verificador mal, fecha de pago anterior, ids repetidos, intereses negativos.
- `src/features/Treasury/schemas/receipts.ts`:
  - `payments[]` suma `checkIssueDate`, `drawerName`, `drawerCuit` (strings, `''` por defecto en `emptyReceiptPayment`).
  - En `CHECK`/`ECHECK` el `superRefine` exige banco, fecha de emisión, librador, CUIT válido y fecha de pago ≥ emisión (mismos mensajes que `checkDataSchema`).
  - Suma `rejectedChecks: z.array(z.object({ checkId: z.string().uuid('Cheque inválido'), amount: z.string().trim() }))`, con importe > 0 y sin repetidos; `emptyReceiptForm` lo inicializa en `[]`.
  - Test: cheque sin librador o con CUIT inválido falla; transferencia sin esos campos pasa.
- `src/features/Purchases/schemas/payment-orders.ts`:
  - `PAYMENT_METHODS` queda igual (los 4 del recibo).
  - `SUPPLIER_PAYMENT_METHODS = [...PAYMENT_METHODS, 'THIRD_PARTY_CHECK'] as const`.
  - `PAYMENT_METHOD_LABELS: Record<(typeof SUPPLIER_PAYMENT_METHODS)[number], string>` suma `THIRD_PARTY_CHECK: 'Cheque de tercero'`.
  - `registerPaymentFormSchema.payments[]`: `method: z.enum(SUPPLIER_PAYMENT_METHODS)` y `thirdPartyCheckId: z.string()`. En `THIRD_PARTY_CHECK` exige `thirdPartyCheckId` UUID y no exige cuenta ni importe (los pone el servidor); un mismo cheque dos veces → "El cheque está dos veces".
  - `PAYMENT_LINE_KINDS` suma `'REJECTED_CHECK'`; las líneas suman `checkId: z.string()`. La clave de repetido de una línea `REJECTED_CHECK` es su `checkId`.
  - Tests en `src/features/Purchases/schemas/payment-orders.test.ts` (crear si no existe).
- Arreglos de tipos que dispara Task 1:
  - `src/features/Purchases/Payments/PaymentOrdersList/columns.tsx`: `THIRD_PARTY_CHECK: 'Cheque de tercero'` en su `Record<payment_method, string>` y un ícono en `methodIcons` de `_PaymentOrdersDataTable.tsx`.
  - `src/features/Treasury/schemas/accounts.ts`: `TREASURY_ACCOUNT_KIND_LABELS` suma `CHECK_PORTFOLIO: 'Cartera de cheques'` y el enum del form suma `'CHECK_PORTFOLIO'`.
  - Cualquier otro `Record<…>` sobre estos enums que marque `check-types`.

**Verificación:** `npx vitest run src/features/Treasury/lib src/features/Treasury/schemas src/features/Purchases/schemas` (RED antes, GREEN después); `TZ=UTC npx vitest run src/features/Treasury/lib/checks-dates.test.ts`; `check-types`.

### Task 3: Núcleo server — cheques, libro y deudas

**Files**
- `src/features/Treasury/lib/movements.ts`:
  - `CreateMovementInput` suma `checkOperationId?: string | null` y `thirdPartyCheckId?: string | null`, que se escriben en sus columnas.
  - `cancelMovements` acepta `checkOperationId?: string` y `thirdPartyCheckId?: string` (este último solo junto con `paymentOrderId`, para anular el endoso de un cheque).
  - `assertActiveAccount` devuelve `kind: 'BANK' | 'CASH' | 'CHECK_PORTFOLIO'`.
  - Nuevas:
    ```ts
    /** Cuenta o caja de plata (no cartera): "La cartera «X» solo mueve cheques". */
    export async function assertMoneyAccount(tx, companyId, accountId): Promise<{ id: string; name: string; kind: 'BANK' | 'CASH' }>;
    /** Cartera activa de la empresa: "Elegí una cartera de cheques". */
    export async function assertPortfolioAccount(tx, companyId, accountId): Promise<{ id: string; name: string }>;
    /** Cuenta bancaria activa (depósito y descuento): "Elegí una cuenta bancaria". */
    export async function assertBankAccount(tx, companyId, accountId): Promise<{ id: string; name: string }>;
    ```
  - `LockedMovement` suma `checkOperationNumber: string | null` (LEFT JOIN) y `assertEditableMovement` suma `CHECK_OPERATION`: _"Este movimiento es de la operación de cheques CD-000001. Para revertirlo, anulá la operación"_ (o _"…de la carga inicial de cheques…"_ si no tiene número).
- Reemplazar `assertActiveAccount` por `assertMoneyAccount` en:
  - `actions/movements.server.ts` (alta, edición y saldo inicial);
  - `actions/transfers.server.ts` (las dos cuentas);
  - `receipt-writer.ts` para medios `TRANSFER`/`CASH` (los cheques usan `assertPortfolioAccount`, en Task 4);
  - `registerPayment` para los medios que no son `THIRD_PARTY_CHECK` (Task 6).
- `src/features/Treasury/lib/document-number.ts`: `nextCheckOperationNumber(tx, companyId, kind: 'DEPOSIT' | 'DISCOUNT' | 'REJECTION')`, igual que `nextTransferNumber`, con la clave `treasury_check_op_number:${kind}:` y `MAX()` sobre `third_party_check_operations.number` filtrado por `kind`.
- `src/features/Treasury/lib/checks.ts` (server-only):
  ```ts
  type ChecksTx = Pick<Prisma.TransactionClient, '$queryRaw' | 'third_party_checks' | 'third_party_check_events'>;
  export type LockedCheck = {
    id: string; companyId: string; number: string; bank: string; amount: string; status: CheckStatus;
    portfolioId: string; customerId: string; supplierId: string | null; bankAccountId: string | null;
    creditedOn: string | null; paymentDate: string; rejectedFrom: CheckStatus | null; drawerName: string;
  };
  /** SELECT … FROM third_party_checks WHERE id = ANY(ids) AND company_id FOR UPDATE, ORDER BY id. Falta alguno → "El cheque no existe". */
  export async function lockChecks(tx: ChecksTx, companyId: string, ids: readonly string[]): Promise<Map<string, LockedCheck>>;
  /** Valida con nextCheckStatus (si no, TreasuryError(transitionError(...))) y devuelve el estado nuevo. */
  export function assertTransition(check: LockedCheck, action: CheckAction): CheckStatus;
  /** Cambia el estado (con las columnas de §2.2 del estado nuevo) y escribe el evento. Único escritor de `status`. */
  export async function moveCheck(tx: ChecksTx, input: {
    check: LockedCheck; action: CheckAction; date: string; userId: string;
    origin: { operationId: string } | { receiptId: string } | { paymentOrderId: string };
    set?: { creditedOn?: string | null; bankAccountId?: string | null; supplierId?: string | null };
  }): Promise<CheckStatus>;
  /** Alta EN CARTERA (recibo o carga inicial) con su evento. Banco con normalizeBank. Un 23505 del índice único → TreasuryError("El cheque Nº … del banco … ya está en la cartera"). */
  export async function createCheck(tx: ChecksTx, input: {
    companyId: string; portfolioId: string; customerId: string; userId: string; date: string;
    data: { kind: 'PHYSICAL' | 'ECHECK'; number: string; bank: string; drawerName: string; drawerCuit: string; issueDate: string; paymentDate: string; amountCents: bigint };
    origin: { receiptPaymentId: string; receiptId: string } | { openingOperationId: string };
  }): Promise<{ id: string }>;
  /** Cheques vigentes iguales (banco normalizado, número, CUIT), para el aviso del recibo. */
  export async function findAliveDuplicates(db: Pick<Prisma.TransactionClient, 'third_party_checks'>, companyId: string, keys: { bank: string; number: string; drawerCuit: string }[]): Promise<{ number: string; bank: string; status: CheckStatus; id: string }[]>;
  ```
  - `moveCheck` aplica las columnas según el estado nuevo: `DEPOSITED` pone `credited_on` y `bank_account_id`; `ENDORSED`, `supplier_id`; `DISCOUNTED`, `bank_account_id`; `REJECTED`, `rejected_from = estado anterior` (conserva banco y proveedor); `UNDO_EXIT` (vuelta a cartera) limpia las tres; `UNDO_REJECTION` vuelve a `rejected_from` y lo limpia.
  - Captura del 23505: inspeccionar `Prisma.PrismaClientKnownRequestError` con `code === 'P2002'` y el `meta.target`/mensaje que nombre `third_party_checks_alive_key`. Como se ejecuta dentro de la transacción, el error aborta la transacción entera: el mensaje llega igual al usuario y nada queda a medias.
- `src/features/Treasury/lib/rejected-checks.ts` (server-only), **única** definición de la deuda (spec §2.7):
  ```ts
  type RawTx = Pick<Prisma.TransactionClient, '$queryRaw'>;
  export type RejectedCheckDebt = {
    checkId: string; companyId: string; customerId: string; supplierId: string | null;
    number: string; bank: string; drawerName: string; amount: string;
    rejectedOn: string;        // fecha de la operación de rechazo vigente
    rejectedFrom: CheckStatus;
    pending: string;           // del cliente o del proveedor, según la función
    reserved: string;          // en borradores (recibos DRAFT u órdenes DRAFT/PENDING_APPROVAL/APPROVED)
    label: string;             // "Cheque rechazado Nº 123 — BANCO GALICIA"
  };
  /** Deuda del cliente: importe − líneas REJECTED_CHECK en recibos DRAFT o CONFIRMED (sin el excluido). */
  export function customerCheckDebtSql(where: Prisma.Sql, excludeReceiptId: string | null): Prisma.Sql;
  export async function customerCheckDebts(tx: RawTx, checkIds: readonly string[], options?: { excludeReceiptId?: string }): Promise<Map<string, RejectedCheckDebt>>;
  export async function openCheckDebtsOfCustomer(tx: RawTx, companyId: string, customerId: string, options?: { excludeReceiptId?: string; include?: readonly string[] }): Promise<RejectedCheckDebt[]>;
  /** Deuda con el proveedor (solo rechazados desde ENDORSED): importe − líneas REJECTED_CHECK en órdenes no anuladas (sin la excluida). */
  export async function supplierCheckDebts(tx: RawTx, checkIds: readonly string[], options?: { excludeOrderId?: string }): Promise<Map<string, RejectedCheckDebt>>;
  export async function openCheckDebtsOfSupplier(tx: RawTx, companyId: string, supplierId: string, options?: { excludeOrderId?: string }): Promise<RejectedCheckDebt[]>;
  ```
  - `rejectedOn` sale de la operación `REJECTION` no anulada del cheque (`JOIN third_party_check_operation_items` + `third_party_check_operations` con `cancelled_at IS NULL`).
  - Solo cheques `status = 'REJECTED'`; los `open…` filtran `pending > 0` (o `include`).
- Tests: crear `src/features/Treasury/actions/checks.integration.test.ts`.
  - **Setup** con los mocks de `receipts.integration.test.ts`: empresas `e9300000-…01` y `…02`, usuario `…03`, un cliente, un proveedor, una cartera, un banco y una caja.
  - Helper `insertCheck(overrides)` que llama `createCheck` dentro de un `withActor`, con origen de carga inicial.
  - **`cleanup()`** en una transacción con `SET LOCAL session_replication_role = replica`, borrando en orden: eventos, items, movimientos, medios, líneas, recibos, órdenes de pago, cheques, operaciones, cuentas, cliente, proveedor, profile y company.
  - Casos de esta task:
    - `createCheck` deja EN CARTERA con un evento;
    - el mismo cheque con el banco escrito distinto (`'banco galicia '`) → mensaje de repetido;
    - `lockChecks` con un id de otra empresa → "El cheque no existe";
    - `moveCheck` con una transición inválida no escribe nada;
    - una cartera rechazada por `assertMoneyAccount` en `createManualMovement` y en `createTransfer` (vía las actions, con el mensaje);
    - `customerCheckDebts` y `supplierCheckDebts` sobre un cheque marcado REJECTED a mano (con su operación), con y sin `exclude…`.
- `scripts/test-treasury.sh`: sumar `src/features/Treasury/actions/checks.integration.test.ts`.

**Verificación:** `npm run test:treasury`; `check-types`.

### Task 4: Recibo con cheques y cobro de deudas

**Files**
- `src/features/Treasury/lib/receipt-math.ts`: `ReceiptLineAmounts.kind` suma `'REJECTED_CHECK'`; `receiptTotals` lo suma a `invoicesTotal` (es deuda cobrada). Test unitario.
- `src/features/Treasury/lib/receipt-writer.ts`:
  - Medios: `CHECK`/`ECHECK` → `assertPortfolioAccount` ("Los cheques van a una cartera de cheques"); `TRANSFER`/`CASH` → `assertMoneyAccount`.
  - Guarda en el medio `check_bank` normalizado, `check_issue_date`, `drawer_name` y `drawer_cuit`.
  - `WrittenPayment` suma `checkData` (lo que necesita `createCheck`) para cheques.
  - **Deudas:** `lockChecks` sobre los `rejectedChecks` del form; `customerCheckDebts(…, { excludeReceiptId })`; cada uno de la empresa, del cliente y RECHAZADO (_"El cheque Nº … no está rechazado"_), con `amount <= pending` (_"Cheque rechazado Nº …: la deuda es $ X"_ + _" y está reservada en otro borrador"_ si `reserved > 0`). Línea `REJECTED_CHECK`, ARS, `amount_ars = applied`, `third_party_check_id`.
- `src/features/Treasury/lib/receipt-rules.ts`: `receiptPaymentMovementDate` ya no se usa para cheques. Los cheques entran a la cartera a la fecha del recibo: simplificar a "siempre la fecha del cobro" y ajustar su test (el caso "cheque futuro → su vencimiento" pasa a "cheque → fecha del recibo").
- `src/features/Treasury/actions/receipts.server.ts`:
  - `confirmReceipt`: para cada medio cheque, después de `createMovement`, `createCheck(tx, { origin: { receiptPaymentId, receiptId }, date: v.date, portfolioId: p.accountId, customerId: v.customerId, … })`. La descripción del movimiento queda `${number} — ${customer} — Cheque N° ${n}`.
  - `cancelReceipt`: antes de anular, `lockChecks` sobre los cheques de sus medios; si alguno no está `IN_PORTFOLIO` → _"El cheque Nº … ya está Depositado: anulá primero esa operación"_. Después, `moveCheck(…, 'CANCEL_ORIGIN', origin: { receiptId })` para cada uno.
  - `getReceiptFormData` devuelve también:
    - `checkDebts: RejectedCheckDebt[]` (`openCheckDebtsOfCustomer`, con `include` de las del borrador);
    - `portfolios` (cuentas `CHECK_PORTFOLIO` activas con su saldo) separadas de `accounts` (las de plata);
    - `values.rejectedChecks` y los campos nuevos del cheque al editar un borrador.
  - Nueva `findDuplicateReceiptChecks(checks: { bank: string; number: string; drawerCuit: string }[]): Promise<ActionResult<{ number: string; bank: string; status: string }[]>>` (permiso `cobranzas:view`), para el aviso del editor.
  - `getReceiptDetail`: medios con `check { id, status }` (link al cheque) y líneas `REJECTED_CHECK` con su label.
- `src/features/Treasury/lib/customer-statement.ts` + `customer-statement-math.ts`:
  - `CustomerStatementEntry.kind` suma `'REJECTED_CHECK'`.
  - `UNION ALL` de dos orígenes más, en ARS: el rechazo (debe, fecha `rejectedOn`, label "Cheque rechazado Nº …", `href` `/dashboard/treasury/checks/<id>`) y las líneas `REJECTED_CHECK` de recibos confirmados (haber, fecha del recibo).
  - Test unitario de `buildCustomerStatement` con un rechazo y su cobro (saldo 0).
- `src/features/Treasury/pdf/receipt-pdf-data.ts` (+ test): la línea `REJECTED_CHECK` con su label; los medios cheque con librador.
- Tests en `checks.integration.test.ts`:
  1. Recibo con dos cheques a la cartera → al confirmar, dos cheques EN CARTERA con su evento (`receipt_id`) y dos movimientos `CUSTOMER_RECEIPT` a la cartera con la fecha del recibo; el saldo de la cartera sube.
  2. Cheque a una cuenta bancaria → _"Los cheques van a una cartera de cheques"_; transferencia a una cartera → _"La cartera «…» solo mueve cheques"_.
  3. **Foco 2:** dos borradores con el mismo cheque se guardan; el primero confirma; el segundo falla con el mensaje de repetido y sigue `DRAFT`, sin movimientos.
  4. Anular el recibo con los dos cheques EN CARTERA → ANULADOS, movimientos anulados; un cheque nuevo igual ya se puede cargar.
  5. Anular un recibo con un cheque ya depositado (`moveCheck` directo a DEPOSITED en el setup) → mensaje; nada cambia.
  6. Cobro de la deuda: con un cheque RECHAZADO, un recibo con línea `REJECTED_CHECK` parcial y otro por el resto → deuda 0; un tercero → mensaje de la deuda.
  7. Cuenta corriente del cliente: el rechazo al debe y el cobro al haber, saldo final 0.
  8. `findDuplicateReceiptChecks` encuentra el vigente y no el anulado.

**Verificación:** `npm run test:treasury`; `npx vitest run src/features/Treasury`; `check-types`.

### Task 5: Operaciones de la cartera

**Files**
- `src/features/Treasury/actions/checks.server.ts` (`'use server'`; permisos `tesoreria:cheques:*`):
  ```ts
  export async function createOpeningChecks(values: OpeningChecksValues): Promise<ActionResult<{ count: number }>>;           // create
  export async function depositChecks(values: DepositValues): Promise<ActionResult<{ id: string; number: string }>>;            // create
  export async function discountChecks(values: DiscountValues): Promise<ActionResult<{ id: string; number: string; net: string }>>; // create
  export async function rejectCheck(values: RejectionValues): Promise<ActionResult<{ id: string; number: string }>>;            // update
  export async function cancelCheckOperation(operationId: string, reason: string): Promise<ActionResult>;                       // delete
  /** Anula la carga inicial de UN cheque (spec §3.7, última fila). */
  export async function cancelOpeningCheck(checkId: string, reason: string): Promise<ActionResult>;                             // delete
  export async function getCheckDetail(checkId: string);                                                                        // view
  export async function getChecksHeader(): Promise<{ portfolios: { id: string; name: string; total: string; count: number }[]; dueSoon: number; expired: number }>; // view
  /** Para los formularios: cheques elegidos (EN CARTERA) con fecha de pago, y las cuentas bancarias activas. */
  export async function getCheckOperationFormData(checkIds: string[]);                                                          // view
  export type CheckDetail = Awaited<ReturnType<typeof getCheckDetail>>;
  ```
  - **Carga inicial** (spec §3.2 y Decisiones): `assertPortfolioAccount`, cliente de la empresa, fecha ≤ hoy. Crea una operación `OPENING` (sin número); por cheque, `createCheck` con origen `openingOperationId` y un movimiento `CHECK_OPERATION` + importe a la cartera, con `checkOperationId` y `thirdPartyCheckId`. Descripción: `Carga inicial — Cheque N° … — {cliente}`.
  - **Depósito** (spec §3.3):
    1. `assertBankAccount`; fecha ≤ hoy;
    2. `lockChecks`; por cheque `assertTransition('DEPOSIT')` y `creditedOn >= minCreditDate(date, paymentDate)` (_"Cheque Nº …: la acreditación no puede ser anterior al {dd/mm/aaaa}"_);
    3. `nextCheckOperationNumber('DEPOSIT')`; operación + items (`previous_status`, `credited_on`);
    4. por cheque: movimiento − importe en su cartera (fecha del depósito) y + importe en el banco (fecha `creditedOn`), los dos con `checkOperationId` y `thirdPartyCheckId`;
    5. `moveCheck(…, 'DEPOSIT', set: { creditedOn, bankAccountId })`.
  - **Descuento** (spec §3.5): igual, con `discountNet` / `discountError`; por cheque, salida de la cartera; una sola entrada del neto al banco (`thirdPartyCheckId: null`), descripción `CL-000001 — Descuento de N cheques`; `moveCheck(…, 'DISCOUNT', set: { bankAccountId })`.
  - **Rechazo** (spec §3.6):
    1. `lockChecks([checkId])`; `assertTransition('REJECT')`;
    2. la fecha no puede ser anterior a la de la operación de salida vigente (depósito, descuento o `paid_on` de la orden): _"La fecha del rechazo no puede ser anterior al {fecha} (depósito CD-000001)"_; ni futura;
    3. operación `REJECTION` con número, motivo y `returned_by`; item con `previous_status`;
    4. si venía de DEPOSITED o DISCOUNTED: movimiento − importe en `bank_account_id`, fecha `rejectionMovementDate(date, creditedOn)` (Foco 4);
    5. `moveCheck(…, 'REJECT')`.
  - **Anular operación** (spec §3.7):
    - bloquea la operación (`FOR UPDATE`); ya anulada → _"La operación ya está anulada"_; `OPENING` → usar `cancelOpeningCheck`;
    - `lockChecks` de sus items;
    - DEPOSIT/DISCOUNT: si algún cheque no está en el estado que dejó la operación → _"El cheque Nº … está Rechazado: anulá primero el rechazo CR-000003"_; si no, `moveCheck(…, 'UNDO_EXIT')` (vuelven a la cartera de origen, que nunca cambió);
    - REJECTION: busca líneas `REJECTED_CHECK` del cheque en recibos DRAFT/CONFIRMED o en órdenes no anuladas. Confirmado: _"La deuda del cheque se cobró en RE-000007: anulá ese recibo primero"_ (o _"…se pagó en la OP-000004…"_). Borrador: _"…está en un recibo en borrador: quitalo de ahí primero"_ (o _"…en una orden de pago sin pagar…"_) (Foco 5). Si no, `moveCheck(…, 'UNDO_REJECTION')`;
    - `cancelMovements(tx, { checkOperationId }, …)` y la anulación con quién, cuándo y motivo.
  - **`cancelOpeningCheck`:** el cheque tiene que estar EN CARTERA y venir de la carga inicial; anula su movimiento (`cancelMovements({ ids })` del movimiento con su `thirdPartyCheckId` y la operación) y `moveCheck(…, 'CANCEL_ORIGIN', origin: { operationId })`.
  - **`getCheckDetail`:** cheque con cliente, cartera, banco o proveedor de destino; vencimiento para depositar y aviso (`depositWarning(…, treasuryToday())`); eventos ordenados con usuario, fecha y hora (`formatArgentinaDateTime` se aplica en el componente) y el documento con número y `href`; deuda del cliente y del proveedor si está rechazado; `lastOperation` anulable (la última operación vigente del cheque, o la orden de pago que lo endosó con su link).
  - Después de cada mutación: `revalidateTreasury()` y `revalidatePath('/dashboard/purchases', 'layout')`.
- `src/features/Treasury/lib/query-keys.ts`: `checks`, `checkDetail`, `checksHeader`, `checkOperationForm`.
- Tests en `checks.integration.test.ts`:
  1. Depósito de dos cheques con acreditaciones distintas → `CD-000001`, cheques DEPOSITED, salida de la cartera hoy y entradas al banco en cada fecha; `getAccountIndicators` del banco muestra "A acreditar" el de fecha futura.
  2. **Foco 1:** depósito con fecha `treasuryToday()` y cheque con fecha de pago hoy → acreditación hoy, en el saldo (no "A acreditar"); fecha mañana → _"La fecha no puede ser futura"_.
  3. Acreditación anterior a la mínima → mensaje con la fecha.
  4. Descuento de dos cheques con intereses y comisión → `CL-000001`, la cartera baja el nominal, el banco sube el neto; neto ≤ 0 → mensaje, nada escrito.
  5. Rechazo de un depositado → `CR-000001`, salida del banco, deuda del cliente = importe.
  6. **Foco 4:** rechazo con fecha anterior a la acreditación → la salida del banco va a la fecha de acreditación.
  7. Rechazo de un descontado → salida del banco por el nominal.
  8. Rechazo con fecha anterior al depósito → mensaje.
  9. Anular el depósito con un cheque rechazado → mensaje; anular el rechazo y después el depósito → cheques EN CARTERA, todos los movimientos anulados, saldos como al principio.
  10. **Foco 5:** con la deuda en un recibo borrador, anular el rechazo → mensaje de borrador; con la deuda cobrada en un confirmado → mensaje con el número.
  11. Depósito y descuento en paralelo del mismo cheque (`Promise.all`) → uno ok y el otro _"El cheque Nº … está Depositado: no se puede descontar"_ (o al revés); un solo juego de movimientos.
  12. Dos depósitos en paralelo de cheques distintos → `CD-000001` y `CD-000002`.
  13. Carga inicial de dos cheques → EN CARTERA con su movimiento; `cancelOpeningCheck` de uno → ANULADO y su movimiento anulado; de un depositado → mensaje.
  14. Cheques de otra empresa → "El cheque no existe".
  15. Permisos: con `tesoreria:cheques:delete` negado, `cancelCheckOperation` → `NO_PERMISSION`.
  16. Movimiento `CHECK_OPERATION` editado desde Movimientos → mensaje de la operación.

**Verificación:** `npm run test:treasury`; `check-types`.

### Task 6: Compras — endoso y deuda con el proveedor

**Files**
- `src/features/Purchases/actions/payment-orders.server.ts`, `registerPayment`:
  - Antes de numerar certificados: `lockChecks` de los `thirdPartyCheckId` (orden de id); cada uno `assertTransition('ENDORSE')`.
  - En `THIRD_PARTY_CHECK`, el importe es el del cheque y la cuenta su `portfolio_id` (lo que mande el cliente se ignora).
  - El total que se compara con el neto usa esos importes. Si no cierra: el mensaje actual (_"Los medios suman … y no suman el neto a pagar …"_).
  - Los demás medios usan `assertMoneyAccount`.
  - Por cheque: `payment_order_payments` con `method: 'THIRD_PARTY_CHECK'`, `treasury_account_id: portfolio`, `third_party_check_id`, `check_number`/`check_bank`/`check_due_on` copiados del cheque; movimiento `SUPPLIER_PAYMENT` − importe en la cartera, fecha `paidOn`, con `thirdPartyCheckId`; `moveCheck(…, 'ENDORSE', origin: { paymentOrderId }, set: { supplierId })`.
- `cancelPaymentOrder`:
  - Si está PAID, `lockChecks` de sus medios `THIRD_PARTY_CHECK`; si alguno está REJECTED → _"El cheque Nº … endosado en esta orden fue rechazado: anulá primero el rechazo CR-…"_.
  - Si no, `moveCheck(…, 'UNDO_EXIT', origin: { paymentOrderId })` para cada uno, antes de `cancelMovements`.
  - Pasa a `TRANSACTION_OPTIONS` como el resto (hoy no los usa).
- `getPaymentOrderFormData`: suma `checkDebts` (`openCheckDebtsOfSupplier`, con `excludeOrderId`).
- Nueva `getPortfolioChecksForPayment(): Promise<{ id; number; bank; drawerName; amount; paymentDate; portfolioName }[]>` (permiso `compras:pagos:update`): cheques EN CARTERA de la empresa, por fecha de pago.
- `src/features/Purchases/lib/payments.ts`:
  - `BuiltLine.kind` suma `'REJECTED_CHECK'` y `checkId: string | null`.
  - `buildPaymentOrder`: las líneas `REJECTED_CHECK` se validan con `supplierCheckDebts(…, { excludeOrderId })`. El cheque tiene que ser de la empresa, RECHAZADO desde ENDORSED y con `supplier_id` del proveedor (_"El cheque no existe o no es una deuda de este proveedor"_), y la línea no puede superar la deuda.
  - Esas líneas suman a `computePaymentTotals.invoices` pero **no** a `withholdingBases` (ya se retuvo al pagar la factura original).
  - `paymentOrderData` escribe `third_party_check_id`.
  - `assertPaymentOrderStillValid` revalida la deuda.
  - `getPaymentOrderEditValues` devuelve `checkId`.
- `src/features/Purchases/actions/supplier-account.server.ts`: suma los rechazos desde ENDORSED del proveedor al debe (fecha `rejectedOn`, kind `'REJECTED_CHECK'`, label "Cheque rechazado Nº …").
- PDF (`payment-pdf-data.ts` + test, `PaymentPdfDocuments.tsx`):
  - los medios `THIRD_PARTY_CHECK` muestran número, banco, librador y fecha de pago;
  - las líneas `REJECTED_CHECK` muestran su label.
- Tests: `src/features/Purchases/actions/payments.integration.test.ts`. Sumar `third_party_checks`, eventos, items y operaciones al cleanup, y casos:
  1. Pagar una orden con un cheque de la cartera + transferencia por el resto → cheque ENDORSED con el proveedor, salida de la cartera, evento con `payment_order_id`.
  2. Cheque mayor que el neto → mensaje de que no suman; la orden sigue APROBADA.
  3. **Foco 3:** cheque depositado entre la carga del form y el pago → _"…está Depositado: no se puede endosar"_; sin certificados numerados ni movimientos.
  4. Anular la orden pagada → cheque EN CARTERA, movimiento anulado; con el cheque rechazado → mensaje.
  5. Rechazo desde ENDORSED (vía `rejectCheck`) → deuda del cliente **y** del proveedor; la cuenta corriente del proveedor muestra el débito.
  6. Orden nueva con línea `REJECTED_CHECK` → sin retenciones sobre esa línea; al pagarla, deuda del proveedor 0.
  7. **Foco 5 (proveedor):** con la deuda en una orden sin pagar, anular el rechazo → mensaje de orden sin pagar.
- Los tests que mezclan módulos van en `payments.integration.test.ts`, que ya corre en `npm run test:purchases`.

**Verificación:** `npm run test:purchases`; `npm run test:treasury`; `check-types`.

### Task 7: Pantallas

**Files**
- `src/features/Treasury/TreasuryComponent.tsx`: tab `cheques`, ícono `Banknote`, con `ChecksTabContent` y el skeleton `TreasurySectionSkeleton`, entre Cobranzas y Retenciones sufridas.
- `src/features/Treasury/Checks/ChecksTabContent.tsx` (Server Component):
  - encabezado `ChecksHeader` con `getChecksHeader()`: total EN CARTERA por cartera, "N por vencer" y "N vencidos para depositar" (tarjetas como `ReceivablesSummaryCards`);
  - botón **Carga inicial** (`cheques:create`);
  - la tabla de Task 8 en un `<Suspense>`.
- Formularios, todos RHF + `zodResolver`, un solo formulario por operación, con `type="button"` en lo que no guarda:
  - `Checks/components/OpeningChecksDialog.tsx`: cartera (preseleccionada si hay una), fecha, cliente y un `useFieldArray` de cheques (con librador precargado desde el cliente elegido, en el handler del selector).
  - `Checks/components/DepositChecksDialog.tsx`: recibe los ids tildados. Carga `getCheckOperationFormData` con `useQuery` y muestra la lista con su importe y la acreditación editable por cheque (default `minCreditDate`, recalculado en el `onChange` de la fecha del depósito). Pide banco, fecha y boleta; muestra el total.
  - `Checks/components/DiscountChecksDialog.tsx`: banco, fecha, intereses, comisión y referencia. Muestra nominal, neto en vivo (`discountNet`) y el error si el neto es ≤ 0.
  - `Checks/components/RejectCheckDialog.tsx`: fecha, motivo y "Lo devolvió: Banco / Proveedor" (default según `status`: ENDORSED → Proveedor).
- Detalle: `src/app/dashboard/treasury/checks/[id]/page.tsx` → `src/features/Treasury/Checks/CheckPage.tsx` (Server Component con `checkPermissionServer` y `NoPermission`) → `Checks/components/CheckDetailView.tsx`:
  - datos del cheque y badge de estado;
  - aviso de vencimiento si está EN CARTERA;
  - historial (fecha y hora con `formatArgentinaDateTime`, usuario, link al documento);
  - deudas si está rechazado (con "Cobrar" a `/dashboard/treasury/receipts/new?customerId=…&checkId=…`);
  - acciones: **Registrar rechazo** (`cheques:update`, si DEPOSITED/ENDORSED/DISCOUNTED); **Anular operación** (`cheques:delete`, con `CancelReasonDialog` sobre `lastOperation`; si lo sacó una orden de pago, un link "Anulá la OP-… desde Compras" en lugar del botón).
  - Skeleton en `Checks/fallback/CheckDetailSkeleton.tsx`.
- Recibo (`Collections/components/`):
  - `ReceiptPaymentsSection.tsx`: en `CHECK`/`ECHECK` el selector de cuenta lista solo `portfolios` (preseleccionada si hay una). Pide banco, número, emisión, fecha de pago, librador y CUIT. Al cambiar el método a cheque, en el handler, se precargan librador y CUIT del cliente si están vacíos.
  - Sección nueva `ReceiptCheckDebtsSection.tsx`, junto a los comprobantes y con el mismo patrón que `ReceiptInvoicesSection` (check + importe + "Total"): las deudas por cheques rechazados.
  - `ReceiptEditor.tsx`: al tocar **Confirmar**, en el handler, llama a `findDuplicateReceiptChecks` con los cheques del form. Si hay repetidos, el `AlertDialog` de confirmación los lista arriba del resumen en rojo (no bloquea: la base decide); si no, sigue igual. `/receipts/new` acepta `checkId` en `searchParams` y pretilda esa deuda.
  - `ReceiptDetailView.tsx`: cada medio cheque linkea a su cheque con su estado; las líneas `REJECTED_CHECK`, al cheque.
- Compras (`Purchases/Payments/components/`):
  - `RegisterPaymentDialog.tsx`: el método "Cheque de tercero" reemplaza cuenta, importe y datos de cheque por un selector de cheques EN CARTERA (`useQuery` sobre `getPortfolioChecksForPayment`, habilitado al elegir el método), con número, banco, librador, fecha de pago e importe. El importe se muestra fijo y suma al total del diálogo. Los cheques ya elegidos en otra fila no se ofrecen.
  - `PaymentOrderForm.tsx`: sección "Cheques rechazados" (deudas del proveedor), como los comprobantes.
  - `PaymentOrderDetailView.tsx`: los medios `THIRD_PARTY_CHECK` con link al cheque; las líneas `REJECTED_CHECK` con su label.
- Configuración:
  - `Settings/components/TreasuryAccountsSection.tsx`: el alta y la edición ofrecen "Cartera de cheques"; en ese tipo no se piden datos bancarios ni saldo inicial.
  - `actions/accounts.server.ts`: con `CHECK_PORTFOLIO`, rechazar el saldo inicial (_"Una cartera no lleva saldo inicial: cargá sus cheques con la carga inicial"_).
  - `actions/movements.server.ts`: lo mismo en `setOpeningBalance`.
- Selectores de cuenta de Movimientos, Transferencias y el saldo inicial: filtrar `kind !== 'CHECK_PORTFOLIO'` en el origen de datos de cada formulario (no en el componente).
- Extracto y detalle de movimiento (lo que no es DataTable):
  - `lib/balances.ts` `getAccountStatement` y `actions/movements.server.ts` `getMovementDetail` exponen `checkOperation { id, number, kind }` y `thirdPartyCheck { id, number }`;
  - `AccountStatementView.tsx` los linkea al cheque y los pone en el Excel.

**Verificación:**
- `check-types`; `npx vitest run src/features/Treasury/tab-permission-keys.test.ts`.
- Navegador como admin P4, a 375 px y a escritorio:
  - recibo con dos cheques (aviso de repetido con un tercero igual);
  - en la tab Cheques, tildar y depositar uno, descontar otro, carga inicial;
  - pagar una orden de Compras con un cheque de la cartera;
  - rechazar el endosado y verlo en las dos cuentas corrientes;
  - cobrar la deuda desde el detalle del cheque;
  - anular el rechazo bloqueado y luego permitido.

### Task 8: Tablas (agente `table-expert`)

Pasarle al agente:
- la spec §4.2 y §2.7;
- `lib/checks-dates.ts` (el aviso **no** se recalcula con otra fórmula), `lib/rejected-checks.ts` (la deuda **no** se recalcula) y `lib/filter-values.ts`;
- las acciones de Task 5 y los diálogos de Task 7;
- las reglas de `datatable.md` / `datatable-filters.md`.

Tablas:
- **Cheques** (`Checks/ChecksList/`):
  - **Columnas:** número, banco, tipo, librador, CUIT, cliente, importe, emisión, fecha de pago, vence para depositar (con badge del aviso si está EN CARTERA), estado, cartera, destino (cuenta bancaria o proveedor).
  - **Filtros:** uno por columna. Estado y cartera visibles; el estado arranca en EN CARTERA. "Vence para depositar" lleva rango de fechas y se filtra en SQL como `payment_date + 30`.
  - **Selección:** solo filas EN CARTERA. Con selección aparecen **Depositar** y **Descontar** (`cheques:create`), que abren los diálogos de Task 7 con los ids.
  - **Fila:** link al detalle.
  - **Export** a Excel con labels y fechas.
  - **Filtros hostiles:** mismos casos que `receipts.integration.test.ts` (ids no UUID, enums inválidos, fechas basura) → sin error.
- **A cobrar** (`Collections/ReceivablesList/`): sumar las deudas por cheques rechazados como filas (comprobante "Cheque rechazado Nº …", moneda ARS, vencimiento = fecha del rechazo, estado Vencido), con la acción **Cobrar** a `/receipts/new?customerId=…&checkId=…`. Unión con `customerCheckDebtSql`, sin duplicar la fórmula.
- **Vencimientos de Compras** (`Purchases/Payments/DueInvoicesList/`): sumar las deudas con proveedores por cheques rechazados, con el mismo criterio (`supplierCheckDebts`).
- **Movimientos** (tabla de la etapa 1): el origen `CHECK_OPERATION` muestra el número de la operación ("Carga inicial" si no tiene) con link al cheque, y el filtro de texto de origen también busca por ese número.
- **Órdenes de pago:** el facet de método ya suma `THIRD_PARTY_CHECK` (Task 2); verificar el filtro.

**Verificación:** `check-types`; `npm run test:treasury` (filtros hostiles); navegador (filtros, facets, export, selección y acciones).

### Task 9: Demo

- `scripts/demo/domains/third-party-checks.ts`, con `seedThirdPartyChecks(ctx)`, llamado en `reset.ts` después de `seedCustomerReceipts(ctx)` (comentario: "Cheques después de Cobranzas: usa sus clientes, sus cuentas y una OP de Compras").
  - Cuenta `demoId('treasury_account', 'cartera')` "Cartera de cheques" (`CHECK_PORTFOLIO`).
  - Recibos nuevos (`RE-000007` en adelante), con medios cheque a la cartera, sus `third_party_checks`, eventos y movimientos, insertados directo con la misma forma que el código (`createMovement` no se importa: SQL/Prisma equivalente, como `customer-receipts.ts`):
    - dos EN CARTERA: uno con fecha de pago hace 27 días (por vencer) y otro hace 35 (vencido para depositar);
    - uno depositado y acreditado (`CD-000001`, Galicia);
    - uno depositado a acreditar (`CD-000002`, Nación, acreditación en 2 días);
    - uno descontado (`CL-000001`, Galicia, con intereses y comisión);
    - uno endosado en una orden de pago nueva, PAGADA, de un proveedor demo sobre una factura demo con pendiente, sin retenciones (neto = cheque), con su movimiento `SUPPLIER_PAYMENT` en la cartera;
    - uno depositado y rechazado (`CR-000001`, "Sin fondos", banco) con su deuda abierta.
  - Carga inicial de dos cheques EN CARTERA (operación `OPENING`).
  - `scripts/demo/domains/customer-receipts.ts`: el e-cheq del `RE-000003` va a la cartera y crea su cheque EN CARTERA (fecha de pago a 30 días). Ajustar el `expected` de Galicia en su `verify`.
  - **`verify`:**
    - saldo de la cartera = suma de los cheques EN CARTERA;
    - cada cheque tiene sus movimientos según spec §2.6;
    - la deuda del rechazado (SQL equivalente a `customerCheckDebts`) = su importe;
    - los saldos de Galicia y Nación suben/bajan lo esperado.
- El borrado de la demo es genérico; si `reset.ts` lista tablas en orden, sumar las 4 nuevas antes de `treasury_movements`.

**Verificación:** reset de la demo con `verify` OK. En el navegador, la tab Cheques muestra los avisos "Por vencer" y "Vencido para depositar", el rechazado con su deuda en la cuenta corriente, y el extracto de Nación muestra "A acreditar".

### Task 10: Manual

- `src/features/Ayuda/Manual/catalog/sections/tesoreria.ts`:
  - guías `cartera-de-cheques` (screens: tab `cheques` + `/dashboard/treasury/checks/*`), `depositar-y-descontar-cheques` y `rechazo-de-un-cheque`, todas con `access` a `tab('tesoreria', 'cheques')`;
  - sumar `cheques` al `access` de la guía `tesoreria`, y `related` cruzados con `cobrar-facturas`, `cuenta-corriente-de-clientes` y `ordenes-de-pago`.
- `src/features/Ayuda/Manual/catalog/sections/compras.ts`: guía `endosar-cheques` (screen de órdenes de pago, `access` a `compras:pagos`), con `related` a `cartera-de-cheques`.
- MDX nuevos en `src/content/manual/tesoreria/` (`cartera-de-cheques.mdx`, `depositar-y-descontar-cheques.mdx`, `rechazo-de-un-cheque.mdx`) y `src/content/manual/compras/endosar-cheques.mdx`, en el tono de los de la etapa 2: qué es, paso a paso, qué pasa si….
- Actualizar:
  - `tesoreria.mdx` (la cartera y la tab Cheques);
  - `cobrar-facturas.mdx` (el medio cheque va a una cartera, librador y aviso de repetido; cobrar una deuda de cheque rechazado);
  - `anular-un-recibo.mdx` (bloqueo si un cheque ya salió de la cartera);
  - `configuracion-de-tesoreria.mdx` (cuenta tipo cartera, sin saldo inicial);
  - `cuentas-y-saldos.mdx` ("A acreditar" ahora son los depósitos de cheques);
  - `cuenta-corriente-de-clientes.mdx` y `compras/cuenta-corriente-y-vencimientos.mdx` (cheque rechazado);
  - `compras/ordenes-de-pago.mdx` (medio "Cheque de tercero").

**Verificación:** `npm run manual:check`.

### Task 11: Verificación final y commit de la etapa

- Correr todo:
  - `check-types`;
  - `npm test`, sin `DATABASE_URL` exportado;
  - `npm run test:db`, `npm run test:treasury`, `npm run test:purchases`, `npm run manual:check`;
  - `npx next build`, con el dev server parado y `tsconfig.tsbuildinfo` borrado;
  - navegador, el recorrido de Task 7 sobre la demo recién reseteada.
- Revisión final con un revisor nuevo (modelo más capaz) sobre `cb8037bf..HEAD`. Cada Critical o Important se corrige con un test RED→GREEN.
- Commit `feat(tesoreria): etapa 3a - cheques de terceros`, con el spec y el plan incluidos (sin `.codex/` ni `AGENTS.md`). Sin push.
