-- Tesoreria, etapa 3b: tab de Cheques propios y sus permisos para los roles de sistema. Mismo
-- contenido que declara src/features/Permissions/permissions-map.ts. Va despues de Cheques.

INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
VALUES
  ('d0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000000', 'cheques-propios',
   'Cheques propios', 'Chequeras y cheques emitidos: débitos, rechazos y números inutilizados', 6, NULL)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, order_index = EXCLUDED.order_index;

UPDATE tabs SET order_index = 7 WHERE id = 'd0000000-0000-0000-0000-000000000006';

-- Permisos de los 3 roles de sistema, y SOLO esos tres: los roles custom de cada empresa se
-- asignan a mano desde el editor de permisos (regla del proyecto).
INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, 'd0000000-0000-0000-0000-000000000008'::uuid, a.id
FROM roles r
JOIN actions a ON a.slug IN ('view', 'create', 'update', 'delete')
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
