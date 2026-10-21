-- Lote L5 (hijas de segundo nivel): padres que recibieron company_id en el lote anterior.
-- Cada hija recibe company_id derivado de su padre (ver app_add_company_id_from_parent).
-- Inerte para la app mientras conecte como duenio de las tablas (RLS no le aplica).
SELECT public.app_add_company_id_from_parent('public.area_province', 'area_id', 'public.areas_cliente');
