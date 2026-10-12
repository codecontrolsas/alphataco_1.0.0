-- Tesoreria (etapa 1): libro de movimientos, conceptos y transferencias. El saldo de cada
-- cuenta es la suma de sus movimientos vigentes (no se guarda). Ver
-- docs/superpowers/specs/2026-10-10-tesoreria-etapa-1-design.md.

-- CreateEnum
CREATE TYPE "treasury_movement_kind" AS ENUM ('OPENING', 'MANUAL', 'TRANSFER', 'SUPPLIER_PAYMENT');

-- CreateEnum
CREATE TYPE "treasury_concept_direction" AS ENUM ('IN', 'OUT', 'BOTH');

-- AlterTable
ALTER TABLE "treasury_accounts" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'ARS',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "treasury_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "kind" "treasury_movement_kind" NOT NULL,
    "concept_id" UUID,
    "description" TEXT,
    "payment_order_payment_id" UUID,
    "transfer_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,

CONSTRAINT "treasury_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_concepts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "treasury_concept_direction" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "treasury_concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,

CONSTRAINT "treasury_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "treasury_movements_payment_order_payment_id_key" ON "treasury_movements"("payment_order_payment_id");

-- CreateIndex
CREATE INDEX "idx_treasury_movements_account_date" ON "treasury_movements"("account_id", "date");

-- CreateIndex
CREATE INDEX "idx_treasury_movements_company_date" ON "treasury_movements"("company_id", "date");

-- CreateIndex
CREATE INDEX "idx_treasury_movements_transfer_id" ON "treasury_movements"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_concepts_company_id_name_key" ON "treasury_concepts"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_transfers_company_id_number_key" ON "treasury_transfers"("company_id", "number");

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "treasury_concepts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_payment_order_payment_id_fkey" FOREIGN KEY ("payment_order_payment_id") REFERENCES "payment_order_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "treasury_transfers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_concepts" ADD CONSTRAINT "treasury_concepts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- Reglas que Prisma no modela (red de seguridad: los mensajes salen del servidor).
ALTER TABLE treasury_accounts ADD CONSTRAINT treasury_accounts_currency_check CHECK (currency = 'ARS');

ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_amount_check CHECK (amount <> 0);

-- Cada tipo de movimiento tiene exactamente su origen.
ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_origin_check CHECK (
  (kind = 'OPENING' AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL)
  OR (kind = 'MANUAL' AND concept_id IS NOT NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL)
  OR (kind = 'TRANSFER' AND transfer_id IS NOT NULL AND concept_id IS NULL AND payment_order_payment_id IS NULL)
  OR (kind = 'SUPPLIER_PAYMENT' AND payment_order_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND amount < 0)
);

-- Anulacion completa o nada.
ALTER TABLE treasury_movements ADD CONSTRAINT treasury_movements_cancel_check CHECK (
  (cancelled_by IS NULL) = (cancelled_at IS NULL) AND (cancelled_at IS NULL) = (cancel_reason IS NULL)
);

-- Un solo saldo inicial vigente por cuenta.
CREATE UNIQUE INDEX treasury_movements_one_opening ON treasury_movements (account_id)
  WHERE kind = 'OPENING' AND cancelled_at IS NULL;

ALTER TABLE treasury_transfers ADD CONSTRAINT treasury_transfers_accounts_check CHECK (from_account_id <> to_account_id);
ALTER TABLE treasury_transfers ADD CONSTRAINT treasury_transfers_amount_check CHECK (amount > 0);
ALTER TABLE treasury_transfers ADD CONSTRAINT treasury_transfers_cancel_check CHECK (
  (cancelled_by IS NULL) = (cancelled_at IS NULL) AND (cancelled_at IS NULL) = (cancel_reason IS NULL)
);
