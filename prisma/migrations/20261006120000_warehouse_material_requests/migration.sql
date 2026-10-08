-- Almacenes, etapa 3: pedidos de materiales con aprobacion, entregas vinculadas a salidas de
-- stock y monto maximo de salida directa. Spec: docs/superpowers/specs/2026-10-06-almacenes-etapa-3-design.md

-- CreateEnum
CREATE TYPE "material_request_status" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'REJECTED', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "stock_movement_lines" ADD COLUMN     "request_line_id" UUID;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "material_request_id" UUID;

-- CreateTable
CREATE TABLE "material_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "material_request_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requested_by" UUID NOT NULL,
    "destination_type" "stock_destination_type" NOT NULL,
    "employee_id" UUID,
    "vehicle_id" UUID,
    "other_equipment_id" UUID,
    "maintenance_order_id" UUID,
    "customer_id" UUID,
    "customer_service_id" UUID,
    "notes" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_notes" TEXT,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "close_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_request_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,

    CONSTRAINT "material_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_settings" (
    "company_id" UUID NOT NULL,
    "direct_exit_max_amount" DECIMAL(15,2),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "warehouse_settings_pkey" PRIMARY KEY ("company_id")
);

-- CreateIndex
CREATE INDEX "idx_material_requests_company_status" ON "material_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "idx_material_requests_requested_by" ON "material_requests"("requested_by");

-- CreateIndex
CREATE UNIQUE INDEX "material_requests_company_id_number_key" ON "material_requests"("company_id", "number");

-- CreateIndex
CREATE INDEX "idx_material_request_lines_request_id" ON "material_request_lines"("request_id");

-- CreateIndex
CREATE INDEX "idx_stock_movement_lines_request_line" ON "stock_movement_lines"("request_line_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_material_request" ON "stock_movements"("material_request_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_material_request_id_fkey" FOREIGN KEY ("material_request_id") REFERENCES "material_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movement_lines" ADD CONSTRAINT "stock_movement_lines_request_line_id_fkey" FOREIGN KEY ("request_line_id") REFERENCES "material_request_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_other_equipment_id_fkey" FOREIGN KEY ("other_equipment_id") REFERENCES "other_equipment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_maintenance_order_id_fkey" FOREIGN KEY ("maintenance_order_id") REFERENCES "maintenance_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_customer_service_id_fkey" FOREIGN KEY ("customer_service_id") REFERENCES "customer_services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_request_lines" ADD CONSTRAINT "material_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "material_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_request_lines" ADD CONSTRAINT "material_request_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warehouse_settings" ADD CONSTRAINT "warehouse_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ── Lo que Prisma no sabe expresar ──────────────────────────────────────────

-- El destino del pedido: obligatorio y con exactamente la FK de su tipo (mismo criterio que
-- stock_movements_single_destination_check).
ALTER TABLE "material_requests"
  ADD CONSTRAINT "material_requests_single_destination_check" CHECK (
    ("employee_id" IS NOT NULL) = ("destination_type" = 'EMPLOYEE')
    AND ("vehicle_id" IS NOT NULL) = ("destination_type" = 'VEHICLE')
    AND ("other_equipment_id" IS NOT NULL) = ("destination_type" = 'OTHER_EQUIPMENT')
    AND ("maintenance_order_id" IS NOT NULL) = ("destination_type" = 'MAINTENANCE_ORDER')
    AND ("customer_id" IS NOT NULL) = ("destination_type" = 'CUSTOMER')
  ),
  ADD CONSTRAINT "material_requests_customer_service_check" CHECK (
    "customer_service_id" IS NULL OR "customer_id" IS NOT NULL
  );

ALTER TABLE "material_request_lines"
  ADD CONSTRAINT "material_request_lines_quantity_check" CHECK ("quantity" > 0);

-- Solo una salida puede ser la entrega de un pedido.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_request_check" CHECK (
    "material_request_id" IS NULL OR "type" = 'EXIT'
  );

ALTER TABLE "warehouse_settings"
  ADD CONSTRAINT "warehouse_settings_direct_exit_check" CHECK (
    "direct_exit_max_amount" IS NULL OR "direct_exit_max_amount" >= 0
  );

-- ── Permisos ────────────────────────────────────────────────────────────────

INSERT INTO actions (slug, name) VALUES ('direct_exit', 'Salida directa')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- Salida directa para TODO rol que hoy registra movimientos (de sistema y de cada empresa):
-- decision del usuario para que nadie pierda lo que hace hoy. Despues se le quita a mano a quien
-- deba pasar por pedido. Es una excepcion deliberada a "las migraciones solo tocan los 3 roles
-- de sistema": aca no se otorga algo nuevo, se preserva un comportamiento existente.
INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT rp.role_id, rp.tab_id, a.id
FROM role_permissions rp
JOIN actions create_action ON create_action.id = rp.action_id AND create_action.slug = 'create'
JOIN actions a ON a.slug = 'direct_exit'
WHERE rp.tab_id = 'b0000000-0000-0000-0000-000000000002'
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;

-- Tab Pedidos (mismo contenido que permissions-map.ts). Solo si el modulo existe.
INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
SELECT v.* FROM (VALUES
  ('b0000000-0000-0000-0000-000000000007'::uuid, 'b0000000-0000-0000-0000-000000000000'::uuid, 'pedidos',
   'Pedidos', 'Pedidos de materiales con aprobación y entregas', 3, NULL::uuid)
) AS v(id, module_id, slug, name, description, order_index, parent_tab_id)
WHERE EXISTS (SELECT 1 FROM modules m WHERE m.id = 'b0000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Permisos de Pedidos: solo los 3 roles de sistema.
INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, 'b0000000-0000-0000-0000-000000000007'::uuid, a.id
FROM roles r
JOIN actions a ON a.slug IN ('view', 'view_all_requests', 'create', 'approve', 'update')
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
  AND EXISTS (SELECT 1 FROM tabs t WHERE t.id = 'b0000000-0000-0000-0000-000000000007')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
