-- T3b: las cascadas pasan al código de la aplicación y se eliminan sus triggers.
-- Idempotente. Las funciones se conservan hasta T6.
--
-- Requiere el código de T3a desplegado (ya no depende de estos triggers):
--   * cascadeServiceItemsActive      (updateCustomerService)
--   * clearOtherDefaultCompanies     (createCompany / updateCompany)
--   * pivotes contractor_employee / contractor_equipment insertadas por código
--   * companies_employees deja de escribirse (sin lectores; el DROP de la tabla va aparte)

-- Empleados: insertaba companies_employees (sin lectores) y copiaba allocated_to a contractor_employee.
DROP TRIGGER IF EXISTS after_employee_insert ON public.employees;

-- Equipos: copiaba allocated_to a contractor_equipment.
DROP TRIGGER IF EXISTS add_contractor_equipment_after_insert ON public.vehicles;

-- Contratos: propagaba is_active a los service_items. OJO: el homónimo de service_items ya se eliminó (T1).
DROP TRIGGER IF EXISTS after_service_update ON public.customer_services;

-- Empresa por defecto: pasa a código + índice único parcial.
DROP TRIGGER IF EXISTS update_company_by_defect_trigger ON public.company;

-- Una sola empresa por defecto por owner. Si hubiera duplicados dejaría solo la más reciente
-- (con el trigger vigente no podían existir; el relevamiento previo dio 0).
UPDATE public.company c
SET by_defect = false
WHERE c.by_defect
  AND c.owner_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.company o
    WHERE o.owner_id = c.owner_id AND o.by_defect AND o.id <> c.id
      AND (o.id::text > c.id::text)
  );

CREATE UNIQUE INDEX IF NOT EXISTS company_one_default_per_owner
  ON public.company (owner_id) WHERE (by_defect IS TRUE);
