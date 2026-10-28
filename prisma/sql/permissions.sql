-- Generado por scripts/sql/extract-sql-objects.ts — editar a mano SOLO en la revisión de Task 4
-- Dominio: permissions — 6 objeto(s)

-- ============================================================================
-- FUNCTIONS (4)
-- ============================================================================

-- `assign_owner_role_on_company_creation()` y su trigger `assign_owner_role_trigger` se
-- eliminaron en la Task 13a de P2: insertaba en `user_roles(user_id)` el `company.owner_id`,
-- que es un `profile.id`, cuando esa columna es FK a `profile.credential_id` — y además
-- salía por el `RAISE WARNING` porque no existe ningún rol `slug = 'owner'` en el seed, así
-- que en la práctica no hacía nada. El alta del owner (pertenencia en `share_company_users`
-- y rol inicial de la empresa) la resuelve `createCompany` en la aplicación.

-- function check_multiple_permissions (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
-- Task 13a: suma `p_company_id` (los roles pasaron a ser por empresa).
CREATE OR REPLACE FUNCTION public.check_multiple_permissions(p_user_id uuid, p_company_id uuid, p_permissions jsonb)
 RETURNS TABLE(module_slug text, tab_slug text, action_slug text, has_permission boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    perm->>'module' as module_slug,
    perm->>'tab' as tab_slug,
    perm->>'action' as action_slug,
    EXISTS (
      SELECT 1 
      FROM public.get_user_permissions(p_user_id, p_company_id) up
      WHERE up.module_slug = perm->>'module'
        AND up.tab_slug = perm->>'tab'
        AND up.action_slug = perm->>'action'
        AND up.is_granted = true
    ) as has_permission
  FROM jsonb_array_elements(p_permissions) as perm;
END;
$function$;

-- function get_user_accessible_modules (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
-- Task 13a: suma `p_company_id` (los roles pasaron a ser por empresa).
CREATE OR REPLACE FUNCTION public.get_user_accessible_modules(p_user_id uuid, p_company_id uuid)
 RETURNS TABLE(module_id uuid, module_slug text, module_name text, module_icon text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        m.id,
        m.slug,
        m.name,
        m.icon
    FROM public.modules m
    WHERE m.is_active = true
        AND EXISTS (
            SELECT 1
            FROM public.get_user_permissions(p_user_id, p_company_id) up
            WHERE up.module_id = m.id
                AND up.action_slug = 'view'  -- Only count 'view' permissions
        )
    ORDER BY m.id;
END;
$function$;

-- function get_user_permissions (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
-- Task 13a: suma `p_company_id`. `user_roles` ganó `company_id`, así que un rol vale en la
-- empresa donde se otorgó y no en todas las del usuario.
-- Task 13b: `user_permissions` también ganó `company_id`. Las DOS fuentes que combina esta
-- función quedan acotadas a la empresa: un permiso custom otorgado en una empresa ya no vale
-- en las demás donde el usuario entre.
-- F3 (control de módulos): se excluyen las pestañas de las claves apagadas para la empresa
-- (`app_disabled_tab_ids`, prisma/sql/modules.sql). Los permisos otorgados no se tocan: solo se filtran, así que al
-- reencender un módulo cada usuario recupera exactamente lo que tenía.
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id uuid, p_company_id uuid)
 RETURNS TABLE(module_id uuid, module_slug text, module_name text, tab_id uuid, tab_slug text, tab_name text, action_id uuid, action_slug text, action_name text, source text, is_granted boolean, role_id bigint, role_name text, role_color text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    RETURN QUERY
    WITH user_role_permissions AS (
        -- Get permissions from user's roles
        SELECT DISTINCT
            m.id as module_id,
            m.slug as module_slug,
            m.name as module_name,
            t.id as tab_id,
            t.slug as tab_slug,
            t.name as tab_name,
            a.id as action_id,
            a.slug as action_slug,
            a.name as action_name,
            'role' as source,
            true as is_granted,
            r.id as role_id,
            r.name as role_name,
            r.color as role_color
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        JOIN public.role_permissions rp ON ur.role_id = rp.role_id
        JOIN public.tabs t ON rp.tab_id = t.id
        JOIN public.modules m ON t.module_id = m.id
        JOIN public.actions a ON rp.action_id = a.id
        WHERE ur.user_id = p_user_id
            AND ur.company_id = p_company_id
            AND m.is_active = true
            AND t.is_active = true
            AND r.is_active = true
            -- F3: pestañas de módulos apagados en la instancia o en la empresa (una evaluación por llamada).
            AND t.id NOT IN (SELECT public.app_disabled_tab_ids(p_company_id))
    ),
    user_custom_permissions AS (
        -- Get custom permissions (overrides)
        SELECT
            m.id as module_id,
            m.slug as module_slug,
            m.name as module_name,
            t.id as tab_id,
            t.slug as tab_slug,
            t.name as tab_name,
            a.id as action_id,
            a.slug as action_slug,
            a.name as action_name,
            'custom' as source,
            up.is_granted,
            NULL::bigint as role_id,
            NULL::text as role_name,
            NULL::text as role_color
        FROM public.user_permissions up
        JOIN public.tabs t ON up.tab_id = t.id
        JOIN public.modules m ON t.module_id = m.id
        JOIN public.actions a ON up.action_id = a.id
        WHERE up.user_id = p_user_id
            AND up.company_id = p_company_id
            AND m.is_active = true
            AND t.is_active = true
            AND t.id NOT IN (SELECT public.app_disabled_tab_ids(p_company_id))
    )
    -- Combine both, with custom permissions taking precedence
    SELECT DISTINCT ON (
        COALESCE(ucp.module_id, urp.module_id), 
        COALESCE(ucp.tab_id, urp.tab_id), 
        COALESCE(ucp.action_id, urp.action_id)
    )
        COALESCE(ucp.module_id, urp.module_id),
        COALESCE(ucp.module_slug, urp.module_slug),
        COALESCE(ucp.module_name, urp.module_name),
        COALESCE(ucp.tab_id, urp.tab_id),
        COALESCE(ucp.tab_slug, urp.tab_slug),
        COALESCE(ucp.tab_name, urp.tab_name),
        COALESCE(ucp.action_id, urp.action_id),
        COALESCE(ucp.action_slug, urp.action_slug),
        COALESCE(ucp.action_name, urp.action_name),
        COALESCE(ucp.source, urp.source),
        COALESCE(ucp.is_granted, urp.is_granted),
        COALESCE(ucp.role_id, urp.role_id),
        COALESCE(ucp.role_name, urp.role_name),
        COALESCE(ucp.role_color, urp.role_color)
    FROM user_role_permissions urp
    FULL OUTER JOIN user_custom_permissions ucp 
        ON urp.tab_id = ucp.tab_id AND urp.action_id = ucp.action_id
    WHERE COALESCE(ucp.is_granted, urp.is_granted) = true
    ORDER BY 
        COALESCE(ucp.module_id, urp.module_id), 
        COALESCE(ucp.tab_id, urp.tab_id), 
        COALESCE(ucp.action_id, urp.action_id), 
        ucp.source NULLS LAST;
END;
$function$;

-- function user_has_permission (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
-- Task 13a: suma `p_company_id` (los roles pasaron a ser por empresa).
CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_company_id uuid, p_module_slug text, p_tab_slug text, p_action_slug text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_has_permission boolean;
BEGIN
    -- Check if user has the permission (from role or custom)
    SELECT EXISTS (
        SELECT 1
        FROM public.get_user_permissions(p_user_id, p_company_id) up
        WHERE up.module_slug = p_module_slug
            AND up.tab_slug = p_tab_slug
            AND up.action_slug = p_action_slug
            AND up.is_granted = true
    ) INTO v_has_permission;
    
    RETURN v_has_permission;
END;
$function$;

-- function resolve_notification_recipients (#786)
-- Destinatarios de un aviso en UNA consulta: miembros activos de la empresa con algún rol activo que
-- tenga el evento, con los canales combinados de todos sus roles, y que además tengan alguno de los
-- permisos mínimos del evento (`p_permissions` = [{module, tab, action}]). El permiso se resuelve con
-- `user_has_permission`, la fórmula canónica, así respeta también los ajustes personales.
-- `p_only_user_ids` acota a personas puntuales (avisos para quien pidió o creó un documento).
CREATE OR REPLACE FUNCTION public.resolve_notification_recipients(
  p_company_id uuid,
  p_event_key text,
  p_permissions jsonb,
  p_only_user_ids uuid[] DEFAULT NULL
)
 RETURNS TABLE(user_id uuid, email text, in_app boolean, email_enabled boolean)
 LANGUAGE sql
 STABLE
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
  SELECT c.user_id, c.email, c.in_app, c.email_enabled
  FROM (
    SELECT p.credential_id AS user_id,
           NULLIF(btrim(p.email), '') AS email,
           bool_or(rn.channel = 'in_app') AS in_app,
           bool_or(rn.channel = 'email') AS email_enabled
    FROM public.share_company_users scu
    JOIN public.profile p ON p.id = scu.profile_id AND p.credential_id IS NOT NULL
    JOIN public.user_roles ur ON ur.user_id = p.credential_id AND ur.company_id = p_company_id
    JOIN public.roles r ON r.id = ur.role_id AND COALESCE(r.is_active, true)
    JOIN public.role_notifications rn ON rn.role_id = r.id AND rn.event_key = p_event_key
    WHERE scu.company_id = p_company_id
      AND scu.is_active
      AND (p_only_user_ids IS NULL OR p.credential_id = ANY(p_only_user_ids))
    GROUP BY p.credential_id, p.email
  ) c
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_permissions) perm
    WHERE public.user_has_permission(c.user_id, p_company_id, perm->>'module', perm->>'tab', perm->>'action')
  );
$function$;

-- ============================================================================
-- TRIGGERS (0)
-- ============================================================================

-- El único trigger del dominio era `assign_owner_role_trigger ON company`, eliminado en la
-- Task 13a de P2 junto con su función (ver la nota en la sección FUNCTIONS).
