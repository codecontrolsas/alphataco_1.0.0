-- Claves de permiso nuevas (mismo contenido que declara src/features/Permissions/permissions-map.ts).
--
-- 1. Acción nueva `send` (enviar al proveedor). Antes el envío lo cubría `update`.
-- 2. Cada clave nueva deriva de una clave que ya existía y que hasta hoy habilitaba lo mismo
--    ("clave de origen"). Se asigna:
--    a) a los 3 roles de sistema (admin, administrador, full-access-provisional), como siempre;
--    b) por decisión del usuario ("copiar a quien ya podía"), a TODO rol —incluidos los custom de
--       cada empresa (slug NULL)— que hoy tenga la clave de origen, para que nadie pierda una
--       capacidad sin aviso cuando las acciones pasen a exigir la clave nueva;
--    c) por el mismo criterio, a los ajustes por usuario (user_permissions) sobre la clave de
--       origen, copiando también si eran concesión o denegación (is_granted).
-- Idempotente: ON CONFLICT DO NOTHING en todo.

INSERT INTO actions (slug, name, description)
VALUES ('send', 'Enviar', 'Enviar al proveedor por correo o marcar como enviado')
ON CONFLICT (slug) DO NOTHING;

DROP TABLE IF EXISTS tmp_permission_key_map;
CREATE TEMP TABLE tmp_permission_key_map (
  new_tab_id uuid NOT NULL,
  new_action text NOT NULL,
  src_tab_id uuid NOT NULL,
  src_action text NOT NULL
);

INSERT INTO tmp_permission_key_map (new_tab_id, new_action, src_tab_id, src_action) VALUES
  -- tesoreria:config-tesoreria:create / :delete  <-  tesoreria:config-tesoreria:update
  ('d0000000-0000-0000-0000-000000000004', 'create', 'd0000000-0000-0000-0000-000000000004', 'update'),
  ('d0000000-0000-0000-0000-000000000004', 'delete', 'd0000000-0000-0000-0000-000000000004', 'update'),
  -- compras:{ordenes,cotizaciones,pagos}:send  <-  la misma tab :update
  ('c0000000-0000-0000-0000-000000000005', 'send', 'c0000000-0000-0000-0000-000000000005', 'update'),
  ('c0000000-0000-0000-0000-000000000004', 'send', 'c0000000-0000-0000-0000-000000000004', 'update'),
  ('c0000000-0000-0000-0000-000000000009', 'send', 'c0000000-0000-0000-0000-000000000009', 'update'),
  -- compras:{solicitudes,cotizaciones,ordenes,recepciones}:view_prices  <-  la misma tab :view
  -- (hasta hoy ver la pestaña ya mostraba los importes)
  ('c0000000-0000-0000-0000-000000000001', 'view_prices', 'c0000000-0000-0000-0000-000000000001', 'view'),
  ('c0000000-0000-0000-0000-000000000004', 'view_prices', 'c0000000-0000-0000-0000-000000000004', 'view'),
  ('c0000000-0000-0000-0000-000000000005', 'view_prices', 'c0000000-0000-0000-0000-000000000005', 'view'),
  ('c0000000-0000-0000-0000-000000000006', 'view_prices', 'c0000000-0000-0000-0000-000000000006', 'view'),
  -- comercial:facturacion:update  <-  comercial:facturacion:create
  ('40000000-0000-0000-0000-000000000019', 'update', '40000000-0000-0000-0000-000000000019', 'create'),
  -- comercial:documentos-contrato:create / :delete  <-  comercial:detalle-contrato:update
  ('40000000-0000-0000-0000-000000000152', 'create', '40000000-0000-0000-0000-000000000151', 'update'),
  ('40000000-0000-0000-0000-000000000152', 'delete', '40000000-0000-0000-0000-000000000151', 'update'),
  -- comercial:mensure_units:delete  <-  comercial:mensure_units:update
  ('40000000-0000-0000-0000-000000000016', 'delete', '40000000-0000-0000-0000-000000000016', 'update');

-- a) + b) roles
INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT DISTINCT r.id, m.new_tab_id, na.id
FROM tmp_permission_key_map m
JOIN tabs t ON t.id = m.new_tab_id
JOIN actions na ON na.slug = m.new_action
JOIN actions sa ON sa.slug = m.src_action
JOIN roles r
  ON r.slug IN ('admin', 'administrador', 'full-access-provisional')
  OR EXISTS (
    SELECT 1 FROM role_permissions o
    WHERE o.role_id = r.id AND o.tab_id = m.src_tab_id AND o.action_id = sa.id
  )
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;

-- c) ajustes por usuario
INSERT INTO user_permissions (user_id, tab_id, action_id, is_granted, assigned_by, company_id)
SELECT up.user_id, m.new_tab_id, na.id, up.is_granted, up.assigned_by, up.company_id
FROM tmp_permission_key_map m
JOIN tabs t ON t.id = m.new_tab_id
JOIN actions na ON na.slug = m.new_action
JOIN actions sa ON sa.slug = m.src_action
JOIN user_permissions up ON up.tab_id = m.src_tab_id AND up.action_id = sa.id
ON CONFLICT (user_id, tab_id, action_id, company_id) DO NOTHING;

DROP TABLE tmp_permission_key_map;
