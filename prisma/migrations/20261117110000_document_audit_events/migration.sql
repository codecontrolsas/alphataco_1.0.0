-- Auditoria de documentos de personal y equipos (ticket 842): cada carga, reemplazo, aprobacion, rechazo o baja con
-- su autor (usuario, sistema, carga externa o IA), fecha y detalle. Las cargas con IA y por link externo escriben aca
-- sus propios eventos (ai_validated, ai_pending, external_upload).
CREATE TABLE public.document_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.app_current_company_id(),
  resource_kind text NOT NULL CHECK (resource_kind IN ('Persona', 'Equipos')),
  -- Sin FK: el historial sobrevive al documento, al recurso y al tipo.
  document_id uuid,
  resource_id uuid,
  document_type_id uuid,
  event text NOT NULL,
  actor_id uuid,
  actor_kind text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_audit_events_company_created ON public.document_audit_events (company_id, created_at DESC);
CREATE INDEX idx_document_audit_events_document ON public.document_audit_events (document_id);
SELECT public.app_enable_tenant_isolation('public.document_audit_events');
-- Con Documentación apagada para la empresa, la tabla no se ve (compuerta de módulo, prisma/sql/modules.sql).
SELECT public.app_enable_module_gate('public.document_audit_events', ARRAY['documentacion']::text[]);

-- function document_audit_capture: auditoria de documentos de personal y equipos (ticket 842). Un trigger POR SENTENCIA
-- por evento (INSERT / UPDATE / DELETE) con tablas de transicion: una carga masiva escribe todas sus filas de auditoria
-- en un solo INSERT. Escribe SOLO en document_audit_events, que no tiene triggers: no hay cascadas.
-- Eventos: uploaded (se cargo el archivo), replaced (se cambio el archivo), approved, rejected (con el motivo), deleted.
-- Autor: el usuario de la transaccion (app.user_id) y su tipo (app.actor_kind); sin usuario, 'system'.
-- SECURITY DEFINER: la fila de auditoria se escribe aunque el contexto de la transaccion no tenga empresa (jobs,
-- scripts); la empresa sale del documento.
CREATE OR REPLACE FUNCTION public.document_audit_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_kind text := CASE WHEN TG_TABLE_NAME = 'documents_employees' THEN 'Persona' ELSE 'Equipos' END;
  v_actor uuid := public.app_current_user_id();
  v_actor_kind text := COALESCE(public.app_current_actor_kind(), CASE WHEN public.app_current_user_id() IS NULL THEN 'system' ELSE 'user' END);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO document_audit_events (company_id, resource_kind, document_id, resource_id, document_type_id, event, actor_id, actor_kind)
    SELECT n.company_id, v_kind, n.id, n.applies, n.id_document_types, 'uploaded', v_actor, v_actor_kind
    FROM new_rows n
    WHERE n.document_path IS NOT NULL AND n.document_path <> '';
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO document_audit_events (company_id, resource_kind, document_id, resource_id, document_type_id, event, actor_id, actor_kind, detail)
    SELECT n.company_id, v_kind, n.id, n.applies, n.id_document_types, e.event, v_actor, v_actor_kind, e.detail
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    CROSS JOIN LATERAL (
      SELECT 'uploaded'::text AS event, NULL::text AS detail
      WHERE COALESCE(o.document_path, '') = '' AND COALESCE(n.document_path, '') <> ''
      UNION ALL
      SELECT 'replaced', NULL
      WHERE COALESCE(o.document_path, '') <> '' AND COALESCE(n.document_path, '') <> ''
        AND o.document_path IS DISTINCT FROM n.document_path
      UNION ALL
      SELECT 'approved', NULL
      WHERE n.state::text = 'aprobado' AND o.state IS DISTINCT FROM n.state
      UNION ALL
      SELECT 'rejected', n.deny_reason
      WHERE n.state::text = 'rechazado' AND o.state IS DISTINCT FROM n.state
    ) e;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO document_audit_events (company_id, resource_kind, document_id, resource_id, document_type_id, event, actor_id, actor_kind)
    SELECT o.company_id, v_kind, o.id, o.applies, o.id_document_types, 'deleted', v_actor, v_actor_kind
    FROM old_rows o
    WHERE o.document_path IS NOT NULL AND o.document_path <> '';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS document_audit_insert ON public.documents_employees;
CREATE TRIGGER document_audit_insert AFTER INSERT ON public.documents_employees
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.document_audit_capture();
DROP TRIGGER IF EXISTS document_audit_update ON public.documents_employees;
CREATE TRIGGER document_audit_update AFTER UPDATE ON public.documents_employees
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.document_audit_capture();
DROP TRIGGER IF EXISTS document_audit_delete ON public.documents_employees;
CREATE TRIGGER document_audit_delete AFTER DELETE ON public.documents_employees
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.document_audit_capture();

DROP TRIGGER IF EXISTS document_audit_insert ON public.documents_equipment;
CREATE TRIGGER document_audit_insert AFTER INSERT ON public.documents_equipment
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.document_audit_capture();
DROP TRIGGER IF EXISTS document_audit_update ON public.documents_equipment;
CREATE TRIGGER document_audit_update AFTER UPDATE ON public.documents_equipment
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.document_audit_capture();
DROP TRIGGER IF EXISTS document_audit_delete ON public.documents_equipment;
CREATE TRIGGER document_audit_delete AFTER DELETE ON public.documents_equipment
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.document_audit_capture();
