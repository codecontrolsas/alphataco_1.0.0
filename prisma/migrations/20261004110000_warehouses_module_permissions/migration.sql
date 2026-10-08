-- Almacenes, etapa 1: modulo, tabs, acciones nuevas y permisos de los roles de sistema.
-- Mismo contenido que declara src/features/Permissions/permissions-map.ts (el seed lo toma de
-- ahi en bases nuevas; esta migracion lo lleva a las bases ya desplegadas).

-- 1) Acciones nuevas: ajustar stock y anular un movimiento no son "registrar movimientos".
INSERT INTO actions (slug, name) VALUES
  ('adjust',  'Ajustar stock'),
  ('reverse', 'Anular movimiento')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- 2) Modulo. `price` y `description` son NOT NULL sin default: se completan igual que el seed.
INSERT INTO modules (id, slug, name, price, description, order_index, is_active)
VALUES ('b0000000-0000-0000-0000-000000000000', 'almacenes', 'Almacenes', 0, 'Almacenes', 0, true)
ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name;

-- 3) Tabs (todas de primer nivel).
INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'stock',
   'Stock', 'Saldos por material y deposito', 0, NULL),
  ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000000', 'movimientos',
   'Movimientos', 'Entradas, salidas, transferencias y ajustes de stock', 1, NULL),
  ('b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000000', 'materiales',
   'Materiales', 'Catalogo de materiales', 2, NULL),
  ('b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000000', 'depositos',
   'Depósitos', 'Depositos de la empresa', 3, NULL),
  ('b0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000000', 'config-almacen',
   'Configuración', 'Categorias de materiales y unidades de medida', 4, NULL)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 4) Permisos de los 3 roles de sistema, y SOLO esos tres: los roles custom de cada empresa
--    se asignan a mano desde el editor de permisos (regla del proyecto). En una base nueva
--    los roles todavia no existen (los crea el seed) y esto no inserta nada: el seed lo cubre.
INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, t.tab_id, a.id
FROM roles r
CROSS JOIN (VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, ARRAY['view','view_prices']),
  ('b0000000-0000-0000-0000-000000000002'::uuid, ARRAY['view','create','adjust','reverse','view_prices']),
  ('b0000000-0000-0000-0000-000000000003'::uuid, ARRAY['view','create','update','delete']),
  ('b0000000-0000-0000-0000-000000000004'::uuid, ARRAY['view','create','update','delete']),
  ('b0000000-0000-0000-0000-000000000005'::uuid, ARRAY['view','create','update','delete'])
) AS t(tab_id, action_slugs)
JOIN actions a ON a.slug = ANY(t.action_slugs)
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;

-- 5) Unidades de medida iniciales para las empresas existentes (copia de
--    src/features/Warehouses/lib/default-units.ts). Las empresas nuevas las reciben del seed.
INSERT INTO measurement_units (company_id, name, abbreviation)
SELECT c.id, u.name, u.abbreviation
FROM company c
CROSS JOIN (VALUES
  ('Unidad', 'u'), ('Litro', 'l'), ('Kilogramo', 'kg'), ('Metro', 'm'), ('Par', 'par'), ('Caja', 'caja')
) AS u(name, abbreviation)
ON CONFLICT DO NOTHING;
