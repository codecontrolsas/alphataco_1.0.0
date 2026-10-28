-- Tiempo de estudio (ticket 804, reporte de tiempos): primera y última apertura de cada material por empleado.
-- Tabla aparte de `hse_training_material_reads` (esa fila significa "ya lo leí" y destraba el examen). Solo la escribe
-- `hse_mark_material_opened`; el empleado no escribe directo (p_self_write en false), igual que las lecturas.

-- CreateTable
CREATE TABLE "hse_training_material_opens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "first_opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "hse_training_material_opens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hse_training_material_opens_employee" ON "hse_training_material_opens"("employee_id", "training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_material_opens_company_id" ON "hse_training_material_opens"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_material_opens_material_employee_key" ON "hse_training_material_opens"("material_id", "employee_id");

-- AddForeignKey
ALTER TABLE "hse_training_material_opens" ADD CONSTRAINT "hse_training_material_opens_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_material_opens" ADD CONSTRAINT "hse_training_material_opens_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "hse_training_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_material_opens" ADD CONSTRAINT "hse_training_material_opens_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: empresa + capa por empleado (lo lee él o el dashboard con permiso) + compuerta del módulo HSE.
SELECT public.app_enable_tenant_isolation('public.hse_training_material_opens');
SELECT public.app_enable_employee_self('public.hse_training_material_opens',
  'hse:capacitaciones:view', 'hse:capacitaciones:approve', 'employee_id', false);
SELECT public.app_enable_module_gate('public.hse_training_material_opens', ARRAY['hse']::text[]);

-- function hse_mark_material_opened: el empleado del contexto registra que ABRIÓ un material de una capacitación que le
-- aplica (clic en el enlace del portal). La primera apertura queda; las siguientes solo mueven `last_opened_at`. NO
-- cuenta como lectura: no toca `hse_training_material_reads`, así que no destraba el examen. Con `first_opened_at` y
-- el `read_at` de la lectura se mide el tiempo de estudio.
CREATE OR REPLACE FUNCTION public.hse_mark_material_opened(p_material_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_employee uuid := public.app_current_employee_id();
  v_company uuid := public.app_current_company_id();
  v_training uuid;
BEGIN
  IF v_employee IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'hse_mark_material_opened: falta el empleado del contexto';
  END IF;
  SELECT m.training_id INTO v_training
  FROM public.hse_training_materials m
  WHERE m.id = p_material_id AND m.company_id = v_company;
  IF v_training IS NULL OR NOT public.hse_employee_can_read_training(v_training) THEN
    RAISE EXCEPTION 'hse_mark_material_opened: el material no está disponible';
  END IF;
  INSERT INTO public.hse_training_material_opens (company_id, training_id, material_id, employee_id)
  VALUES (v_company, v_training, p_material_id, v_employee)
  ON CONFLICT (material_id, employee_id) DO UPDATE SET last_opened_at = now();
END
$function$;
