-- Almacenes etapa 5: las entregas de ropa descuentan stock.
-- Spec: docs/superpowers/specs/2026-10-07-almacenes-etapa-5-design.md

-- ── Entrega: deposito, salida de stock y anulacion ─────────────────────────────
ALTER TABLE "clothing_deliveries"
  ADD COLUMN "warehouse_id" UUID,
  ADD COLUMN "stock_movement_id" UUID,
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_by" UUID,
  ADD COLUMN "cancel_reason" TEXT;

CREATE UNIQUE INDEX "clothing_deliveries_stock_movement_id_key" ON "clothing_deliveries"("stock_movement_id");

ALTER TABLE "clothing_deliveries" ADD CONSTRAINT "clothing_deliveries_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "clothing_deliveries" ADD CONSTRAINT "clothing_deliveries_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "clothing_deliveries" ADD CONSTRAINT "clothing_deliveries_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "profile"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Anulacion completa o nada: fecha, quien y motivo van juntos.
ALTER TABLE "clothing_deliveries" ADD CONSTRAINT "clothing_deliveries_cancel_check" CHECK (
  ("cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL)
  OR ("cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL AND "cancel_reason" IS NOT NULL)
);

-- ── Vinculo combinacion -> material (nunca se borra) ───────────────────────────
CREATE TABLE "clothing_item_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "clothing_item_id" UUID NOT NULL,
    "clothing_brand_id" UUID NOT NULL,
    "clothing_size_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clothing_item_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clothing_item_materials_material_id_key" ON "clothing_item_materials"("material_id");
CREATE UNIQUE INDEX "clothing_item_materials_combination_key" ON "clothing_item_materials"("clothing_item_id", "clothing_brand_id", "clothing_size_id");
CREATE INDEX "idx_clothing_item_materials_company" ON "clothing_item_materials"("company_id");

ALTER TABLE "clothing_item_materials" ADD CONSTRAINT "clothing_item_materials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clothing_item_materials" ADD CONSTRAINT "clothing_item_materials_clothing_item_id_fkey" FOREIGN KEY ("clothing_item_id") REFERENCES "clothing_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "clothing_item_materials" ADD CONSTRAINT "clothing_item_materials_clothing_brand_id_fkey" FOREIGN KEY ("clothing_brand_id") REFERENCES "clothing_brands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "clothing_item_materials" ADD CONSTRAINT "clothing_item_materials_clothing_size_id_fkey" FOREIGN KEY ("clothing_size_id") REFERENCES "clothing_sizes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "clothing_item_materials" ADD CONSTRAINT "clothing_item_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Materiales de las combinaciones existentes ─────────────────────────────────
-- Misma regla que src/features/Warehouses/lib/clothing-material-code.ts (si cambia una, cambia la
-- otra): {articulo}-{marca 3 letras}-{talle}, en mayusculas, sin acentos; colision -> -2, -3...
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
    SELECT ci.company_id, ibs.clothing_item_id, ibs.clothing_brand_id, ibs.clothing_size_id,
           ci.code AS item_code, ci.name AS item_name, cb.name AS brand_name, cs.name AS size_name,
           (ci.is_active AND cb.is_active AND cs.is_active) AS active
    FROM clothing_item_brand_sizes ibs
    JOIN clothing_items ci ON ci.id = ibs.clothing_item_id
    JOIN clothing_brands cb ON cb.id = ibs.clothing_brand_id
    JOIN clothing_sizes cs ON cs.id = ibs.clothing_size_id
    WHERE NOT EXISTS (
      SELECT 1 FROM clothing_item_materials cim
      WHERE cim.clothing_item_id = ibs.clothing_item_id
        AND cim.clothing_brand_id = ibs.clothing_brand_id
        AND cim.clothing_size_id = ibs.clothing_size_id
    )
    ORDER BY ci.company_id, ci.name, cb.name, cs.name
  LOOP
    IF v_company IS DISTINCT FROM combo.company_id THEN
      v_company := combo.company_id;
      INSERT INTO material_categories (company_id, name) VALUES (v_company, 'Ropa') ON CONFLICT DO NOTHING;
      SELECT id INTO v_category FROM material_categories WHERE company_id = v_company AND name = 'Ropa';
      INSERT INTO measurement_units (company_id, name, abbreviation) VALUES (v_company, 'Unidad', 'u') ON CONFLICT DO NOTHING;
      SELECT id INTO v_unit FROM measurement_units
      WHERE company_id = v_company AND (abbreviation = 'u' OR name = 'Unidad')
      ORDER BY (abbreviation = 'u') DESC LIMIT 1;
    END IF;

    v_base :=
      COALESCE(NULLIF(regexp_replace(upper(translate(COALESCE(combo.item_code, ''), c_from, c_to)), '[^A-Z0-9-]', '', 'g'), ''),
               NULLIF(left(regexp_replace(upper(translate(combo.item_name, c_from, c_to)), '[^A-Z0-9]', '', 'g'), 6), ''),
               'ROPA')
      || '-' || COALESCE(NULLIF(left(regexp_replace(upper(translate(combo.brand_name, c_from, c_to)), '[^A-Z0-9]', '', 'g'), 3), ''), 'SM')
      || '-' || COALESCE(NULLIF(regexp_replace(upper(translate(combo.size_name, c_from, c_to)), '[^A-Z0-9]', '', 'g'), ''), 'U');

    v_code := v_base;
    v_n := 1;
    WHILE EXISTS (SELECT 1 FROM materials WHERE company_id = combo.company_id AND code = v_code) LOOP
      v_n := v_n + 1;
      v_code := v_base || '-' || v_n;
    END LOOP;

    INSERT INTO materials (company_id, code, name, category_id, unit_id, tracking_type, is_active)
    VALUES (combo.company_id, v_code,
            btrim(combo.item_name) || ' · ' || btrim(combo.brand_name) || ' · ' || btrim(combo.size_name),
            v_category, v_unit, 'QUANTITY', combo.active)
    RETURNING id INTO v_material;

    INSERT INTO clothing_item_materials (company_id, clothing_item_id, clothing_brand_id, clothing_size_id, material_id)
    VALUES (combo.company_id, combo.clothing_item_id, combo.clothing_brand_id, combo.clothing_size_id, v_material);
  END LOOP;
END $$;

-- ── Permiso para anular entregas: empleados > detalle > indumentaria, solo roles de sistema ──
INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, '3df67b2a-f5e7-47e0-849b-88698d055863'::uuid, a.id
FROM roles r
JOIN actions a ON a.slug = 'delete'
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
  AND EXISTS (SELECT 1 FROM tabs t WHERE t.id = '3df67b2a-f5e7-47e0-849b-88698d055863')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
