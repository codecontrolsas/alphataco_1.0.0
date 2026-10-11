-- Tesoreria, etapa 4: conciliacion bancaria (spec docs/superpowers/specs/2026-10-12-tesoreria-etapa-4-design.md).
-- Perfil de columnas del extracto por cuenta, importaciones y sus lineas, conciliadas 1 a 1 con
-- los movimientos del libro.

-- CreateEnum
CREATE TYPE "bank_line_status" AS ENUM ('PENDING', 'MATCHED', 'CREATED', 'IGNORED');

-- CreateTable
CREATE TABLE "bank_statement_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "header_row" INTEGER NOT NULL,
    "date_column" VARCHAR(3) NOT NULL,
    "description_column" VARCHAR(3) NOT NULL,
    "reference_column" VARCHAR(3),
    "amount_column" VARCHAR(3),
    "debit_column" VARCHAR(3),
    "credit_column" VARCHAR(3),
    "date_format" VARCHAR(10) NOT NULL,
    "decimal_separator" VARCHAR(1) NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "line_count" INTEGER NOT NULL,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statement_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(15,2) NOT NULL,
    "line_key" TEXT NOT NULL,
    "status" "bank_line_status" NOT NULL DEFAULT 'PENDING',
    "movement_id" UUID,
    "ignore_reason" TEXT,
    "reconciled_by" UUID,
    "reconciled_at" TIMESTAMPTZ(6),

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_profiles_account_id_key" ON "bank_statement_profiles"("account_id");

-- CreateIndex
CREATE INDEX "idx_bank_statements_account_created" ON "bank_statements"("account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_movement_id_key" ON "bank_statement_lines"("movement_id");

-- CreateIndex
CREATE INDEX "idx_bank_statement_lines_statement" ON "bank_statement_lines"("statement_id");

-- CreateIndex
CREATE INDEX "idx_bank_statement_lines_account_status" ON "bank_statement_lines"("account_id", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_key" ON "bank_statement_lines"("account_id", "line_key");

-- CreateIndex

-- AddForeignKey
ALTER TABLE "bank_statement_profiles" ADD CONSTRAINT "bank_statement_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_profiles" ADD CONSTRAINT "bank_statement_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "treasury_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_profiles" ADD CONSTRAINT "bank_statement_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "treasury_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "treasury_movements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- ── Reglas que Prisma no modela ─────────────────────────────────────────────

-- Perfil: el importe en una columna con signo, o en debito y credito separados.
ALTER TABLE bank_statement_profiles ADD CONSTRAINT bank_statement_profiles_check CHECK (
  header_row >= 0
  AND date_format IN ('DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM/DD/YYYY')
  AND decimal_separator IN (',', '.')
  AND ((amount_column IS NOT NULL AND debit_column IS NULL AND credit_column IS NULL)
       OR (amount_column IS NULL AND debit_column IS NOT NULL AND credit_column IS NOT NULL))
);

ALTER TABLE bank_statements ADD CONSTRAINT bank_statements_check CHECK (date_to >= date_from AND line_count >= 0 AND skipped_count >= 0);

-- Linea: importe distinto de 0 y las columnas de cada estado.
ALTER TABLE bank_statement_lines ADD CONSTRAINT bank_statement_lines_state_check CHECK (
  amount <> 0
  AND (
    (status = 'PENDING' AND movement_id IS NULL AND ignore_reason IS NULL AND reconciled_at IS NULL)
    OR (status IN ('MATCHED', 'CREATED') AND movement_id IS NOT NULL AND ignore_reason IS NULL AND reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL)
    OR (status = 'IGNORED' AND movement_id IS NULL AND ignore_reason IS NOT NULL AND reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL)
  )
);
