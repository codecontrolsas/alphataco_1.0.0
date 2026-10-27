-- HSE, documentos (ticket 804, fase 2): módulo HSE con documentos versionados, destinatarios y aceptaciones del portal.
-- 1. Tablas (DDL de `prisma migrate diff`, solo lo de HSE) + CHECK de coherencia de destinatarios.
-- 2. Helper `app_enable_read_gate` (mismo texto que prisma/sql/tenant.sql): lectura acotada del contenido.
-- 3. Lógica de prisma/sql/hse.sql: compuertas de lectura del empleado, guarda de aceptaciones y conciliación.
-- 4. RLS: empresa en todas; contenido con compuerta (el empleado ve solo lo publicado que le aplica); destinatarios solo
--    con permiso; aceptaciones con la capa por empleado (`self_write`: responde SU fila). Escrituras con permiso.
-- 5. Permisos: módulo `hse` con sus pestañas, solo para los 3 roles de acceso completo. Tolerante a una base sin seed:
--    el módulo y las pestañas no dependen de nada; si todavía no hay roles, no se asigna nada (el seed lo hace).

-- ── 1. Tablas ────────────────────────────────────────────────────────────────────────────────

CREATE TYPE "hse_document_status" AS ENUM ('draft', 'published', 'archived');


CREATE TYPE "hse_target_kind" AS ENUM ('all', 'position', 'sector', 'employee');


CREATE TYPE "hse_ack_status" AS ENUM ('pending', 'accepted', 'rejected');


CREATE TYPE "hse_ack_archive_reason" AS ENUM ('superseded', 'no_longer_applies');

-- CreateTable
CREATE TABLE "hse_document_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "type_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "hse_document_status" NOT NULL DEFAULT 'draft',
    "current_version_id" UUID,
    "created_by" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "change_log" TEXT,
    "expires_at" DATE,
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_document_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "document_id" UUID NOT NULL,
    "kind" "hse_target_kind" NOT NULL,
    "position_id" UUID,
    "sector_id" UUID,
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_document_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_document_acknowledgements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "document_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" "hse_ack_status" NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "signer_name" TEXT,
    "signer_position" TEXT,
    "signer_file" TEXT,
    "file_sha256" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "archive_reason" "hse_ack_archive_reason",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_document_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hse_document_types_company_id" ON "hse_document_types"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_document_types_company_name_key" ON "hse_document_types"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hse_documents_current_version_key" ON "hse_documents"("current_version_id");

-- CreateIndex
CREATE INDEX "idx_hse_documents_company_status" ON "hse_documents"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hse_document_versions_file_path_key" ON "hse_document_versions"("file_path");

-- CreateIndex
CREATE INDEX "idx_hse_document_versions_company_id" ON "hse_document_versions"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_document_versions_document_version_key" ON "hse_document_versions"("document_id", "version");

-- CreateIndex
CREATE INDEX "idx_hse_document_targets_document" ON "hse_document_targets"("document_id");

-- CreateIndex
CREATE INDEX "idx_hse_document_targets_company_id" ON "hse_document_targets"("company_id");

-- CreateIndex
CREATE INDEX "idx_hse_document_acknowledgements_employee" ON "hse_document_acknowledgements"("employee_id", "archived_at");

-- CreateIndex
CREATE INDEX "idx_hse_document_acknowledgements_document" ON "hse_document_acknowledgements"("document_id", "archived_at");

-- CreateIndex
CREATE INDEX "idx_hse_document_acknowledgements_company_id" ON "hse_document_acknowledgements"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_document_acknowledgements_version_employee_key" ON "hse_document_acknowledgements"("version_id", "employee_id");

-- AddForeignKey
ALTER TABLE "hse_documents" ADD CONSTRAINT "hse_documents_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "hse_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_documents" ADD CONSTRAINT "hse_documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "hse_document_versions"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_document_versions" ADD CONSTRAINT "hse_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hse_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_document_targets" ADD CONSTRAINT "hse_document_targets_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hse_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_document_targets" ADD CONSTRAINT "hse_document_targets_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "company_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_document_targets" ADD CONSTRAINT "hse_document_targets_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "hierarchy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_document_targets" ADD CONSTRAINT "hse_document_targets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_document_acknowledgements" ADD CONSTRAINT "hse_document_acknowledgements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hse_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_document_acknowledgements" ADD CONSTRAINT "hse_document_acknowledgements_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "hse_document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_document_acknowledgements" ADD CONSTRAINT "hse_document_acknowledgements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hse_document_targets" ADD CONSTRAINT "hse_document_targets_kind_check" CHECK (
  (kind = 'all' AND position_id IS NULL AND sector_id IS NULL AND employee_id IS NULL)
  OR (kind = 'position' AND position_id IS NOT NULL AND sector_id IS NULL AND employee_id IS NULL)
  OR (kind = 'sector' AND sector_id IS NOT NULL AND position_id IS NULL AND employee_id IS NULL)
  OR (kind = 'employee' AND employee_id IS NOT NULL AND position_id IS NULL AND sector_id IS NULL)
);
ALTER TABLE "hse_document_acknowledgements" ADD CONSTRAINT "hse_document_acknowledgements_response_check" CHECK (
  (status = 'pending' AND responded_at IS NULL)
  OR (status <> 'pending' AND responded_at IS NOT NULL)
);

-- ── 2. Helper de lectura acotada (prisma/sql/tenant.sql) ────────────────────────────────────
-- function app_enable_read_gate: LECTURA acotada (RESTRICTIVA, se suma con AND a `tenant_isolation`) para tablas de
-- CONTENIDO que el empleado del portal lee solo en parte (documentos HSE: lo publicado que le aplica, nunca borradores).
-- Una fila se lee si el usuario tiene el permiso de lectura del dashboard ('modulo:tab:accion') o si la funcion de
-- compuerta (`p_gate`, `SECURITY DEFINER`, recibe `p_column`) dice que si. Sin compuerta, leer exige el permiso.
-- Falla cerrada: sin permiso y sin compuerta que lo habilite no hay filas, aunque una action se olvide de filtrar.
-- Las escrituras NO se tocan: van con `app_require_any_permission_for_writes`.
CREATE OR REPLACE FUNCTION public.app_enable_read_gate(
  p_table regclass,
  p_read_perm text,
  p_gate regprocedure DEFAULT NULL,
  p_column text DEFAULT 'id'
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_read text := format('(SELECT public.app_has_permission(%L, %L, %L))',
    split_part(p_read_perm, ':', 1), split_part(p_read_perm, ':', 2), split_part(p_read_perm, ':', 3));
  v_check text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE format('%I.%I', schemaname, tablename)::regclass = p_table AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'La tabla % no tiene tenant_isolation: llamar antes a app_enable_tenant_isolation', p_table;
  END IF;
  IF p_gate IS NULL THEN
    v_check := format('(%s)', v_read);
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a WHERE a.attrelid = p_table AND a.attname = p_column AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'La tabla % no tiene columna %', p_table, p_column;
    END IF;
    v_check := format('(%s OR %s(%I))', v_read, p_gate::oid::regproc, p_column);
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS read_gate_select ON %s', p_table);
  EXECUTE format('CREATE POLICY read_gate_select ON %s AS RESTRICTIVE FOR SELECT USING %s', p_table, v_check);
END
$function$;

-- ── 3. Lógica HSE (prisma/sql/hse.sql) ──────────────────────────────────────────────────────
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

-- ── 4. RLS ───────────────────────────────────────────────────────────────────────────────────
SELECT public.app_enable_tenant_isolation('public.hse_document_types');
SELECT public.app_enable_tenant_isolation('public.hse_documents');
SELECT public.app_enable_tenant_isolation('public.hse_document_versions');
SELECT public.app_enable_tenant_isolation('public.hse_document_targets');
SELECT public.app_enable_tenant_isolation('public.hse_document_acknowledgements');

-- Tipos: los lee toda la empresa (el portal muestra el tipo); escribir es de la configuración de HSE.
SELECT public.app_require_any_permission_for_writes('public.hse_document_types',
  ARRAY['hse:configuracion-hse:create', 'hse:configuracion-hse:update', 'hse:configuracion-hse:delete']);

-- Documentos y versiones: con permiso, o lo publicado que le aplica al empleado de la transacción.
SELECT public.app_enable_read_gate('public.hse_documents', 'hse:documentos-hse:view',
  'public.hse_employee_can_read_document(uuid)'::regprocedure);
SELECT public.app_enable_read_gate('public.hse_document_versions', 'hse:documentos-hse:view',
  'public.hse_employee_can_read_version(uuid)'::regprocedure);
-- Destinatarios: solo con permiso (el empleado no necesita saber a quién más le aplica).
SELECT public.app_enable_read_gate('public.hse_document_targets', 'hse:documentos-hse:view');
SELECT public.app_require_any_permission_for_writes('public.hse_documents',
  ARRAY['hse:documentos-hse:create', 'hse:documentos-hse:update', 'hse:documentos-hse:delete', 'hse:documentos-hse:approve']);
SELECT public.app_require_any_permission_for_writes('public.hse_document_versions',
  ARRAY['hse:documentos-hse:create', 'hse:documentos-hse:update', 'hse:documentos-hse:approve']);
SELECT public.app_require_any_permission_for_writes('public.hse_document_targets',
  ARRAY['hse:documentos-hse:create', 'hse:documentos-hse:update', 'hse:documentos-hse:approve']);

-- Aceptaciones: el empleado lee y responde SU fila; el dashboard lee con permiso de cumplimiento. Las crea y archiva
-- `hse_sync_acknowledgements` (SECURITY DEFINER); `hse_ack_guard` impide pisar respuestas.
SELECT public.app_enable_employee_self('public.hse_document_acknowledgements',
  'hse:cumplimiento:view', 'hse:documentos-hse:approve', 'employee_id', true);

-- ── 5. Permisos ──────────────────────────────────────────────────────────────────────────────
INSERT INTO modules (id, slug, name, price, description, order_index, is_active)
VALUES ('33d06789-45d5-443d-9aaa-4bd1fd6777ff', 'hse', 'HSE', 0, 'Higiene, seguridad y ambiente', 0, true)
ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name;

INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
VALUES
  ('81aed398-6ca8-47ce-93a2-57fae115c921', '33d06789-45d5-443d-9aaa-4bd1fd6777ff', 'documentos-hse',
   'Documentos HSE', 'Normas y procedimientos: alta, versiones, destinatarios y publicación', 0, NULL),
  ('933d0164-aca5-4ece-83f8-789ee008bf8b', '33d06789-45d5-443d-9aaa-4bd1fd6777ff', 'cumplimiento',
   'Cumplimiento', 'Quién aceptó, quién tiene pendiente y quién rechazó cada documento', 1, NULL),
  ('5120f8e0-e97d-4ce1-be3f-e86b85dd7199', '33d06789-45d5-443d-9aaa-4bd1fd6777ff', 'configuracion-hse',
   'Configuración', 'Tipos de documento HSE', 2, NULL)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, t.tab_id, a.id
FROM roles r
CROSS JOIN (VALUES
  ('81aed398-6ca8-47ce-93a2-57fae115c921'::uuid, ARRAY['view', 'create', 'update', 'delete', 'approve']),
  ('933d0164-aca5-4ece-83f8-789ee008bf8b'::uuid, ARRAY['view']),
  ('5120f8e0-e97d-4ce1-be3f-e86b85dd7199'::uuid, ARRAY['view', 'create', 'update', 'delete'])
) AS t(tab_id, action_slugs)
JOIN actions a ON a.slug = ANY(t.action_slugs)
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
