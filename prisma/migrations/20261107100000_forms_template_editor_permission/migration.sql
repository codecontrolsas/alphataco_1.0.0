-- Ticket 805 · Formularios dinámicos por empresa: la acción `update` de Formularios (`formularios:formularios:update`)
-- habilita configurar las plantillas de checklist de la empresa (alta, edición, duplicado, activación y baja).
-- `create` sigue siendo cargar respuestas. Se asigna solo a los 3 roles de acceso completo; los roles propios de cada
-- empresa la reciben a mano desde el editor de permisos.

INSERT INTO actions (slug, name)
VALUES ('update', 'Editar')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, '80000000-0000-0000-0000-000000000001'::uuid, a.id
FROM roles r
JOIN tabs t ON t.id = '80000000-0000-0000-0000-000000000001'::uuid
JOIN actions a ON a.slug = 'update'
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
