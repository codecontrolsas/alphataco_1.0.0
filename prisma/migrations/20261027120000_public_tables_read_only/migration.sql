-- Tablas publicas compartidas (sin company_id): geografia, modulos/tabs/acciones y catalogos fijos. Toda empresa las
-- LEE; solo el sistema las escribe (seed y migraciones). El rol de aplicacion pierde INSERT/UPDATE/DELETE/TRUNCATE.
-- Tolerante: si el rol no existe o quien migra no puede revocar, avisa y sigue (no deja `migrate deploy` bloqueado).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_app') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
      public.actions, public.modules, public.tabs,
      public.countries, public.provinces, public.cities,
      public.industry_type, public.type_operative, public.types_of_vehicles,
      public.checklist_sections, public.checklist_items
    FROM alphataco_app;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'No se pudieron restringir las tablas publicas a solo lectura (sin permiso).';
END
$$;
