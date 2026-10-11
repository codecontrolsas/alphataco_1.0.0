-- Tesoreria, etapa 3a: cheques de terceros (spec docs/superpowers/specs/2026-10-11-tesoreria-etapa-3a-design.md).
-- Cartera de cheques como cuenta, cheques con su estado, operaciones (carga inicial, deposito,
-- descuento, rechazo), historial, y las columnas que los unen con recibos, ordenes de pago y el libro.



-- CreateEnum
CREATE TYPE "third_party_check_kind" AS ENUM ('PHYSICAL', 'ECHECK');


-- CreateEnum
CREATE TYPE "third_party_check_status" AS ENUM ('IN_PORTFOLIO', 'DEPOSITED', 'ENDORSED', 'DISCOUNTED', 'REJECTED', 'CANCELLED');


-- CreateEnum
CREATE TYPE "check_operation_kind" AS ENUM ('OPENING', 'DEPOSIT', 'DISCOUNT', 'REJECTION');


-- CreateEnum
CREATE TYPE "check_returned_by" AS ENUM ('BANK', 'SUPPLIER');


-- AlterTable
ALTER TABLE "customer_receipt_lines" ADD COLUMN     "third_party_check_id" UUID;


-- AlterTable
ALTER TABLE "customer_receipt_payments" ADD COLUMN     "check_issue_date" DATE,
ADD COLUMN     "drawer_cuit" VARCHAR(11),
ADD COLUMN     "drawer_name" TEXT;


-- AlterTable
ALTER TABLE "payment_order_lines" ADD COLUMN     "third_party_check_id" UUID;


-- AlterTable
ALTER TABLE "payment_order_payments" ADD COLUMN     "third_party_check_id" UUID;


-- AlterTable
ALTER TABLE "treasury_movements" ADD COLUMN     "check_operation_id" UUID,
ADD COLUMN     "third_party_check_id" UUID;


-- CreateTable
CREATE TABLE "third_party_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "kind" "third_party_check_kind" NOT NULL,
    "number" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "drawer_name" TEXT NOT NULL,
    "drawer_cuit" VARCHAR(11) NOT NULL,
    "issue_date" DATE NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "third_party_check_status" NOT NULL DEFAULT 'IN_PORTFOLIO',
    "portfolio_id" UUID NOT NULL,
    "receipt_payment_id" UUID,
    "opening_operation_id" UUID,
    "credited_on" DATE,
    "bank_account_id" UUID,
    "supplier_id" UUID,
    "rejected_from" "third_party_check_status",
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "third_party_checks_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "third_party_check_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "kind" "check_operation_kind" NOT NULL,
    "number" TEXT,
    "date" DATE NOT NULL,
    "bank_account_id" UUID,
    "slip_number" TEXT,
    "interest" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "fee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "reason" TEXT,
    "returned_by" "check_returned_by",
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,

    CONSTRAINT "third_party_check_operations_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "third_party_check_operation_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operation_id" UUID NOT NULL,
    "check_id" UUID NOT NULL,
    "previous_status" "third_party_check_status" NOT NULL,
    "credited_on" DATE,

    CONSTRAINT "third_party_check_operation_items_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "third_party_check_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "check_id" UUID NOT NULL,
    "from_status" "third_party_check_status",
    "to_status" "third_party_check_status" NOT NULL,
    "date" DATE NOT NULL,
    "operation_id" UUID,
    "receipt_id" UUID,
    "payment_order_id" UUID,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "third_party_check_events_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE UNIQUE INDEX "third_party_checks_receipt_payment_id_key" ON "third_party_checks"("receipt_payment_id");


-- CreateIndex
CREATE INDEX "idx_third_party_checks_company_status" ON "third_party_checks"("company_id", "status");


-- CreateIndex
CREATE INDEX "idx_third_party_checks_customer_id" ON "third_party_checks"("customer_id");


-- CreateIndex
CREATE INDEX "idx_third_party_checks_supplier_id" ON "third_party_checks"("supplier_id");


-- CreateIndex
CREATE INDEX "idx_third_party_checks_portfolio_id" ON "third_party_checks"("portfolio_id");


-- CreateIndex
CREATE INDEX "idx_third_party_check_operations_company_date" ON "third_party_check_operations"("company_id", "date");


-- CreateIndex
CREATE UNIQUE INDEX "third_party_check_operations_number_key" ON "third_party_check_operations"("company_id", "kind", "number");


-- CreateIndex
CREATE INDEX "idx_third_party_check_operation_items_check_id" ON "third_party_check_operation_items"("check_id");


-- CreateIndex
CREATE UNIQUE INDEX "third_party_check_operation_items_key" ON "third_party_check_operation_items"("operation_id", "check_id");


-- CreateIndex
CREATE INDEX "idx_third_party_check_events_check_created" ON "third_party_check_events"("check_id", "created_at");


-- CreateIndex
CREATE INDEX "idx_customer_receipt_lines_check_id" ON "customer_receipt_lines"("third_party_check_id");


-- CreateIndex
CREATE INDEX "idx_payment_order_lines_check_id" ON "payment_order_lines"("third_party_check_id");


-- CreateIndex
CREATE INDEX "idx_payment_order_payments_check_id" ON "payment_order_payments"("third_party_check_id");


-- CreateIndex
CREATE INDEX "idx_treasury_movements_check_operation_id" ON "treasury_movements"("check_operation_id");


-- CreateIndex
CREATE INDEX "idx_treasury_movements_check_id" ON "treasury_movements"("third_party_check_id");


-- AddForeignKey
ALTER TABLE "payment_order_lines" ADD CONSTRAINT "payment_order_lines_third_party_check_id_fkey" FOREIGN KEY ("third_party_check_id") REFERENCES "third_party_checks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "payment_order_payments" ADD CONSTRAINT "payment_order_payments_third_party_check_id_fkey" FOREIGN KEY ("third_party_check_id") REFERENCES "third_party_checks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_check_operation_id_fkey" FOREIGN KEY ("check_operation_id") REFERENCES "third_party_check_operations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_third_party_check_id_fkey" FOREIGN KEY ("third_party_check_id") REFERENCES "third_party_checks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "customer_receipt_lines" ADD CONSTRAINT "customer_receipt_lines_third_party_check_id_fkey" FOREIGN KEY ("third_party_check_id") REFERENCES "third_party_checks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_checks" ADD CONSTRAINT "third_party_checks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "third_party_checks" ADD CONSTRAINT "third_party_checks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_checks" ADD CONSTRAINT "third_party_checks_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_checks" ADD CONSTRAINT "third_party_checks_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_checks" ADD CONSTRAINT "third_party_checks_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_checks" ADD CONSTRAINT "third_party_checks_receipt_payment_id_fkey" FOREIGN KEY ("receipt_payment_id") REFERENCES "customer_receipt_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_checks" ADD CONSTRAINT "third_party_checks_opening_operation_id_fkey" FOREIGN KEY ("opening_operation_id") REFERENCES "third_party_check_operations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_checks" ADD CONSTRAINT "third_party_checks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_check_operations" ADD CONSTRAINT "third_party_check_operations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "third_party_check_operations" ADD CONSTRAINT "third_party_check_operations_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_check_operations" ADD CONSTRAINT "third_party_check_operations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_check_operations" ADD CONSTRAINT "third_party_check_operations_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_check_operation_items" ADD CONSTRAINT "third_party_check_operation_items_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "third_party_check_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "third_party_check_operation_items" ADD CONSTRAINT "third_party_check_operation_items_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "third_party_checks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_check_events" ADD CONSTRAINT "third_party_check_events_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "third_party_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "third_party_check_events" ADD CONSTRAINT "third_party_check_events_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "third_party_check_operations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_check_events" ADD CONSTRAINT "third_party_check_events_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "customer_receipts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_check_events" ADD CONSTRAINT "third_party_check_events_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "third_party_check_events" ADD CONSTRAINT "third_party_check_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Reglas que Prisma no modela ─────────────────────────────────────────────

-- Origen de cada movimiento: cada tipo exactamente con su origen.
ALTER TABLE treasury_movements DROP CONSTRAINT treasury_movements_origin_check;
ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_origin_check CHECK (
  (kind = 'OPENING' AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL)
  OR (kind = 'MANUAL' AND concept_id IS NOT NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL)
  OR (kind = 'TRANSFER' AND transfer_id IS NOT NULL AND concept_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL)
  OR (kind = 'SUPPLIER_PAYMENT' AND payment_order_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND customer_receipt_payment_id IS NULL AND check_operation_id IS NULL AND amount < 0)
  OR (kind = 'CUSTOMER_RECEIPT' AND customer_receipt_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND check_operation_id IS NULL AND amount > 0)
  OR (kind = 'CHECK_OPERATION' AND check_operation_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL)
);

-- Datos del cheque y su origen: un recibo o una carga inicial, nunca los dos.
ALTER TABLE third_party_checks ADD CONSTRAINT third_party_checks_data_check CHECK (
  amount > 0 AND payment_date >= issue_date AND drawer_cuit ~ '^[0-9]{11}$'
  AND length(trim(number)) > 0 AND length(trim(bank)) > 0
  AND ((receipt_payment_id IS NULL) <> (opening_operation_id IS NULL))
);

-- Columnas obligatorias de cada estado (spec 2.2).
ALTER TABLE third_party_checks ADD CONSTRAINT third_party_checks_state_check CHECK (
  (status IN ('IN_PORTFOLIO', 'CANCELLED') AND credited_on IS NULL AND bank_account_id IS NULL AND supplier_id IS NULL AND rejected_from IS NULL)
  OR (status = 'DEPOSITED' AND credited_on IS NOT NULL AND bank_account_id IS NOT NULL AND supplier_id IS NULL AND rejected_from IS NULL)
  OR (status = 'ENDORSED' AND supplier_id IS NOT NULL AND credited_on IS NULL AND bank_account_id IS NULL AND rejected_from IS NULL)
  OR (status = 'DISCOUNTED' AND bank_account_id IS NOT NULL AND credited_on IS NULL AND supplier_id IS NULL AND rejected_from IS NULL)
  OR (status = 'REJECTED' AND rejected_from IS NOT NULL AND rejected_from IN ('DEPOSITED', 'ENDORSED', 'DISCOUNTED')
      AND (rejected_from <> 'ENDORSED' OR supplier_id IS NOT NULL)
      AND (rejected_from = 'ENDORSED' OR bank_account_id IS NOT NULL))
);

-- No hay dos cheques vigentes con el mismo banco, numero y CUIT del librador.
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

-- Cada evento tiene exactamente un documento de origen.
ALTER TABLE third_party_check_events ADD CONSTRAINT third_party_check_events_origin_check CHECK (
  num_nonnulls(operation_id, receipt_id, payment_order_id) = 1
);

-- El cheque de tercero es un medio de pago a proveedores, no de cobro.
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
