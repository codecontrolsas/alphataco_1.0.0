-- #784: el tablero Resumen pasa a mostrar «Para atender» y «Plata». Sus widgets anteriores (personal,
-- equipos y servicios de hoy) quedan en el tablero nuevo «Operación del día».

-- 1. Quien ya guardó sus tableros: el Resumen se reemplaza por el nuevo (pedido del usuario: resetearlo a todos).
UPDATE user_dashboards
SET layout = '[{"widgetId": "attention-inbox", "size": "full"}, {"widgetId": "cash-position", "size": "full"}]'::jsonb,
    updated_at = now()
WHERE template = 'resumen';

-- 2. Y recibe «Operación del día» con los widgets que salieron del Resumen, al final de sus tableros.
-- Sin tableros guardados no hace falta: los por defecto ya lo incluyen.
INSERT INTO user_dashboards (company_id, user_id, name, position, template, layout)
SELECT b.company_id,
       b.user_id,
       'Operación del día',
       (SELECT COALESCE(MAX(o.position), 0) + 1 FROM user_dashboards o WHERE o.user_id = b.user_id AND o.company_id = b.company_id),
       'dia',
       '[{"widgetId": "kpi-employees", "size": "xs"}, {"widgetId": "kpi-active-vehicles", "size": "xs"},
         {"widgetId": "kpi-operative-fleet", "size": "xs"}, {"widgetId": "kpi-today-services", "size": "xs"},
         {"widgetId": "kpi-operativity", "size": "xs"}, {"widgetId": "kpi-checklist-missing", "size": "xs"},
         {"widgetId": "services-today", "size": "lg"}, {"widgetId": "hr-today", "size": "lg"},
         {"widgetId": "equipment-operation", "size": "lg"}, {"widgetId": "equipment-fleet", "size": "lg"}]'::jsonb
FROM (SELECT DISTINCT company_id, user_id FROM user_dashboards) b
WHERE NOT EXISTS (
  SELECT 1 FROM user_dashboards x WHERE x.user_id = b.user_id AND x.company_id = b.company_id AND x.template = 'dia'
)
ON CONFLICT (user_id, company_id, name) DO NOTHING;
