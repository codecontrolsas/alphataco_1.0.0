-- Configuración › Organización › Estructura: organigrama real.
-- 1) Los sectores (`hierarchy`) pasan a formar un árbol: `parent_id` es el sector del que dependen.
-- 2) `org_chart_positions`: cargos del organigrama (un puesto dentro de un sector), con su línea de
--    reporte y un titular opcional. El titular se valida en la server action (legajo activo con ese
--    sector y ese puesto); acá solo se impide que un legajo sea titular de dos cargos.
-- 3) Permisos: la tab "Organigrama" (slug `organigrama`) era la lista de sectores y pasa a llamarse
--    "Sectores" (mismo id y slug: no se pierde ningún permiso). El organigrama nuevo es la tab
--    `org-chart`. Solo los 3 roles de sistema reciben permisos; los custom se asignan a mano.

ALTER TABLE "hierarchy" ADD COLUMN "parent_id" UUID;

CREATE INDEX "idx_hierarchy_parent_id" ON "hierarchy"("parent_id");

ALTER TABLE "hierarchy" ADD CONSTRAINT "hierarchy_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "hierarchy"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE "org_chart_positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "sector_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "reports_to_id" UUID,
    "employee_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_chart_positions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_org_chart_positions_company_id" ON "org_chart_positions"("company_id");
CREATE INDEX "idx_org_chart_positions_sector_id" ON "org_chart_positions"("sector_id");
CREATE INDEX "idx_org_chart_positions_reports_to_id" ON "org_chart_positions"("reports_to_id");

-- Un legajo es titular de un solo cargo.
CREATE UNIQUE INDEX "uq_org_chart_positions_employee" ON "org_chart_positions"("employee_id") WHERE "employee_id" IS NOT NULL;

ALTER TABLE "org_chart_positions" ADD CONSTRAINT "org_chart_positions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_chart_positions" ADD CONSTRAINT "org_chart_positions_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "hierarchy"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "org_chart_positions" ADD CONSTRAINT "org_chart_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "company_positions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "org_chart_positions" ADD CONSTRAINT "org_chart_positions_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "org_chart_positions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "org_chart_positions" ADD CONSTRAINT "org_chart_positions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Permisos ------------------------------------------------------------------------------------

UPDATE tabs SET name = 'Sectores', description = 'Sectores de la empresa y de qué sector depende cada uno'
WHERE id = '10000000-0000-0000-0000-000000000013';

INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
VALUES
  ('10000000-0000-0000-0000-000000000018', 'e0478383-1287-4b5e-a727-985baf867173', 'org-chart',
   'Organigrama', 'Cargos de cada sector, a quién reportan y quién es su titular', 3,
   '10000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, order_index = EXCLUDED.order_index;

-- Mismo orden que declara permissions-map.ts (el seed lo recalcula igual).
UPDATE tabs SET order_index = 4 WHERE id = '10000000-0000-0000-0000-000000000014';
UPDATE tabs SET order_index = 5 WHERE id = '10000000-0000-0000-0000-000000000004';
UPDATE tabs SET order_index = 6 WHERE id = '10000000-0000-0000-0000-000000000015';
UPDATE tabs SET order_index = 7 WHERE id = '10000000-0000-0000-0000-000000000017';

INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, '10000000-0000-0000-0000-000000000018'::uuid, a.id
FROM roles r
JOIN actions a ON a.slug IN ('view', 'create', 'update', 'delete')
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
