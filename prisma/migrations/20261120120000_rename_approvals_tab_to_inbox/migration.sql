-- 778: la bandeja de aprobaciones pasó a ser «Mi bandeja» (decisiones de mantenimiento). Solo cambia el nombre que
-- ve el editor de roles: el slug y el tab_id no cambian, así que los permisos ya asignados siguen valiendo.
UPDATE tabs
SET name = 'Mi bandeja: decisiones de mantenimiento'
WHERE id = '60000000-0000-0000-0000-000000000044'
  AND slug = 'bandeja_aprobaciones';
