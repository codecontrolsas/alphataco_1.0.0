-- Configuración > Mantenimiento: Tipos de Reparación pasa a tener `delete` (antes eliminar exigía `update`).
-- Mismo contenido que declara src/features/Permissions/permissions-map.ts. Solo los 3 roles de sistema reciben el permiso;
-- los roles custom de cada empresa se asignan a mano desde el editor de permisos (regla del proyecto).

INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, t.tab_id, a.id
FROM roles r
JOIN (VALUES
  ('60000000-0000-0000-0000-000000000012'::uuid)
) AS t(tab_id) ON TRUE
JOIN tabs tb ON tb.id = t.tab_id
JOIN actions a ON a.slug = 'delete'
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
