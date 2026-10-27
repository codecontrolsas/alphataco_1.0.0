-- Contexto de empresa para RLS (ver docs/arquitectura/MODELO-DE-TRABAJO.md y la regla de migraciones).
-- La app fija estos valores por transaccion con set_config(nombre, valor, true); nunca con SET de sesion.
-- Este archivo solo define funciones: ninguna politica RLS depende de ellas todavia.

-- function app_current_company_id: empresa activa de la transaccion; NULL si no hay (jobs, psql, seeds).
CREATE OR REPLACE FUNCTION public.app_current_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT nullif(current_setting('app.company_id', true), '')::uuid
$function$;

-- function app_current_actor_kind: user | operator | employee | guest | api | job; NULL si no se fijo.
-- `employee` = sesion con legajo vinculado que NO es miembro ni duenio de la empresa (portal de empleados).
CREATE OR REPLACE FUNCTION public.app_current_actor_kind()
 RETURNS text
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT nullif(current_setting('app.actor_kind', true), '')
$function$;

-- function app_rls_mode: off | shadow | enforce. Sin setting = off (comportamiento actual).
CREATE OR REPLACE FUNCTION public.app_rls_mode()
 RETURNS text
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT coalesce(nullif(current_setting('app.rls_mode', true), ''), 'off')
$function$;

-- function app_accessible_company_ids: empresas que el usuario de `app.user_id` puede usar como empresa activa.
-- Misma regla que `canUseCompanyAsTenant()` (src/shared/lib/company-membership.ts):
--   owner de la empresa, miembro activo de share_company_users, o empleado vinculado al profile.
-- SECURITY DEFINER: lee company/share_company_users/employees antes de que exista empresa activa.
CREATE OR REPLACE FUNCTION public.app_accessible_company_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT coalesce(array_agg(DISTINCT c.id), '{}'::uuid[])
  FROM public.profile p
  JOIN public.company c
    ON c.owner_id = p.id
    OR EXISTS (
      SELECT 1 FROM public.share_company_users s
      WHERE s.profile_id = p.id AND s.company_id = c.id AND s.is_active
    )
    OR (
      p.employee_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = p.employee_id AND e.company_id = c.id)
    )
  WHERE p.credential_id = public.app_current_user_id()
$function$;

-- function app_enable_tenant_isolation: aislamiento por empresa para una tabla con una columna de empresa `uuid NOT NULL`
-- (`company_id`, o la que se indique: p. ej. `documents_company.applies`).
-- Habilita RLS y deja la politica `tenant_isolation` (lectura y escritura solo de la empresa activa).
-- Falla si la tabla no tiene la columna o es nullable: esos casos llevan otra politica (catalogos mixtos, herencia).
-- El duenio de la tabla y alphataco_system (BYPASSRLS) no pasan por la politica; alphataco_app si.
CREATE OR REPLACE FUNCTION public.app_enable_tenant_isolation(p_table regclass, p_column text DEFAULT 'company_id')
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_nullable boolean;
BEGIN
  SELECT NOT a.attnotnull INTO v_nullable
  FROM pg_attribute a
  WHERE a.attrelid = p_table AND a.attname = p_column AND NOT a.attisdropped;

  IF v_nullable IS NULL THEN
    RAISE EXCEPTION 'La tabla % no tiene columna %', p_table, p_column;
  ELSIF v_nullable THEN
    RAISE EXCEPTION 'La columna % de % admite NULL: usar la politica de catalogo mixto', p_column, p_table;
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', p_table);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (%I = public.app_current_company_id()) WITH CHECK (%I = public.app_current_company_id())',
    p_table, p_column, p_column
  );
END
$function$;

-- function app_add_company_id_from_parent: agrega `company_id` a una tabla hija y lo deriva del padre.
--   1. columna `company_id uuid` + backfill desde el padre (por la FK indicada)
--   2. DEFAULT app_current_company_id() (empresa activa) y NOT NULL si no quedan filas sin empresa
--   3. indice por empresa
--   4. trigger BEFORE INSERT/UPDATE (SECURITY DEFINER: ve el padre aunque la RLS se lo oculte al usuario) que fija
--      company_id con el de la fila padre: la empresa del hijo SIEMPRE es la del padre, aunque el contexto sea otro o no
--      haya (jobs y triggers siguen funcionando) y la politica rechaza un hijo atado a un padre de otra empresa
--   5. aislamiento por empresa (RLS) si la columna quedo NOT NULL
-- Si el padre no tiene `company_id` todavia, primero hay que llamarla para el padre.
CREATE OR REPLACE FUNCTION public.app_add_company_id_from_parent(
  p_child regclass,
  p_fk text,
  p_parent regclass,
  p_parent_key text DEFAULT 'id'
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_name text;
  v_nulls bigint;
  v_fn text;
BEGIN
  SELECT relname INTO v_name FROM pg_class WHERE oid = p_child;
  v_fn := 'trg_' || left(v_name, 40) || '_company_from_parent';

  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS company_id uuid', p_child);
  -- El rellenado no es una edicion de negocio: se desactivan los triggers de usuario de la tabla (inmutabilidad de
  -- comprobantes autorizados, historial, `updated_at`...) solo durante el UPDATE. Los de FK son internos y siguen activos.
  EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', p_child);
  EXECUTE format(
    'UPDATE %s c SET company_id = p.company_id FROM %s p WHERE c.%I = p.%I AND c.company_id IS NULL',
    p_child, p_parent, p_fk, p_parent_key
  );
  EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', p_child);
  EXECUTE format('ALTER TABLE %s ALTER COLUMN company_id SET DEFAULT public.app_current_company_id()', p_child);
  EXECUTE format('SELECT count(*) FROM %s WHERE company_id IS NULL', p_child) INTO v_nulls;
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (company_id)', 'idx_' || left(v_name, 50) || '_company_id', p_child);

  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $b$
       DECLARE v_company uuid;
       BEGIN
         SELECT company_id INTO v_company FROM %s WHERE %I = NEW.%I;
         IF v_company IS NOT NULL THEN NEW.company_id := v_company; END IF;
         RETURN NEW;
       END $b$$f$,
    v_fn, p_parent, p_parent_key, p_fk
  );
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_fn, p_child);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, company_id ON %s FOR EACH ROW EXECUTE FUNCTION public.%I()',
    v_fn, p_fk, p_child, v_fn
  );

  IF v_nulls = 0 THEN
    EXECUTE format('ALTER TABLE %s ALTER COLUMN company_id SET NOT NULL', p_child);
    PERFORM public.app_enable_tenant_isolation(p_child);
  ELSE
    RAISE WARNING 'La tabla % tiene % filas sin padre (company_id NULL): queda nullable y sin RLS hasta completarlas', p_child, v_nulls;
  END IF;
END
$function$;


-- function app_add_company_id_from_parents: igual que app_add_company_id_from_parent pero para hijas con VARIAS claves
-- foraneas opcionales (p. ej. dailyreportrows: parte, cliente o pedido). La empresa sale del primer padre que exista,
-- en el orden dado. Si ninguna fila padre responde, la columna queda nullable y sin RLS (aviso).
CREATE OR REPLACE FUNCTION public.app_add_company_id_from_parents(
  p_child regclass,
  p_fks text[],
  p_parents regclass[]
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_name text;
  v_nulls bigint;
  v_fn text;
  v_i int;
  v_backfill text := '';
  v_lookup text := '';
BEGIN
  SELECT relname INTO v_name FROM pg_class WHERE oid = p_child;
  v_fn := 'trg_' || left(v_name, 40) || '_company_from_parent';

  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS company_id uuid', p_child);
  -- El rellenado no es una edicion de negocio: se desactivan los triggers de usuario de la tabla solo durante los UPDATE.
  EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', p_child);

  FOR v_i IN 1 .. array_length(p_fks, 1) LOOP
    EXECUTE format(
      'UPDATE %s c SET company_id = p.company_id FROM %s p WHERE c.%I = p.id AND c.company_id IS NULL',
      p_child, p_parents[v_i], p_fks[v_i]
    );
    v_lookup := v_lookup || format(
      'IF v_company IS NULL AND NEW.%I IS NOT NULL THEN SELECT company_id INTO v_company FROM %s WHERE id = NEW.%I; END IF; ',
      p_fks[v_i], p_parents[v_i], p_fks[v_i]
    );
  END LOOP;

  EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', p_child);
  EXECUTE format('ALTER TABLE %s ALTER COLUMN company_id SET DEFAULT public.app_current_company_id()', p_child);
  EXECUTE format('SELECT count(*) FROM %s WHERE company_id IS NULL', p_child) INTO v_nulls;
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (company_id)', 'idx_' || left(v_name, 50) || '_company_id', p_child);

  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $b$
       DECLARE v_company uuid;
       BEGIN
         %s
         IF v_company IS NOT NULL THEN NEW.company_id := v_company; END IF;
         RETURN NEW;
       END $b$$f$,
    v_fn, v_lookup
  );
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_fn, p_child);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.%I()',
    v_fn, p_child, v_fn
  );

  IF v_nulls = 0 THEN
    EXECUTE format('ALTER TABLE %s ALTER COLUMN company_id SET NOT NULL', p_child);
    PERFORM public.app_enable_tenant_isolation(p_child);
  ELSE
    RAISE WARNING 'La tabla % tiene % filas sin padre (company_id NULL): queda nullable y sin RLS hasta completarlas', p_child, v_nulls;
  END IF;
END
$function$;


-- function app_current_profile_id: `profile.id` del usuario de la transaccion (app.user_id = profile.credential_id).
-- SECURITY DEFINER: se usa dentro de politicas de `profile` y de `share_company_users`, que no pueden consultarse a si
-- mismas sin recursion.
CREATE OR REPLACE FUNCTION public.app_current_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT p.id FROM public.profile p WHERE p.credential_id = public.app_current_user_id() LIMIT 1
$function$;

-- function app_profile_in_current_company: el profile pertenece a la empresa activa (miembro activo, dueno o empleado
-- vinculado). Misma regla que `canUseCompanyAsTenant()`. SECURITY DEFINER por la misma razon.
CREATE OR REPLACE FUNCTION public.app_profile_in_current_company(p_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT p_profile IS NOT NULL AND public.app_current_company_id() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.share_company_users s
      WHERE s.profile_id = p_profile AND s.company_id = public.app_current_company_id() AND s.is_active
    )
    OR EXISTS (SELECT 1 FROM public.company c WHERE c.owner_id = p_profile AND c.id = public.app_current_company_id())
    OR EXISTS (
      SELECT 1 FROM public.profile p JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = p_profile AND e.company_id = public.app_current_company_id()
    )
  )
$function$;


-- function app_enable_user_isolation: tabla de datos PERSONALES (preferencias, vistas): cada usuario ve y escribe solo
-- sus filas (`user_id = app_current_user_id()`), en cualquier empresa. `p_text` para columnas `text` en vez de `uuid`.
CREATE OR REPLACE FUNCTION public.app_enable_user_isolation(p_table regclass, p_column text DEFAULT 'user_id', p_text boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_expr text := CASE WHEN p_text THEN 'public.app_current_user_id()::text' ELSE 'public.app_current_user_id()' END;
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS user_isolation ON %s', p_table);
  EXECUTE format('CREATE POLICY user_isolation ON %s USING (%I = %s) WITH CHECK (%I = %s)', p_table, p_column, v_expr, p_column, v_expr);
END
$function$;


-- function app_has_permission: el usuario de la transaccion tiene el permiso (modulo, tab, accion) en la empresa activa.
-- Es la misma regla que usa la app (`user_has_permission`: permisos del rol asignado en la empresa + permisos propios),
-- pero evaluada por la base. SECURITY DEFINER: las politicas la llaman sin recursion sobre las tablas de permisos.
CREATE OR REPLACE FUNCTION public.app_has_permission(p_module text, p_tab text, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT public.app_current_user_id() IS NOT NULL
     AND public.app_current_company_id() IS NOT NULL
     AND public.user_has_permission(public.app_current_user_id(), public.app_current_company_id(), p_module, p_tab, p_action)
$function$;

-- function app_require_permission_for_writes: agrega politicas RESTRICTIVAS (se suman con AND a las demas) para que insertar,
-- modificar y borrar en la tabla exija un permiso. Las lecturas quedan como estaban. El sistema (BYPASSRLS) y el duenio
-- no pasan por ellas.
CREATE OR REPLACE FUNCTION public.app_require_permission_for_writes(p_table regclass, p_module text, p_tab text, p_action text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_check text := format('public.app_has_permission(%L, %L, %L)', p_module, p_tab, p_action);
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS perm_write_insert ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS perm_write_update ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS perm_write_delete ON %s', p_table);
  EXECUTE format('CREATE POLICY perm_write_insert ON %s AS RESTRICTIVE FOR INSERT WITH CHECK (%s)', p_table, v_check);
  EXECUTE format('CREATE POLICY perm_write_update ON %s AS RESTRICTIVE FOR UPDATE USING (%s) WITH CHECK (%s)', p_table, v_check, v_check);
  EXECUTE format('CREATE POLICY perm_write_delete ON %s AS RESTRICTIVE FOR DELETE USING (%s)', p_table, v_check);
END
$function$;

-- function app_require_any_permission_for_writes: igual que la anterior pero con varios permisos alternativos
-- ('modulo:tab:accion'); alcanza con tener alguno. Para tablas cuyas acciones piden create, update o delete segun la operacion.
CREATE OR REPLACE FUNCTION public.app_require_any_permission_for_writes(p_table regclass, p_perms text[])
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_check text;
BEGIN
  SELECT string_agg(format('public.app_has_permission(%L, %L, %L)', split_part(p, ':', 1), split_part(p, ':', 2), split_part(p, ':', 3)), ' OR ')
    INTO v_check FROM unnest(p_perms) AS p;
  EXECUTE format('DROP POLICY IF EXISTS perm_write_insert ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS perm_write_update ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS perm_write_delete ON %s', p_table);
  EXECUTE format('CREATE POLICY perm_write_insert ON %s AS RESTRICTIVE FOR INSERT WITH CHECK (%s)', p_table, v_check);
  EXECUTE format('CREATE POLICY perm_write_update ON %s AS RESTRICTIVE FOR UPDATE USING (%s) WITH CHECK (%s)', p_table, v_check, v_check);
  EXECUTE format('CREATE POLICY perm_write_delete ON %s AS RESTRICTIVE FOR DELETE USING (%s)', p_table, v_check);
END
$function$;


-- function app_current_employee_id: legajo de la sesion (portal de empleados); NULL si no se fijo.
-- Lo fija la app con set_config('app.employee_id', ..., true) cuando la sesion (no anonima) tiene un legajo vinculado de
-- la empresa activa. Nunca sale de un dato del cliente: lo resuelve `getTenantContext()` desde `profile.employee_id`.
CREATE OR REPLACE FUNCTION public.app_current_employee_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT nullif(current_setting('app.employee_id', true), '')::uuid
$function$;

-- function app_enable_employee_self: capa RESTRICTIVA por empleado, que se SUMA (AND) a `tenant_isolation`.
-- Para tablas con filas de un empleado (`p_column`): una fila se lee solo si es del legajo de la transaccion o si el
-- usuario tiene el permiso de lectura del dashboard (`'modulo:tab:accion'`). Escribir exige el permiso de escritura; con
-- `p_self_write` el empleado tambien puede escribir SUS filas (aceptaciones, intentos, lecturas de HSE).
-- Falla cerrada: sin `app.employee_id` y sin permiso no se ve ninguna fila, aunque la action se olvide de filtrar.
-- Los `(SELECT ...)` hacen que la funcion se evalue una vez por consulta (initplan) y no una vez por fila.
-- Llamarla DESPUES de `app_enable_tenant_isolation`: una politica restrictiva sola no deja pasar nada.
CREATE OR REPLACE FUNCTION public.app_enable_employee_self(
  p_table regclass,
  p_read_perm text,
  p_write_perm text,
  p_column text DEFAULT 'employee_id',
  p_self_write boolean DEFAULT false
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_self text := format('%I = (SELECT public.app_current_employee_id())', p_column);
  v_read text := format('(SELECT public.app_has_permission(%L, %L, %L))',
    split_part(p_read_perm, ':', 1), split_part(p_read_perm, ':', 2), split_part(p_read_perm, ':', 3));
  v_write text := format('(SELECT public.app_has_permission(%L, %L, %L))',
    split_part(p_write_perm, ':', 1), split_part(p_write_perm, ':', 2), split_part(p_write_perm, ':', 3));
  v_read_check text := format('(%s OR %s)', v_self, v_read);
  v_write_check text := CASE WHEN p_self_write THEN format('(%s OR %s)', v_self, v_write) ELSE v_write END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a WHERE a.attrelid = p_table AND a.attname = p_column AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'La tabla % no tiene columna %', p_table, p_column;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE format('%I.%I', schemaname, tablename)::regclass = p_table AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'La tabla % no tiene tenant_isolation: llamar antes a app_enable_tenant_isolation', p_table;
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS employee_self_select ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS employee_self_insert ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS employee_self_update ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS employee_self_delete ON %s', p_table);
  EXECUTE format('CREATE POLICY employee_self_select ON %s AS RESTRICTIVE FOR SELECT USING %s', p_table, v_read_check);
  EXECUTE format('CREATE POLICY employee_self_insert ON %s AS RESTRICTIVE FOR INSERT WITH CHECK (%s)', p_table, v_write_check);
  EXECUTE format('CREATE POLICY employee_self_update ON %s AS RESTRICTIVE FOR UPDATE USING (%s) WITH CHECK (%s)', p_table, v_write_check, v_write_check);
  EXECUTE format('CREATE POLICY employee_self_delete ON %s AS RESTRICTIVE FOR DELETE USING (%s)', p_table, v_write_check);
END
$function$;
