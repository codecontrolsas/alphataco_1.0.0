-- Tesoreria, etapa 1: modulo, tabs y permisos de los roles de sistema.
-- Mismo contenido que declara src/features/Permissions/permissions-map.ts (el seed lo toma de
-- ahi en bases nuevas; esta migracion lo lleva a las bases ya desplegadas).

-- 1) Modulo. `price` y `description` son NOT NULL sin default: se completan igual que el seed.
INSERT INTO modules (id, slug, name, price, description, order_index, is_active)
VALUES ('d0000000-0000-0000-0000-000000000000', 'tesoreria', 'Tesorería', 0, 'Tesorería', 0, true)
ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name;

-- 2) Tabs (todas de primer nivel).
INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000000', 'cuentas',
   'Cuentas', 'Saldos de cuentas bancarias y cajas, y su extracto', 0, NULL),
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000000', 'movimientos',
   'Movimientos', 'Movimientos de las cuentas y cajas', 1, NULL),
  ('d0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000000', 'transferencias',
   'Transferencias', 'Transferencias entre cuentas y cajas', 2, NULL),
  ('d0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000000', 'config-tesoreria',
   'Configuración', 'Cuentas, cajas y conceptos de Tesorería', 3, NULL)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 3) Permisos de los 3 roles de sistema, y SOLO esos tres: los roles custom de cada empresa
--    se asignan a mano desde el editor de permisos (regla del proyecto).
INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, t.tab_id, a.id
FROM roles r
CROSS JOIN (VALUES
  ('d0000000-0000-0000-0000-000000000001'::uuid, ARRAY['view']),
  ('d0000000-0000-0000-0000-000000000002'::uuid, ARRAY['view','create','update']),
  ('d0000000-0000-0000-0000-000000000003'::uuid, ARRAY['view','create','update']),
  ('d0000000-0000-0000-0000-000000000004'::uuid, ARRAY['view','update'])
) AS t(tab_id, action_slugs)
JOIN actions a ON a.slug = ANY(t.action_slugs)
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
