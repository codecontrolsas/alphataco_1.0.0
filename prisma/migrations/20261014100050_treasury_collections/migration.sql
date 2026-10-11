-- Tesoreria etapa 2: recibos de cobranza, sus lineas, retenciones sufridas y medios (spec
-- docs/superpowers/specs/2026-10-10-tesoreria-etapa-2-design.md §2).

-- CreateEnum
CREATE TYPE "customer_receipt_status" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "customer_receipt_line_kind" AS ENUM ('INVOICE', 'ADVANCE', 'ADVANCE_APPLIED');

-- AlterTable
ALTER TABLE "treasury_movements" ADD COLUMN     "customer_receipt_payment_id" UUID;

-- CreateTable
CREATE TABLE "customer_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "number" TEXT,
    "status" "customer_receipt_status" NOT NULL DEFAULT 'DRAFT',
    "date" DATE NOT NULL,
    "notes" TEXT,
    "invoices_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "advance_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "advances_applied_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "withholdings_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "received_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "fx_difference_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "sent_to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,

    CONSTRAINT "customer_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_receipt_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "customer_receipt_line_kind" NOT NULL,
    "invoice_id" UUID,
    "source_line_id" UUID,
    "currency" CHAR(3) NOT NULL,
    "applied_amount" DECIMAL(15,2) NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "invoice_exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amount_ars" DECIMAL(15,2) NOT NULL,
    "fx_difference" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "customer_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_receipt_withholdings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "tax" "withholding_tax" NOT NULL,
    "jurisdiction" TEXT,
    "certificate_number" TEXT NOT NULL,
    "certificate_date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "file_path" TEXT,
    "file_name" TEXT,

    CONSTRAINT "customer_receipt_withholdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_receipt_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_id" UUID NOT NULL,
    "method" "payment_method" NOT NULL,
    "treasury_account_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reference" TEXT,
    "check_number" TEXT,
    "check_bank" TEXT,
    "check_due_on" DATE,

    CONSTRAINT "customer_receipt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_customer_receipts_company_date" ON "customer_receipts"("company_id", "date");

-- CreateIndex
CREATE INDEX "idx_customer_receipts_customer_id" ON "customer_receipts"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_receipts_company_id_number_key" ON "customer_receipts"("company_id", "number");

-- CreateIndex
CREATE INDEX "idx_customer_receipt_lines_receipt_id" ON "customer_receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "idx_customer_receipt_lines_invoice_id" ON "customer_receipt_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "idx_customer_receipt_lines_source_line_id" ON "customer_receipt_lines"("source_line_id");

-- CreateIndex
CREATE INDEX "idx_customer_receipt_withholdings_receipt_id" ON "customer_receipt_withholdings"("receipt_id");

-- CreateIndex
CREATE INDEX "idx_customer_receipt_withholdings_certificate" ON "customer_receipt_withholdings"("company_id", "customer_id", "tax", "certificate_number");

-- CreateIndex
CREATE INDEX "idx_customer_receipt_payments_receipt_id" ON "customer_receipt_payments"("receipt_id");

-- CreateIndex
CREATE INDEX "idx_customer_receipt_payments_account_id" ON "customer_receipt_payments"("treasury_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_movements_customer_receipt_payment_id_key" ON "treasury_movements"("customer_receipt_payment_id");

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_customer_receipt_payment_id_fkey" FOREIGN KEY ("customer_receipt_payment_id") REFERENCES "customer_receipt_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_receipt_lines" ADD CONSTRAINT "customer_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "customer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipt_lines" ADD CONSTRAINT "customer_receipt_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_receipt_lines" ADD CONSTRAINT "customer_receipt_lines_source_line_id_fkey" FOREIGN KEY ("source_line_id") REFERENCES "customer_receipt_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_receipt_withholdings" ADD CONSTRAINT "customer_receipt_withholdings_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "customer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipt_payments" ADD CONSTRAINT "customer_receipt_payments_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "customer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipt_payments" ADD CONSTRAINT "customer_receipt_payments_treasury_account_id_fkey" FOREIGN KEY ("treasury_account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Reglas que Prisma no modela (red de seguridad: los mensajes salen del servidor).

-- Cada tipo de movimiento tiene exactamente su origen; el cobro siempre entra.
ALTER TABLE treasury_movements DROP CONSTRAINT treasury_movements_origin_check;
ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_origin_check CHECK (
  (kind = 'OPENING' AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL)
  OR (kind = 'MANUAL' AND concept_id IS NOT NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL)
  OR (kind = 'TRANSFER' AND transfer_id IS NOT NULL AND concept_id IS NULL AND payment_order_payment_id IS NULL AND customer_receipt_payment_id IS NULL)
  OR (kind = 'SUPPLIER_PAYMENT' AND payment_order_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND customer_receipt_payment_id IS NULL AND amount < 0)
  OR (kind = 'CUSTOMER_RECEIPT' AND customer_receipt_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND amount > 0)
);

-- Borrador sin numero; confirmado con numero y quien lo confirmo; anulado completo.
ALTER TABLE customer_receipts ADD CONSTRAINT customer_receipts_state_check CHECK (
  (status = 'DRAFT' AND number IS NULL AND confirmed_at IS NULL AND cancelled_at IS NULL)
  OR (status = 'CONFIRMED' AND number IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND cancelled_at IS NULL)
  OR (status = 'CANCELLED' AND number IS NOT NULL AND confirmed_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)
);

-- Cada tipo de linea con su referencia; los anticipos son en pesos.
ALTER TABLE customer_receipt_lines ADD CONSTRAINT customer_receipt_lines_kind_check CHECK (
  (kind = 'INVOICE' AND invoice_id IS NOT NULL AND source_line_id IS NULL)
  OR (kind = 'ADVANCE' AND invoice_id IS NULL AND source_line_id IS NULL AND currency = 'ARS' AND exchange_rate = 1)
  OR (kind = 'ADVANCE_APPLIED' AND source_line_id IS NOT NULL AND invoice_id IS NULL AND currency = 'ARS' AND exchange_rate = 1)
);
ALTER TABLE customer_receipt_lines ADD CONSTRAINT customer_receipt_lines_amount_check CHECK (
  applied_amount > 0 AND amount_ars > 0 AND exchange_rate > 0 AND invoice_exchange_rate > 0
);
CREATE UNIQUE INDEX customer_receipt_lines_one_invoice ON customer_receipt_lines (receipt_id, invoice_id) WHERE invoice_id IS NOT NULL;
CREATE UNIQUE INDEX customer_receipt_lines_one_source ON customer_receipt_lines (receipt_id, source_line_id) WHERE source_line_id IS NOT NULL;

-- Jurisdiccion solo (y siempre) en IIBB; archivo con su nombre.
ALTER TABLE customer_receipt_withholdings ADD CONSTRAINT customer_receipt_withholdings_check CHECK (
  amount > 0 AND (tax = 'IIBB') = (jurisdiction IS NOT NULL) AND (file_path IS NULL) = (file_name IS NULL)
);

-- Cheques y e-cheqs con numero y vencimiento.
ALTER TABLE customer_receipt_payments ADD CONSTRAINT customer_receipt_payments_check CHECK (
  amount > 0 AND (method NOT IN ('CHECK', 'ECHECK') OR (check_number IS NOT NULL AND check_due_on IS NOT NULL))
);
