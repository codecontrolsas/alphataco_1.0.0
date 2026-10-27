-- HSE: documentos (ticket 804, fase 2). Ver docs/arquitectura/BLUEPRINT-PORTAL-EMPLEADOS-Y-HSE.md §3.5.
-- Lo que la base garantiza aunque una action se equivoque:
--   * el empleado del portal lee solo lo PUBLICADO que le aplica (compuertas `hse_employee_can_read_*`);
--   * una respuesta registrada (aceptado/rechazado) no se pisa, y el empleado no crea ni borra aceptaciones
--     (`hse_ack_guard`);
--   * quién tiene que aceptar qué sale de UNA sola regla (`hse_sync_acknowledgements`), que usan la publicación, el
--     cambio de destinatarios y las altas, cambios de puesto/sector y bajas de empleados.

-- function hse_employee_can_read_document: compuerta de lectura de `hse_documents` para el empleado del portal.
-- SECURITY DEFINER: lee las aceptaciones y el documento sin pasar por su propia RLS (evita la recursion).
CREATE OR REPLACE FUNCTION public.hse_employee_can_read_document(p_document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT public.app_current_employee_id() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hse_document_acknowledgements a
    JOIN public.hse_documents d ON d.id = a.document_id
    WHERE a.document_id = p_document_id
      AND a.employee_id = public.app_current_employee_id()
      AND a.company_id = public.app_current_company_id()
      AND a.archived_at IS NULL
      AND d.status = 'published'
  )
$function$;

-- function hse_employee_can_read_version: compuerta de `hse_document_versions`: solo la versión VIGENTE de un documento
-- publicado que le aplica (no los borradores ni las versiones anteriores).
CREATE OR REPLACE FUNCTION public.hse_employee_can_read_version(p_version_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT public.app_current_employee_id() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hse_document_acknowledgements a
    JOIN public.hse_documents d ON d.id = a.document_id AND d.current_version_id = a.version_id
    WHERE a.version_id = p_version_id
      AND a.employee_id = public.app_current_employee_id()
      AND a.company_id = public.app_current_company_id()
      AND a.archived_at IS NULL
      AND d.status = 'published'
  )
$function$;

-- function hse_ack_guard: integridad de las aceptaciones.
--   * documento, versión, empleado y empresa no cambian;
--   * una respuesta registrada no se pisa (solo se puede archivar o desarchivar);
--   * el empleado (actor `employee`) solo responde SU fila pendiente y vigente: no crea, no borra, no archiva.
CREATE OR REPLACE FUNCTION public.hse_ack_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.document_id <> OLD.document_id
       OR NEW.version_id <> OLD.version_id OR NEW.employee_id <> OLD.employee_id THEN
      RAISE EXCEPTION 'La aceptación no puede cambiar de documento, versión ni empleado';
    END IF;
    IF OLD.status <> 'pending' AND (
      NEW.status, NEW.responded_at, NEW.reject_reason, NEW.signer_name, NEW.signer_position, NEW.signer_file,
      NEW.file_sha256, NEW.ip, NEW.user_agent
    ) IS DISTINCT FROM (
      OLD.status, OLD.responded_at, OLD.reject_reason, OLD.signer_name, OLD.signer_position, OLD.signer_file,
      OLD.file_sha256, OLD.ip, OLD.user_agent
    ) THEN
      RAISE EXCEPTION 'La respuesta ya registrada no se modifica';
    END IF;
    IF public.app_current_actor_kind() = 'employee' AND (
      OLD.archived_at IS NOT NULL
      OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
      OR NEW.archive_reason IS DISTINCT FROM OLD.archive_reason
    ) THEN
      RAISE EXCEPTION 'Este documento ya no está vigente para vos';
    END IF;
    RETURN NEW;
  END IF;

  IF public.app_current_actor_kind() = 'employee' THEN
    RAISE EXCEPTION 'El empleado no crea ni borra aceptaciones';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;

DROP TRIGGER IF EXISTS hse_ack_guard ON public.hse_document_acknowledgements;
CREATE TRIGGER hse_ack_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.hse_document_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.hse_ack_guard();

-- function hse_sync_acknowledgements: concilia las aceptaciones con la realidad, dentro de una empresa.
-- Alcance: un documento (`p_document_id`), un empleado (`p_employee_id`), ambos, o toda la empresa (los dos NULL).
-- Regla única de "a quién aplica": documento PUBLICADO con versión vigente, empleado ACTIVO de la empresa y algún
-- destinatario que coincida (todos, su puesto `company_position`, su sector `hierarchical_position` o él mismo).
--   1. Lo que aplica y falta se crea pendiente; lo que aplica y estaba archivado se desarchiva (vuelve a su estado).
--   2. Lo que dejó de aplicar se ARCHIVA (nunca se borra): `superseded` si salió otra versión, `no_longer_applies` si
--      cambió el puesto/sector, los destinatarios o el empleado se dio de baja. Las respuestas quedan como historia.
-- Los documentos archivados no se tocan (su estado ya los saca del portal).
-- Idempotente. SECURITY DEFINER: la llaman también las acciones de Empleados, cuyo usuario puede no tener permisos de
-- HSE; por eso controla ella misma que la empresa sea la del contexto.
CREATE OR REPLACE FUNCTION public.hse_sync_acknowledgements(
  p_company_id uuid,
  p_document_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'hse_sync_acknowledgements: falta la empresa';
  END IF;
  IF public.app_current_company_id() IS NOT NULL AND p_company_id <> public.app_current_company_id() THEN
    RAISE EXCEPTION 'hse_sync_acknowledgements: la empresa no es la del contexto';
  END IF;

  -- 1. Crear o desarchivar lo que aplica.
  INSERT INTO public.hse_document_acknowledgements (company_id, document_id, version_id, employee_id)
  SELECT DISTINCT d.company_id, d.id, d.current_version_id, e.id
  FROM public.hse_documents d
  JOIN public.hse_document_targets t ON t.document_id = d.id
  JOIN public.employees e
    ON e.company_id = d.company_id
   AND coalesce(e.is_active, true)
   AND (
        t.kind = 'all'
     OR (t.kind = 'position' AND e.company_position = t.position_id)
     OR (t.kind = 'sector' AND e.hierarchical_position = t.sector_id)
     OR (t.kind = 'employee' AND e.id = t.employee_id)
   )
  WHERE d.company_id = p_company_id
    AND d.status = 'published'
    AND d.current_version_id IS NOT NULL
    AND (p_document_id IS NULL OR d.id = p_document_id)
    AND (p_employee_id IS NULL OR e.id = p_employee_id)
  ON CONFLICT (version_id, employee_id) DO UPDATE
    SET archived_at = NULL, archive_reason = NULL, updated_at = now()
    WHERE public.hse_document_acknowledgements.archived_at IS NOT NULL;

  -- 2. Archivar lo que dejó de aplicar.
  UPDATE public.hse_document_acknowledgements a
  SET archived_at = now(),
      archive_reason = CASE WHEN a.version_id IS DISTINCT FROM d.current_version_id
                            THEN 'superseded'::public.hse_ack_archive_reason
                            ELSE 'no_longer_applies'::public.hse_ack_archive_reason END,
      updated_at = now()
  FROM public.hse_documents d
  WHERE d.id = a.document_id
    AND a.company_id = p_company_id
    AND a.archived_at IS NULL
    AND d.status = 'published'
    AND (p_document_id IS NULL OR a.document_id = p_document_id)
    AND (p_employee_id IS NULL OR a.employee_id = p_employee_id)
    AND (
      a.version_id IS DISTINCT FROM d.current_version_id
      OR NOT EXISTS (
        SELECT 1
        FROM public.hse_document_targets t
        JOIN public.employees e
          ON e.id = a.employee_id
         AND e.company_id = d.company_id
         AND coalesce(e.is_active, true)
        WHERE t.document_id = d.id
          AND (
               t.kind = 'all'
            OR (t.kind = 'position' AND e.company_position = t.position_id)
            OR (t.kind = 'sector' AND e.hierarchical_position = t.sector_id)
            OR (t.kind = 'employee' AND e.id = t.employee_id)
          )
      )
    );
END
$function$;
