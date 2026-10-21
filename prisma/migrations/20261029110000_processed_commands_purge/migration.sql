-- Purga de comandos procesados viejos. La RLS impide que un job sin empresa borre filas de todas, por eso la funcion es
-- SECURITY DEFINER (corre con los privilegios del duenio) y no se concede al rol de aplicacion.
CREATE OR REPLACE FUNCTION public.purge_processed_commands(p_older_than interval DEFAULT interval '30 days')
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_deleted bigint;
BEGIN
  DELETE FROM public.processed_commands WHERE created_at < now() - p_older_than;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$function$;

REVOKE ALL ON FUNCTION public.purge_processed_commands(interval) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_system') THEN
    GRANT EXECUTE ON FUNCTION public.purge_processed_commands(interval) TO alphataco_system;
  END IF;
END
$$;
