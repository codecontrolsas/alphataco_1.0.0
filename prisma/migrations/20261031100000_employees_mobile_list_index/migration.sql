-- Listado de empleados de la app móvil (y de la web): empresa + activos/bajas ordenado por apellido, nombre e id.
-- Con el índice, la paginación por cursor lee la página en orden en vez de recorrer y ordenar toda la tabla. Aditiva.
CREATE INDEX IF NOT EXISTS idx_employees_company_active_name
  ON public.employees (company_id, is_active, lastname, firstname, id);
