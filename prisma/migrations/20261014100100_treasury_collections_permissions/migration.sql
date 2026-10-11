-- Tesoreria, etapa 2: tabs de Cobranzas y Retenciones sufridas y sus permisos para los roles de
-- sistema. Mismo contenido que declara src/features/Permissions/permissions-map.ts.

INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
VALUES
  ('d0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000000', 'cobranzas',
   'Cobranzas', 'Recibos de clientes, comprobantes a cobrar y cuenta corriente', 4, NULL),
  ('d0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000000', 'retenciones-sufridas',
   'Retenciones sufridas', 'Retenciones que practicaron los clientes, con su certificado', 5, NULL)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Permisos de los 3 roles de sistema, y SOLO esos tres: los roles custom de cada empresa se
-- asignan a mano desde el editor de permisos (regla del proyecto).
INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, t.tab_id, a.id
FROM roles r
CROSS JOIN (VALUES
  ('d0000000-0000-0000-0000-000000000005'::uuid, ARRAY['view','create','update','delete']),
  ('d0000000-0000-0000-0000-000000000006'::uuid, ARRAY['view','update'])
) AS t(tab_id, action_slugs)
JOIN actions a ON a.slug = ANY(t.action_slugs)
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
