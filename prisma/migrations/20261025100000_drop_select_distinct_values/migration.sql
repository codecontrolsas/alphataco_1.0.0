-- Funcion de SQL dinamico sin consumidores: su unico uso era el DataTable viejo, ya eliminado.
DROP FUNCTION IF EXISTS public.select_distinct_values(text, text, jsonb, jsonb, jsonb);
