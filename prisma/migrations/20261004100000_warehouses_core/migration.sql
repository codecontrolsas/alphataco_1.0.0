-- Almacenes, etapa 1: nucleo de inventario.
-- Spec: docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md
--
-- Tablas nuevas, sin datos previos: no hay backfill.


-- CreateEnum
CREATE TYPE "material_tracking_type" AS ENUM ('QUANTITY', 'SERIAL', 'BATCH');

-- CreateEnum
CREATE TYPE "material_unit_status" AS ENUM ('IN_STOCK', 'OUT', 'DISCARDED');

-- CreateEnum
CREATE TYPE "stock_movement_type" AS ENUM ('ENTRY', 'EXIT', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "stock_destination_type" AS ENUM ('EMPLOYEE', 'VEHICLE', 'OTHER_EQUIPMENT', 'MAINTENANCE_ORDER', 'CUSTOMER');


-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "manager_employee_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "unit_id" UUID NOT NULL,
    "tracking_type" "material_tracking_type" NOT NULL DEFAULT 'QUANTITY',
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "min_stock" DECIMAL(15,4),
    "average_cost" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expires_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "status" "material_unit_status" NOT NULL DEFAULT 'IN_STOCK',
    "warehouse_id" UUID,
    "last_movement_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "batch_id" UUID,
    "quantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "stock_movement_type" NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "target_warehouse_id" UUID,
    "occurred_on" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "destination_type" "stock_destination_type",
    "employee_id" UUID,
    "vehicle_id" UUID,
    "other_equipment_id" UUID,
    "maintenance_order_id" UUID,
    "customer_id" UUID,
    "customer_service_id" UUID,
    "reverses_movement_id" UUID,
    "total_cost" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "movement_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "direction" SMALLINT NOT NULL,
    "unit_cost" DECIMAL(15,4) NOT NULL,
    "total_cost" DECIMAL(15,4) NOT NULL,
    "batch_id" UUID,
    "unit_id" UUID,

    CONSTRAINT "stock_movement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_warehouses_company_id" ON "warehouses"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_company_id_code_key" ON "warehouses"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_company_id_name_key" ON "warehouses"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "material_categories_company_id_name_key" ON "material_categories"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_units_company_id_name_key" ON "measurement_units"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_units_company_id_abbreviation_key" ON "measurement_units"("company_id", "abbreviation");

-- CreateIndex
CREATE INDEX "idx_materials_company_id" ON "materials"("company_id");

-- CreateIndex
CREATE INDEX "idx_materials_category_id" ON "materials"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "materials_company_id_code_key" ON "materials"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_material_batches_company_expires" ON "material_batches"("company_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "material_batches_material_id_batch_number_key" ON "material_batches"("material_id", "batch_number");

-- CreateIndex
CREATE INDEX "idx_material_units_warehouse_id" ON "material_units"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_units_material_id_serial_number_key" ON "material_units"("material_id", "serial_number");

-- CreateIndex
CREATE INDEX "idx_stock_balances_company_id" ON "stock_balances"("company_id");

-- CreateIndex
CREATE INDEX "idx_stock_balances_material_warehouse" ON "stock_balances"("material_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "idx_stock_balances_warehouse_id" ON "stock_balances"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reverses_movement_id_key" ON "stock_movements"("reverses_movement_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_company_date" ON "stock_movements"("company_id", "occurred_on", "created_at");

-- CreateIndex
CREATE INDEX "idx_stock_movements_warehouse_id" ON "stock_movements"("warehouse_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_employee_id" ON "stock_movements"("employee_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_vehicle_id" ON "stock_movements"("vehicle_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_other_equipment_id" ON "stock_movements"("other_equipment_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_maintenance_order_id" ON "stock_movements"("maintenance_order_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_customer_id" ON "stock_movements"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_company_id_number_key" ON "stock_movements"("company_id", "number");

-- CreateIndex
CREATE INDEX "idx_stock_movement_lines_movement_id" ON "stock_movement_lines"("movement_id");

-- CreateIndex
CREATE INDEX "idx_stock_movement_lines_material_id" ON "stock_movement_lines"("material_id");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_manager_employee_id_fkey" FOREIGN KEY ("manager_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_categories" ADD CONSTRAINT "material_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_units" ADD CONSTRAINT "measurement_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "material_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "measurement_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_batches" ADD CONSTRAINT "material_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_batches" ADD CONSTRAINT "material_batches_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_units" ADD CONSTRAINT "material_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_units" ADD CONSTRAINT "material_units_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_units" ADD CONSTRAINT "material_units_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_units" ADD CONSTRAINT "material_units_last_movement_id_fkey" FOREIGN KEY ("last_movement_id") REFERENCES "stock_movements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "material_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_target_warehouse_id_fkey" FOREIGN KEY ("target_warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_other_equipment_id_fkey" FOREIGN KEY ("other_equipment_id") REFERENCES "other_equipment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_maintenance_order_id_fkey" FOREIGN KEY ("maintenance_order_id") REFERENCES "maintenance_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_customer_service_id_fkey" FOREIGN KEY ("customer_service_id") REFERENCES "customer_services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reverses_movement_id_fkey" FOREIGN KEY ("reverses_movement_id") REFERENCES "stock_movements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movement_lines" ADD CONSTRAINT "stock_movement_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movement_lines" ADD CONSTRAINT "stock_movement_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movement_lines" ADD CONSTRAINT "stock_movement_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "material_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movement_lines" ADD CONSTRAINT "stock_movement_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "material_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- ── Lo que Prisma no sabe expresar ──────────────────────────────────────────
--
-- Un saldo por material + deposito + lote. `batch_id` es NULL para los materiales que no son
-- BATCH, y con un UNIQUE comun dos NULL no chocan: el motor podria crear dos filas de saldo
-- para lo mismo. NULLS NOT DISTINCT (Postgres 15+) lo cierra en la base.
CREATE UNIQUE INDEX "uq_stock_balances_material_warehouse_batch"
  ON "stock_balances" ("material_id", "warehouse_id", "batch_id") NULLS NOT DISTINCT;

-- El stock nunca queda negativo. El motor valida antes y da el mensaje; esto es la red.
ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_quantity_check" CHECK ("quantity" >= 0);

ALTER TABLE "stock_movement_lines"
  ADD CONSTRAINT "stock_movement_lines_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "stock_movement_lines_direction_check" CHECK ("direction" IN (-1, 1)),
  ADD CONSTRAINT "stock_movement_lines_unit_cost_check" CHECK ("unit_cost" >= 0),
  -- Una unidad serializada es siempre una linea de cantidad 1.
  ADD CONSTRAINT "stock_movement_lines_serial_quantity_check" CHECK ("unit_id" IS NULL OR "quantity" = 1);

-- Deposito destino solo en transferencias, y distinto del origen.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_transfer_check" CHECK (
    ("type" = 'TRANSFER') = ("target_warehouse_id" IS NOT NULL)
    AND ("target_warehouse_id" IS NULL OR "target_warehouse_id" <> "warehouse_id")
  ),
  -- Toda salida (incluida la anulacion de una salida) tiene destino; nada mas lo tiene.
  ADD CONSTRAINT "stock_movements_exit_destination_check" CHECK (
    ("type" = 'EXIT') = ("destination_type" IS NOT NULL)
  ),
  -- Exactamente la FK que corresponde al tipo de destino, y ninguna otra.
  ADD CONSTRAINT "stock_movements_single_destination_check" CHECK (
    ("employee_id" IS NOT NULL) = ("destination_type" IS NOT DISTINCT FROM 'EMPLOYEE')
    AND ("vehicle_id" IS NOT NULL) = ("destination_type" IS NOT DISTINCT FROM 'VEHICLE')
    AND ("other_equipment_id" IS NOT NULL) = ("destination_type" IS NOT DISTINCT FROM 'OTHER_EQUIPMENT')
    AND ("maintenance_order_id" IS NOT NULL) = ("destination_type" IS NOT DISTINCT FROM 'MAINTENANCE_ORDER')
    AND ("customer_id" IS NOT NULL) = ("destination_type" IS NOT DISTINCT FROM 'CUSTOMER')
  ),
  -- El contrato solo acompania a un cliente.
  ADD CONSTRAINT "stock_movements_customer_service_check" CHECK (
    "customer_service_id" IS NULL OR "customer_id" IS NOT NULL
  ),
  -- Un movimiento no se anula a si mismo.
  ADD CONSTRAINT "stock_movements_reversal_self_check" CHECK (
    "reverses_movement_id" IS NULL OR "reverses_movement_id" <> "id"
  );

-- Una unidad tiene deposito solo mientras esta en stock.
ALTER TABLE "material_units"
  ADD CONSTRAINT "material_units_warehouse_check" CHECK (
    ("status" = 'IN_STOCK') = ("warehouse_id" IS NOT NULL)
  );

ALTER TABLE "materials"
  ADD CONSTRAINT "materials_average_cost_check" CHECK ("average_cost" >= 0),
  ADD CONSTRAINT "materials_min_stock_check" CHECK ("min_stock" IS NULL OR "min_stock" >= 0);
