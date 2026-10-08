-- Almacenes, etapa 2: devoluciones de serializados, bajas en poder del tenedor y avisos de
-- vencimiento de lotes. Spec: docs/superpowers/specs/2026-10-06-almacenes-etapa-2-design.md

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "returned_from_movement_id" UUID;

-- CreateTable
CREATE TABLE "material_unit_write_offs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "loan_movement_id" UUID NOT NULL,
    "reason" "material_write_off_reason" NOT NULL,
    "notes" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_unit_write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_material_unit_write_offs_company_id" ON "material_unit_write_offs"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_unit_write_offs_unit_id_loan_movement_id_key" ON "material_unit_write_offs"("unit_id", "loan_movement_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_returned_from" ON "stock_movements"("returned_from_movement_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_returned_from_movement_id_fkey" FOREIGN KEY ("returned_from_movement_id") REFERENCES "stock_movements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_unit_write_offs" ADD CONSTRAINT "material_unit_write_offs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_unit_write_offs" ADD CONSTRAINT "material_unit_write_offs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "material_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_unit_write_offs" ADD CONSTRAINT "material_unit_write_offs_loan_movement_id_fkey" FOREIGN KEY ("loan_movement_id") REFERENCES "stock_movements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_unit_write_offs" ADD CONSTRAINT "material_unit_write_offs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- ── Lo que Prisma no sabe expresar ──────────────────────────────────────────

-- Una devolucion tambien lleva destino: el de la salida cuyo prestamo cierra (asi lo imputado
-- al tenedor se compensa). Antes solo las salidas lo tenian.
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_exit_destination_check";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_exit_destination_check" CHECK (
    ("type" IN ('EXIT', 'RETURN')) = ("destination_type" IS NOT NULL)
  ),
  -- Toda devolucion apunta a la salida que devuelve, y nada mas lo hace.
  ADD CONSTRAINT "stock_movements_return_check" CHECK (
    ("type" = 'RETURN') = ("returned_from_movement_id" IS NOT NULL)
  );

ALTER TABLE "material_unit_write_offs"
  ADD CONSTRAINT "material_unit_write_offs_notes_check" CHECK (btrim("notes") <> '');

-- ── Datos ───────────────────────────────────────────────────────────────────

-- Destinatarios del mail semanal de lotes por vencer: el correo de contacto de cada empresa,
-- INACTIVO, con el mismo criterio que 20260923170000_jobs_runs_and_notification_settings (el
-- contact_email puede ser una casilla real de un cliente que hoy no recibe estos correos; se
-- activa a mano). Las empresas nuevas lo reciben del seed.
INSERT INTO "notification_settings" ("company_id", "kind", "recipients", "is_active")
SELECT c."id", 'stock_batch_expiry'::"notification_kind", ARRAY[c."contact_email"], false
FROM "company" c
WHERE c."contact_email" IS NOT NULL AND btrim(c."contact_email") <> ''
ON CONFLICT ("company_id", "kind") DO NOTHING;

-- Tab Prestamos (mismo contenido que permissions-map.ts). Solo si el modulo existe: en una base
-- nueva lo crea el seed despues de migrar.
INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
SELECT v.* FROM (VALUES
  ('b0000000-0000-0000-0000-000000000006'::uuid, 'b0000000-0000-0000-0000-000000000000'::uuid, 'prestamos',
   'Préstamos', 'Herramientas en poder de empleados, equipos o clientes', 2, NULL::uuid)
) AS v(id, module_id, slug, name, description, order_index, parent_tab_id)
WHERE EXISTS (SELECT 1 FROM modules m WHERE m.id = 'b0000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Permisos: solo los 3 roles de sistema (los roles de cada empresa se asignan a mano).
INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, 'b0000000-0000-0000-0000-000000000006'::uuid, a.id
FROM roles r
JOIN actions a ON a.slug IN ('view', 'create', 'delete')
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
  AND EXISTS (SELECT 1 FROM tabs t WHERE t.id = 'b0000000-0000-0000-0000-000000000006')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
