-- Vista sin consumidores (la logica ya vive en Prisma). Una vista corre con los permisos de su dueno y se saltaria el RLS.
DROP VIEW IF EXISTS public.equipments_with_pending_deviations;
