-- Permisos de escritura que faltaban en el mapa (leer = view, crear = create, editar = update, borrar = delete):
--   * Empleados > Diagramas > Cargar Diagramas y Carga Masiva: create y update (antes solo view, así que cualquiera
--     con view podía cargar y modificar novedades).
--   * Mantenimiento > Gestión de Órdenes, Plantillas de Cubiertas y Órdenes de Gomería: delete (la UI lo tapaba con update).
-- Mismo contenido que declara src/features/Permissions/permissions-map.ts. Solo los 3 roles de sistema reciben el permiso;
-- los roles custom de cada empresa se asignan a mano desde el editor de permisos (regla del proyecto).

INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, t.tab_id, a.id
FROM roles r
JOIN (VALUES
  ('20000000-0000-0000-0000-000000000032'::uuid, 'create'),
  ('20000000-0000-0000-0000-000000000032'::uuid, 'update'),
  ('20000000-0000-0000-0000-000000000033'::uuid, 'create'),
  ('20000000-0000-0000-0000-000000000033'::uuid, 'update'),
  ('60000000-0000-0000-0000-000000000043'::uuid, 'delete'),
  ('60000000-0000-0000-0000-000000000062'::uuid, 'delete'),
  ('60000000-0000-0000-0000-000000000063'::uuid, 'delete')
) AS t(tab_id, action_slug) ON TRUE
JOIN actions a ON a.slug = t.action_slug
JOIN tabs tb ON tb.id = t.tab_id
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
