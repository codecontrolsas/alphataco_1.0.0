-- Tesoreria, etapa 3b: cheques propios (spec docs/superpowers/specs/2026-10-11-tesoreria-etapa-3b-design.md).
-- Chequeras, cheques propios con su estado e historial, el movimiento OWN_CHECK (debito
-- confirmado) y la deuda de un cheque propio rechazado en las ordenes de pago.

-- CreateEnum
CREATE TYPE "own_check_kind" AS ENUM ('PHYSICAL', 'ECHECK');

-- CreateEnum
CREATE TYPE "own_check_status" AS ENUM ('ISSUED', 'DEBITED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "payment_order_lines" ADD COLUMN     "own_check_id" UUID;

-- AlterTable
ALTER TABLE "treasury_movements" ADD COLUMN     "own_check_id" UUID;

-- CreateTable
CREATE TABLE "checkbooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "first_number" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL,
    "retired_at" TIMESTAMPTZ(6),
    "retired_by" UUID,
    "retire_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "own_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "kind" "own_check_kind" NOT NULL,
    "account_id" UUID NOT NULL,
    "checkbook_id" UUID,
    "number" TEXT NOT NULL,
    "amount" DECIMAL(15,2),
    "issue_date" DATE NOT NULL,
    "payment_date" DATE,
    "supplier_id" UUID,
    "payment_order_payment_id" UUID,
    "status" "own_check_status" NOT NULL DEFAULT 'ISSUED',
    "debited_on" DATE,
    "rejected_on" DATE,
    "reject_reason" TEXT,
    "void_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "own_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "own_check_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "check_id" UUID NOT NULL,
    "from_status" "own_check_status",
    "to_status" "own_check_status" NOT NULL,
    "date" DATE NOT NULL,
    "payment_order_id" UUID,
    "reason" TEXT,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "own_check_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_checkbooks_company_id" ON "checkbooks"("company_id");

-- CreateIndex
CREATE INDEX "idx_checkbooks_account_id" ON "checkbooks"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "own_checks_payment_order_payment_id_key" ON "own_checks"("payment_order_payment_id");

-- CreateIndex
CREATE INDEX "idx_own_checks_company_status" ON "own_checks"("company_id", "status");

-- CreateIndex
CREATE INDEX "idx_own_checks_checkbook_id" ON "own_checks"("checkbook_id");

-- CreateIndex
CREATE INDEX "idx_own_checks_supplier_id" ON "own_checks"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "own_checks_number_key" ON "own_checks"("account_id", "kind", "number");

-- CreateIndex
CREATE INDEX "idx_own_check_events_check_created" ON "own_check_events"("check_id", "created_at");

-- CreateIndex

-- CreateIndex
CREATE INDEX "idx_payment_order_lines_own_check_id" ON "payment_order_lines"("own_check_id");

-- CreateIndex
CREATE INDEX "idx_treasury_movements_own_check_id" ON "treasury_movements"("own_check_id");

-- AddForeignKey
ALTER TABLE "payment_order_lines" ADD CONSTRAINT "payment_order_lines_own_check_id_fkey" FOREIGN KEY ("own_check_id") REFERENCES "own_checks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_own_check_id_fkey" FOREIGN KEY ("own_check_id") REFERENCES "own_checks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "checkbooks" ADD CONSTRAINT "checkbooks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkbooks" ADD CONSTRAINT "checkbooks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "checkbooks" ADD CONSTRAINT "checkbooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "checkbooks" ADD CONSTRAINT "checkbooks_retired_by_fkey" FOREIGN KEY ("retired_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "own_checks" ADD CONSTRAINT "own_checks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "own_checks" ADD CONSTRAINT "own_checks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "own_checks" ADD CONSTRAINT "own_checks_checkbook_id_fkey" FOREIGN KEY ("checkbook_id") REFERENCES "checkbooks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "own_checks" ADD CONSTRAINT "own_checks_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "own_checks" ADD CONSTRAINT "own_checks_payment_order_payment_id_fkey" FOREIGN KEY ("payment_order_payment_id") REFERENCES "payment_order_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "own_checks" ADD CONSTRAINT "own_checks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "own_check_events" ADD CONSTRAINT "own_check_events_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "own_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "own_check_events" ADD CONSTRAINT "own_check_events_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "own_check_events" ADD CONSTRAINT "own_check_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- ── Reglas que Prisma no modela ─────────────────────────────────────────────

-- Chequera: rango valido (hasta 500 numeros) y baja con sus tres datos juntos.
ALTER TABLE checkbooks ADD CONSTRAINT checkbooks_range_check CHECK (
  first_number >= 1 AND last_number >= first_number AND last_number - first_number < 500
  AND (retired_at IS NULL) = (retired_by IS NULL) AND (retired_at IS NULL) = (retire_reason IS NULL)
);

-- Datos del cheque: un numero inutilizado (sin medio de pago) esta anulado, es de una chequera y
-- no tiene importe; uno emitido tiene importe, fecha de pago y proveedor. Un e-cheq no tiene chequera.
ALTER TABLE own_checks ADD CONSTRAINT own_checks_data_check CHECK (
  length(trim(number)) > 0
  AND (kind = 'PHYSICAL' OR checkbook_id IS NULL)
  AND (
    (payment_order_payment_id IS NULL AND status = 'CANCELLED' AND checkbook_id IS NOT NULL AND void_reason IS NOT NULL
      AND amount IS NULL AND payment_date IS NULL AND supplier_id IS NULL)
    OR (payment_order_payment_id IS NOT NULL AND void_reason IS NULL AND amount > 0 AND supplier_id IS NOT NULL
      AND payment_date IS NOT NULL AND payment_date >= issue_date)
  )
);

-- Columnas obligatorias de cada estado (spec 2.2).
ALTER TABLE own_checks ADD CONSTRAINT own_checks_state_check CHECK (
  (status IN ('ISSUED', 'CANCELLED') AND debited_on IS NULL AND rejected_on IS NULL AND reject_reason IS NULL)
  OR (status = 'DEBITED' AND debited_on IS NOT NULL AND rejected_on IS NULL AND reject_reason IS NULL)
  OR (status = 'REJECTED' AND rejected_on IS NOT NULL AND reject_reason IS NOT NULL AND debited_on IS NULL)
);

-- La deuda de un cheque rechazado lleva exactamente uno de los dos cheques.
ALTER TABLE payment_order_lines DROP CONSTRAINT payment_order_lines_kind_check;
ALTER TABLE payment_order_lines ADD CONSTRAINT payment_order_lines_kind_check CHECK (
  (kind IN ('INVOICE', 'CREDIT_NOTE') AND invoice_id IS NOT NULL AND source_line_id IS NULL AND purchase_order_id IS NULL AND third_party_check_id IS NULL AND own_check_id IS NULL)
  OR (kind = 'ADVANCE' AND invoice_id IS NULL AND source_line_id IS NULL AND third_party_check_id IS NULL AND own_check_id IS NULL)
  OR (kind = 'ADVANCE_APPLIED' AND source_line_id IS NOT NULL AND invoice_id IS NULL AND purchase_order_id IS NULL AND third_party_check_id IS NULL AND own_check_id IS NULL)
  OR (kind = 'REJECTED_CHECK' AND num_nonnulls(third_party_check_id, own_check_id) = 1 AND invoice_id IS NULL AND source_line_id IS NULL AND purchase_order_id IS NULL)
);

-- ── Datos: los pagos con cheque ya registrados pasan a ser cheques propios ──

-- Si dos medios viejos repiten numero en la misma cuenta, el segundo lleva " (2)" (la data de
-- produccion es de prueba): el indice unico no admite repetidos ni entre anulados. El numero de un
-- cheque fisico va sin ceros a la izquierda (como lo guarda la etapa 3b); el de un e-cheq, sin espacios.
-- Un cheque cuyo movimiento todavia no llego (fecha futura) no se debito: queda EMITIDO y su
-- movimiento se anula mas abajo (el total "A debitar" no cambia: lo suma el cheque emitido).
INSERT INTO own_checks (company_id, kind, account_id, number, amount, issue_date, payment_date, supplier_id,
                        payment_order_payment_id, status, debited_on, created_by, created_at)
SELECT po.company_id,
       (CASE p.method WHEN 'CHECK' THEN 'PHYSICAL' ELSE 'ECHECK' END)::own_check_kind,
       p.treasury_account_id,
       CASE WHEN s.rn > 1 THEN s.number || ' (' || s.rn || ')' ELSE s.number END,
       p.amount,
       LEAST(COALESCE(po.paid_on, p.check_due_on), p.check_due_on),
       p.check_due_on,
       po.supplier_id,
       p.id,
       (CASE WHEN m.id IS NULL OR m.cancelled_at IS NOT NULL THEN 'CANCELLED'
             WHEN m.date > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN 'ISSUED'
             ELSE 'DEBITED' END)::own_check_status,
       CASE WHEN m.id IS NOT NULL AND m.cancelled_at IS NULL AND m.date <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN m.date END,
       COALESCE(m.created_by, po.paid_by, po.created_by),
       COALESCE(m.created_at, po.created_at)
FROM payment_order_payments p
JOIN payment_orders po ON po.id = p.payment_order_id
LEFT JOIN treasury_movements m ON m.payment_order_payment_id = p.id
JOIN (
  SELECT id, number, ROW_NUMBER() OVER (PARTITION BY treasury_account_id, method, number ORDER BY id) AS rn
  FROM (
    SELECT id, treasury_account_id, method,
           CASE WHEN method = 'CHECK' AND check_number ~ '^\s*0*[0-9]+\s*$' AND trim(check_number) ~ '[1-9]'
                THEN ltrim(trim(check_number), '0')
                ELSE regexp_replace(check_number, '\s+', '', 'g') END AS number
    FROM payment_order_payments WHERE method IN ('CHECK', 'ECHECK')
  ) n
) s ON s.id = p.id
WHERE p.method IN ('CHECK', 'ECHECK');

-- Historial: la emision y, despues, el debito o la anulacion.
INSERT INTO own_check_events (check_id, from_status, to_status, date, payment_order_id, user_id, created_at)
SELECT oc.id, NULL, 'ISSUED', oc.issue_date, p.payment_order_id, oc.created_by, oc.created_at
FROM own_checks oc JOIN payment_order_payments p ON p.id = oc.payment_order_payment_id;

INSERT INTO own_check_events (check_id, from_status, to_status, date, payment_order_id, reason, user_id, created_at)
SELECT oc.id, 'ISSUED', oc.status, COALESCE(oc.debited_on, (po.cancelled_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, oc.issue_date),
       CASE WHEN oc.status = 'CANCELLED' THEN p.payment_order_id END,
       CASE WHEN oc.status = 'CANCELLED' THEN po.cancel_reason END,
       COALESCE(po.cancelled_by, oc.created_by), oc.created_at
FROM own_checks oc
JOIN payment_order_payments p ON p.id = oc.payment_order_payment_id
JOIN payment_orders po ON po.id = p.payment_order_id
WHERE oc.status IN ('DEBITED', 'CANCELLED');

-- Origen de cada movimiento: OWN_CHECK es el debito confirmado de un cheque propio.
ALTER TABLE treasury_movements DROP CONSTRAINT treasury_movements_origin_check;

UPDATE treasury_movements m
SET kind = 'OWN_CHECK', own_check_id = oc.id, payment_order_payment_id = NULL,
    cancelled_at = CASE WHEN oc.status = 'ISSUED' THEN now() ELSE m.cancelled_at END,
    cancelled_by = CASE WHEN oc.status = 'ISSUED' THEN m.created_by ELSE m.cancelled_by END,
    cancel_reason = CASE WHEN oc.status = 'ISSUED' THEN 'Migración etapa 3b: el cheque queda emitido hasta confirmar su débito' ELSE m.cancel_reason END
FROM own_checks oc
WHERE oc.payment_order_payment_id = m.payment_order_payment_id;

ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_origin_check CHECK (
  (kind = 'OPENING' AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL AND own_check_id IS NULL)
  OR (kind = 'MANUAL' AND concept_id IS NOT NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL AND own_check_id IS NULL)
  OR (kind = 'TRANSFER' AND transfer_id IS NOT NULL AND concept_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL AND own_check_id IS NULL)
  OR (kind = 'SUPPLIER_PAYMENT' AND payment_order_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL AND own_check_id IS NULL AND amount < 0)
  OR (kind = 'CUSTOMER_RECEIPT' AND customer_receipt_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND check_operation_id IS NULL AND own_check_id IS NULL AND amount > 0)
  OR (kind = 'CHECK_OPERATION' AND check_operation_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND own_check_id IS NULL)
  OR (kind = 'OWN_CHECK' AND own_check_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL AND amount < 0)
);
