-- Roles de base de datos para RLS (todavia no hay politicas ni cambio de conexion).
--   alphataco_app    : lo usara la app (sin BYPASSRLS: las politicas le aplican).
--   alphataco_system : jobs, seed y Better Auth (con BYPASSRLS).
-- Se crean NOLOGIN y sin contrasena: un administrador les habilita el acceso a mano (docs/deploy/runbook.md).
-- El dueno de las tablas sigue siendo el usuario que migra; no se cambia ningun dueno.
--
-- Tolerante a proposito: si quien migra no puede crear roles (insufficient_privilege) se avisa y se sigue, porque una
-- migracion fallida deja `migrate deploy` en P3009 con cualquier imagen y el contenedor no arranca.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_app') THEN
    CREATE ROLE alphataco_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_system') THEN
    CREATE ROLE alphataco_system NOLOGIN NOSUPERUSER BYPASSRLS;
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO alphataco_app, alphataco_system', current_database());
  GRANT USAGE ON SCHEMA public TO alphataco_app, alphataco_system;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO alphataco_app, alphataco_system;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO alphataco_app, alphataco_system;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO alphataco_app, alphataco_system;

  -- Los objetos que cree quien migra de aqui en adelante heredan los mismos permisos.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO alphataco_app, alphataco_system;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO alphataco_app, alphataco_system;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO alphataco_app, alphataco_system;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'No se pudieron crear los roles alphataco_app/alphataco_system (sin permiso). Ver docs/deploy/runbook.md.';
END
$$;
