-- Almacenes etapa 6: las cubiertas son unidades serializadas del stock.
-- Spec: docs/superpowers/specs/2026-10-07-almacenes-etapa-6-design.md

-- ── Cubierta -> unidad de stock, y movimientos de cada item de la orden ───────
ALTER TABLE "tires" ADD COLUMN "material_unit_id" UUID;
CREATE UNIQUE INDEX "tires_material_unit_id_key" ON "tires"("material_unit_id");
ALTER TABLE "tires" ADD CONSTRAINT "tires_material_unit_id_fkey" FOREIGN KEY ("material_unit_id") REFERENCES "material_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "tire_service_items"
  ADD COLUMN "mount_movement_id" UUID,
  ADD COLUMN "return_movement_id" UUID;
ALTER TABLE "tire_service_items" ADD CONSTRAINT "tire_service_items_mount_movement_id_fkey" FOREIGN KEY ("mount_movement_id") REFERENCES "stock_movements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "tire_service_items" ADD CONSTRAINT "tire_service_items_return_movement_id_fkey" FOREIGN KEY ("return_movement_id") REFERENCES "stock_movements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Vinculo tipo + marca -> material (nunca se borra) ─────────────────────────
CREATE TABLE "tire_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "tire_type_id" UUID NOT NULL,
    "tire_brand_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tire_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tire_materials_material_id_key" ON "tire_materials"("material_id");
CREATE UNIQUE INDEX "tire_materials_combination_key" ON "tire_materials"("tire_type_id", "tire_brand_id");
CREATE INDEX "idx_tire_materials_company" ON "tire_materials"("company_id");

ALTER TABLE "tire_materials" ADD CONSTRAINT "tire_materials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tire_materials" ADD CONSTRAINT "tire_materials_tire_type_id_fkey" FOREIGN KEY ("tire_type_id") REFERENCES "tire_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "tire_materials" ADD CONSTRAINT "tire_materials_tire_brand_id_fkey" FOREIGN KEY ("tire_brand_id") REFERENCES "tire_brands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "tire_materials" ADD CONSTRAINT "tire_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Materiales de las combinaciones existentes ─────────────────────────────────
-- Misma regla que src/features/Warehouses/lib/tire-material-code.ts (si cambia una, cambia la
-- otra): CUB-{medida}-{dibujo}-{marca 3 letras}; colision -> -2, -3... Sin unidades: las
-- cubiertas existentes quedan sin stock hasta el inventario inicial.
DO $$
DECLARE
  combo RECORD;
  v_category UUID;
  v_unit UUID;
  v_base TEXT;
  v_code TEXT;
  v_n INT;
  v_material UUID;
  v_company UUID := NULL;
  c_from CONSTANT TEXT := 'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ';
  c_to   CONSTANT TEXT := 'aeiouaeiouaeiouaeiouncAEIOUAEIOUAEIOUAEIOUNC';
BEGIN
  FOR combo IN
    SELECT tt.company_id, tt.id AS type_id, tb.id AS brand_id, tt.size, tt.tread_type::text AS tread_type,
           tb.name AS brand_name, (tt.is_active AND tb.is_active) AS active
    FROM tire_types tt
    JOIN tire_brands tb ON tb.company_id = tt.company_id
    WHERE NOT EXISTS (
      SELECT 1 FROM tire_materials tm WHERE tm.tire_type_id = tt.id AND tm.tire_brand_id = tb.id
    )
    ORDER BY tt.company_id, tt.size, tt.tread_type, tb.name
  LOOP
    IF v_company IS DISTINCT FROM combo.company_id THEN
      v_company := combo.company_id;
      INSERT INTO material_categories (company_id, name) VALUES (v_company, 'Cubiertas') ON CONFLICT DO NOTHING;
      SELECT id INTO v_category FROM material_categories WHERE company_id = v_company AND name = 'Cubiertas';
      INSERT INTO measurement_units (company_id, name, abbreviation) VALUES (v_company, 'Unidad', 'u') ON CONFLICT DO NOTHING;
      SELECT id INTO v_unit FROM measurement_units
      WHERE company_id = v_company AND (abbreviation = 'u' OR name = 'Unidad')
      ORDER BY (abbreviation = 'u') DESC LIMIT 1;
    END IF;

    v_base := 'CUB-'
      || COALESCE(NULLIF(regexp_replace(upper(translate(combo.size, c_from, c_to)), '[^A-Z0-9/.]', '', 'g'), ''), 'S')
      || '-' || CASE combo.tread_type WHEN 'SMOOTH' THEN 'LIS' WHEN 'MIXED' THEN 'MIX' ELSE 'TAC' END
      || '-' || COALESCE(NULLIF(left(regexp_replace(upper(translate(combo.brand_name, c_from, c_to)), '[^A-Z0-9]', '', 'g'), 3), ''), 'SM');

    v_code := v_base;
    v_n := 1;
    WHILE EXISTS (SELECT 1 FROM materials WHERE company_id = combo.company_id AND code = v_code) LOOP
      v_n := v_n + 1;
      v_code := v_base || '-' || v_n;
    END LOOP;

    INSERT INTO materials (company_id, code, name, category_id, unit_id, tracking_type, is_active)
    VALUES (combo.company_id, v_code,
            'Cubierta ' || btrim(combo.size) || ' '
              || CASE combo.tread_type WHEN 'SMOOTH' THEN 'Liso' WHEN 'MIXED' THEN 'Mixto' ELSE 'Taco' END
              || ' · ' || btrim(combo.brand_name),
            v_category, v_unit, 'SERIAL', combo.active)
    RETURNING id INTO v_material;

    INSERT INTO tire_materials (company_id, tire_type_id, tire_brand_id, material_id)
    VALUES (combo.company_id, combo.type_id, combo.brand_id, v_material);
  END LOOP;
END $$;
