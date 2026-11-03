-- Ticket 778: la pestaña «Vista taller» de Mantenimiento pasa a llamarse «Sectores» (sidebar, editor de permisos).
-- Fuente: src/features/Permissions/permissions-map.ts (`workshop_view.name`); el seed escribe el mismo texto.
-- Solo el nombre: no cambia id, slug, descripción ni ningún permiso asignado (role_permissions/user_permissions).
-- Solo pisa el nombre de fábrica: si alguien lo renombró a mano, se respeta. Idempotente.

UPDATE tabs
SET name = 'Sectores'
WHERE id = '60000000-0000-0000-0000-000000000071'
  AND name = 'Vista taller';
