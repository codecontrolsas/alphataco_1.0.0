-- HSE, acta de capacitación, constancia firmada, legajo y avisos de vencimiento (ticket 804, fase 4).
-- 1. Tablas (DDL de `prisma migrate diff`, solo lo de esta fase) + CHECK de coherencia e índice de una constancia
--    vigente por intento.
-- 2. Lógica de prisma/sql/hse.sql: firma de la constancia, PDF y registro en el legajo, anulación, cierre y anulación
--    del acta, y triggers guarda (inmutabilidad).
-- 3. RLS: empresa en todas; actas solo con permiso (el empleado NO las lee: listan a sus compañeros); constancias y
--    avisos con la capa por empleado (las suyas) SIN escritura propia (escriben solo las funciones y el job).
-- 4. Permisos: pestaña `actas` del módulo `hse` para los 3 roles de acceso completo, y el aviso semanal de HSE para
--    esos roles (campanita). Tolerante a una base sin seed: sin el módulo no se crea la pestaña; sin roles no se asigna
--    nada (el seed lo hace).

-- ── 1. Tablas ────────────────────────────────────────────────────────────────────────────────
-- CreateEnum
CREATE TYPE "hse_record_status" AS ENUM ('draft', 'closed', 'voided');

-- CreateEnum
CREATE TYPE "hse_record_modality" AS ENUM ('in_person', 'virtual', 'mixed', 'online');

-- CreateEnum
CREATE TYPE "hse_instructor_kind" AS ENUM ('internal', 'external');

-- CreateEnum
CREATE TYPE "hse_notice_item" AS ENUM ('training', 'document');

-- CreateEnum
CREATE TYPE "hse_notice_window" AS ENUM ('upcoming', 'expired');

-- CreateTable
CREATE TABLE "hse_training_instructors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "kind" "hse_instructor_kind" NOT NULL,
    "employee_id" UUID,
    "full_name" TEXT NOT NULL,
    "license" TEXT,
    "role_title" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_training_instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "held_on" DATE NOT NULL,
    "modality" "hse_record_modality" NOT NULL DEFAULT 'in_person',
    "location" TEXT,
    "duration_minutes" INTEGER,
    "topics" TEXT NOT NULL,
    "observations" TEXT,
    "status" "hse_record_status" NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "content" JSONB,
    "content_sha256" TEXT,
    "pdf_path" TEXT,
    "pdf_sha256" TEXT,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_training_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_record_instructors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "record_id" UUID NOT NULL,
    "kind" "hse_instructor_kind" NOT NULL,
    "employee_id" UUID,
    "full_name" TEXT NOT NULL,
    "license" TEXT,
    "role_title" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hse_training_record_instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_record_attendees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "record_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_training_record_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "score_percent" DECIMAL(5,2) NOT NULL,
    "passed_at" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" DATE,
    "content" JSONB NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_position" TEXT,
    "signer_file" TEXT,
    "signer_company" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "signed_at" TIMESTAMPTZ(6) NOT NULL,
    "pdf_path" TEXT,
    "pdf_sha256" TEXT,
    "employee_document_id" UUID,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_training_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_document_types" (
    "training_id" UUID NOT NULL,
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "document_type_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_training_document_types_pkey" PRIMARY KEY ("training_id")
);

-- CreateTable
CREATE TABLE "hse_expiry_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "employee_id" UUID NOT NULL,
    "item_kind" "hse_notice_item" NOT NULL,
    "item_id" UUID NOT NULL,
    "item_title" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "window" "hse_notice_window" NOT NULL,
    "email_to" TEXT,
    "email_status" TEXT NOT NULL DEFAULT 'none',
    "emailed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hse_expiry_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hse_training_instructors_training" ON "hse_training_instructors"("training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_instructors_company_id" ON "hse_training_instructors"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_records_pdf_path_key" ON "hse_training_records"("pdf_path");

-- CreateIndex
CREATE INDEX "idx_hse_training_records_training" ON "hse_training_records"("training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_records_company_status" ON "hse_training_records"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_records_number_key" ON "hse_training_records"("company_id", "number");

-- CreateIndex
CREATE INDEX "idx_hse_training_record_instructors_record" ON "hse_training_record_instructors"("record_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_record_instructors_company_id" ON "hse_training_record_instructors"("company_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_record_attendees_employee" ON "hse_training_record_attendees"("employee_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_record_attendees_company_id" ON "hse_training_record_attendees"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_record_attendees_record_employee_key" ON "hse_training_record_attendees"("record_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_certificates_pdf_path_key" ON "hse_training_certificates"("pdf_path");

-- CreateIndex
CREATE INDEX "idx_hse_training_certificates_attempt" ON "hse_training_certificates"("attempt_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_certificates_employee" ON "hse_training_certificates"("employee_id", "training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_certificates_training" ON "hse_training_certificates"("training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_certificates_company_id" ON "hse_training_certificates"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_document_types_type_key" ON "hse_training_document_types"("document_type_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_document_types_company_id" ON "hse_training_document_types"("company_id");

-- CreateIndex
CREATE INDEX "idx_hse_expiry_notices_company_email" ON "hse_expiry_notices"("company_id", "email_status");

-- CreateIndex
CREATE INDEX "idx_hse_expiry_notices_employee" ON "hse_expiry_notices"("employee_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "hse_expiry_notices_key" ON "hse_expiry_notices"("employee_id", "item_kind", "item_id", "due_on", "window");

-- AddForeignKey
ALTER TABLE "hse_training_instructors" ADD CONSTRAINT "hse_training_instructors_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_instructors" ADD CONSTRAINT "hse_training_instructors_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_records" ADD CONSTRAINT "hse_training_records_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_record_instructors" ADD CONSTRAINT "hse_training_record_instructors_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "hse_training_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_record_instructors" ADD CONSTRAINT "hse_training_record_instructors_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_record_attendees" ADD CONSTRAINT "hse_training_record_attendees_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "hse_training_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_record_attendees" ADD CONSTRAINT "hse_training_record_attendees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_certificates" ADD CONSTRAINT "hse_training_certificates_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_certificates" ADD CONSTRAINT "hse_training_certificates_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_certificates" ADD CONSTRAINT "hse_training_certificates_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "hse_training_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_certificates" ADD CONSTRAINT "hse_training_certificates_employee_document_id_fkey" FOREIGN KEY ("employee_document_id") REFERENCES "documents_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_document_types" ADD CONSTRAINT "hse_training_document_types_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_document_types" ADD CONSTRAINT "hse_training_document_types_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_expiry_notices" ADD CONSTRAINT "hse_expiry_notices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hse_training_instructors" ADD CONSTRAINT "hse_training_instructors_kind_check" CHECK (
  length(btrim(full_name)) > 0
);
ALTER TABLE "hse_training_record_instructors" ADD CONSTRAINT "hse_training_record_instructors_kind_check" CHECK (
  length(btrim(full_name)) > 0
);
ALTER TABLE "hse_training_records" ADD CONSTRAINT "hse_training_records_state_check" CHECK (
  number > 0
  AND (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 6000)
  AND (status = 'draft' OR (closed_at IS NOT NULL AND content IS NOT NULL AND content_sha256 IS NOT NULL))
  AND (status <> 'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);
ALTER TABLE "hse_training_certificates" ADD CONSTRAINT "hse_training_certificates_state_check" CHECK (
  content_sha256 ~ '^[0-9a-f]{64}$'
  AND (pdf_path IS NULL OR pdf_sha256 ~ '^[0-9a-f]{64}$')
  AND (voided_at IS NULL OR void_reason IS NOT NULL)
);
ALTER TABLE "hse_expiry_notices" ADD CONSTRAINT "hse_expiry_notices_email_status_check" CHECK (
  email_status IN ('none', 'pending', 'sent', 'failed')
);
-- Una constancia VIGENTE por intento aprobado (anulada, el empleado puede volver a firmar).
CREATE UNIQUE INDEX "hse_training_certificates_one_active" ON "hse_training_certificates"("attempt_id")
  WHERE voided_at IS NULL;

-- ── 2. Lógica HSE (prisma/sql/hse.sql) ──────────────────────────────────────────────────────
-- ── Acta, constancia firmada y legajo (ticket 804, fase 4) ──────────────────────────────────
-- Reglas:
--   * la constancia la emite SOLO la firma del empleado (`hse_sign_certificate`): una por intento aprobado vigente, con
--     los datos del momento leídos de la base (nunca del navegador), IP y navegador del request y hora del servidor; el
--     contenido queda congelado en `content` y su huella es SHA-256 de `content::text` (jsonb es canónico);
--   * una constancia no se pisa ni se borra: el PDF se adjunta una sola vez y solo HSE la anula, con motivo;
--   * el acta se cierra con `hse_close_training_record`: congela datos, capacitadores y asistentes con su resultado y
--     firma al momento, con su huella; cerrada no cambia (salvo adjuntar el PDF una vez o anularla con motivo);
--   * la constancia firmada entra al legajo como documento `aprobado` de un tipo propio de la capacitación (no
--     obligatorio: no pide nada a nadie ni dispara alertas), con vencimiento = vigencia de la aprobación.
-- Las funciones que escriben prenden `app.hse_certifying` / `app.hse_closing`: los triggers guarda rechazan todo cambio
-- que no venga de ellas.

-- function hse_sign_certificate: el empleado del contexto firma la constancia de SU intento aprobado vigente.
-- Devuelve `{ ok, certificateId, alreadySigned }` o `{ ok: false, reason }`: not_found, not_passed, not_available
-- (capacitación no publicada o ya no le aplica), superseded (no es su aprobación vigente). Idempotente.
CREATE OR REPLACE FUNCTION public.hse_sign_certificate(p_attempt_id uuid, p_ip text, p_user_agent text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_employee uuid := public.app_current_employee_id();
  v_company uuid := public.app_current_company_id();
  v_attempt public.hse_training_attempts%ROWTYPE;
  v_assignment public.hse_training_assignments%ROWTYPE;
  v_training public.hse_trainings%ROWTYPE;
  v_existing uuid;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_emp record;
  v_record_id uuid;
  v_record jsonb;
  v_instructors jsonb;
  v_content jsonb;
BEGIN
  IF v_employee IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'hse_sign_certificate: falta el empleado del contexto';
  END IF;
  -- Mismo orden de bloqueo que el examen (asignación → intento): dos firmas simultáneas no duplican.
  PERFORM 1 FROM public.hse_training_assignments
  WHERE id = (SELECT x.assignment_id FROM public.hse_training_attempts x
              WHERE x.id = p_attempt_id AND x.employee_id = v_employee AND x.company_id = v_company)
  FOR UPDATE;
  SELECT * INTO v_attempt FROM public.hse_training_attempts
  WHERE id = p_attempt_id AND employee_id = v_employee AND company_id = v_company;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  SELECT id INTO v_existing FROM public.hse_training_certificates
  WHERE attempt_id = p_attempt_id AND voided_at IS NULL;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'certificateId', v_existing, 'alreadySigned', true);
  END IF;
  IF v_attempt.status = 'in_progress' OR v_attempt.passed IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_passed');
  END IF;
  SELECT * INTO v_assignment FROM public.hse_training_assignments WHERE id = v_attempt.assignment_id;
  SELECT * INTO v_training FROM public.hse_trainings WHERE id = v_attempt.training_id;
  IF v_assignment.archived_at IS NOT NULL OR v_training.status <> 'published' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_available');
  END IF;
  IF v_assignment.passed_attempt_id IS DISTINCT FROM v_attempt.id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'superseded');
  END IF;

  SELECT e.id, btrim(e.lastname || ' ' || e.firstname) AS full_name, e.file, e.cuil,
         cp.name AS position_name, h.name AS sector_name, c.company_name, c.company_cuit
  INTO v_emp
  FROM public.employees e
  JOIN public.company c ON c.id = e.company_id
  LEFT JOIN public.company_positions cp ON cp.id = e.company_position
  LEFT JOIN public.hierarchy h ON h.id = e.hierarchical_position
  WHERE e.id = v_employee AND e.company_id = v_company;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Acta cerrada más reciente de esta capacitación en la que figura presente: aporta dictado y capacitadores. Si no la
  -- hay, los capacitadores habituales de la capacitación.
  SELECT r.id, jsonb_build_object('id', r.id, 'number', r.number, 'heldOn', r.held_on, 'modality', r.modality,
                                  'location', r.location)
  INTO v_record_id, v_record
  FROM public.hse_training_records r
  JOIN public.hse_training_record_attendees a ON a.record_id = r.id AND a.employee_id = v_employee AND a.attended
  WHERE r.training_id = v_training.id AND r.status = 'closed'
  ORDER BY r.held_on DESC, r.number DESC
  LIMIT 1;
  IF v_record_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'fullName', i.full_name, 'license', i.license,
                                                 'roleTitle', i.role_title) ORDER BY i.position, i.full_name), '[]'::jsonb)
    INTO v_instructors FROM public.hse_training_record_instructors i WHERE i.record_id = v_record_id;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'fullName', i.full_name, 'license', i.license,
                                                 'roleTitle', i.role_title) ORDER BY i.position, i.full_name), '[]'::jsonb)
    INTO v_instructors FROM public.hse_training_instructors i WHERE i.training_id = v_training.id;
  END IF;

  v_content := jsonb_build_object(
    'schema', 'hse.training_certificate.v1',
    'certificateId', v_id,
    'company', jsonb_build_object('id', v_company, 'name', v_emp.company_name, 'cuit', v_emp.company_cuit),
    'employee', jsonb_build_object('id', v_employee, 'fullName', v_emp.full_name, 'file', v_emp.file,
                                   'cuil', v_emp.cuil, 'position', v_emp.position_name, 'sector', v_emp.sector_name),
    'training', jsonb_build_object('id', v_training.id, 'title', v_training.title, 'kind', v_training.kind,
                                   'passingScore', v_training.passing_score, 'validityMonths', v_training.validity_months),
    'result', jsonb_build_object('attemptId', v_attempt.id, 'attemptNumber', v_attempt.attempt_number,
                                 'scorePoints', v_attempt.score_points, 'maxPoints', v_attempt.max_points,
                                 'scorePercent', v_attempt.score_percent, 'passedAt', v_attempt.submitted_at,
                                 'validUntil', v_assignment.valid_until),
    'record', v_record,
    'instructors', v_instructors,
    'signature', jsonb_build_object('method', 'password', 'signedAt', v_now, 'ip', nullif(left(p_ip, 64), ''),
                                    'userAgent', nullif(left(p_user_agent, 512), ''))
  );

  PERFORM set_config('app.hse_certifying', 'on', true);
  INSERT INTO public.hse_training_certificates (
    id, company_id, training_id, employee_id, attempt_id, score_percent, passed_at, valid_until, content, content_sha256,
    signer_name, signer_position, signer_file, signer_company, ip, user_agent, signed_at
  ) VALUES (
    v_id, v_company, v_training.id, v_employee, v_attempt.id, v_attempt.score_percent, v_attempt.submitted_at,
    v_assignment.valid_until, v_content, encode(sha256(convert_to(v_content::text, 'UTF8')), 'hex'),
    v_emp.full_name, v_emp.position_name, v_emp.file, v_emp.company_name, nullif(left(p_ip, 64), ''),
    nullif(left(p_user_agent, 512), ''), v_now
  );
  PERFORM set_config('app.hse_certifying', 'off', true);

  RETURN jsonb_build_object('ok', true, 'certificateId', v_id, 'alreadySigned', false);
END
$function$;

-- function hse_attach_certificate_pdf: adjunta (UNA vez) el PDF generado en el servidor y, si la constancia está
-- vigente y todavía no entró al legajo, la registra como documento `aprobado` del empleado (`p_document_path`, en
-- `document-files`) con vencimiento = vigencia. La llama el dueño (empleado del contexto) o HSE con permiso de lectura.
-- Devuelve el PDF que quedó (puede ser el de otra llamada concurrente) y si el legajo quedó registrado.
CREATE OR REPLACE FUNCTION public.hse_attach_certificate_pdf(
  p_certificate_id uuid,
  p_pdf_path text,
  p_pdf_sha256 text,
  p_document_path text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_company uuid := public.app_current_company_id();
  v_cert public.hse_training_certificates%ROWTYPE;
  v_training public.hse_trainings%ROWTYPE;
  v_type uuid;
  v_doc uuid;
BEGIN
  SELECT * INTO v_cert FROM public.hse_training_certificates
  WHERE id = p_certificate_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hse_attach_certificate_pdf: la constancia no existe';
  END IF;
  IF public.app_current_employee_id() IS DISTINCT FROM v_cert.employee_id
     AND NOT public.app_has_permission('hse', 'capacitaciones', 'view')
     AND NOT public.app_has_permission('hse', 'actas', 'view') THEN
    RAISE EXCEPTION 'hse_attach_certificate_pdf: sin permiso';
  END IF;

  PERFORM set_config('app.hse_certifying', 'on', true);
  IF v_cert.pdf_path IS NULL AND p_pdf_path IS NOT NULL THEN
    IF p_pdf_sha256 !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'hse_attach_certificate_pdf: huella inválida';
    END IF;
    UPDATE public.hse_training_certificates SET pdf_path = p_pdf_path, pdf_sha256 = p_pdf_sha256
    WHERE id = v_cert.id
    RETURNING * INTO v_cert;
  END IF;

  IF v_cert.voided_at IS NULL AND v_cert.employee_document_id IS NULL AND p_document_path IS NOT NULL THEN
    SELECT * INTO v_training FROM public.hse_trainings WHERE id = v_cert.training_id;
    -- Un tipo de documento por capacitación (no obligatorio): el legajo muestra la constancia vigente de cada una.
    PERFORM pg_advisory_xact_lock(hashtext('hse_training_document_type:' || v_training.id::text));
    SELECT document_type_id INTO v_type FROM public.hse_training_document_types WHERE training_id = v_training.id;
    IF v_type IS NULL THEN
      INSERT INTO public.document_types (
        name, applies, multiresource, mandatory, explired, special, is_active, description, company_id, conditions
      ) VALUES (
        left('Constancia HSE: ' || v_training.title, 120), 'Persona', false, false, v_training.validity_months IS NOT NULL,
        false, true,
        'Constancia firmada de la capacitación HSE. La genera el módulo HSE al firmar el empleado; no se carga a mano.',
        v_cert.company_id, ARRAY[]::jsonb[]
      ) RETURNING id INTO v_type;
      INSERT INTO public.hse_training_document_types (training_id, company_id, document_type_id)
      VALUES (v_training.id, v_cert.company_id, v_type);
    END IF;

    INSERT INTO public.documents_employees (applies, id_document_types, validity, state, document_path, company_id)
    VALUES (
      v_cert.employee_id, v_type,
      CASE WHEN v_cert.valid_until IS NULL THEN NULL ELSE (v_cert.valid_until + time '12:00')::timestamptz END,
      'aprobado', p_document_path, v_cert.company_id
    ) RETURNING id INTO v_doc;
    UPDATE public.hse_training_certificates SET employee_document_id = v_doc WHERE id = v_cert.id
    RETURNING * INTO v_cert;
  END IF;
  PERFORM set_config('app.hse_certifying', 'off', true);

  RETURN jsonb_build_object('pdfPath', v_cert.pdf_path, 'pdfSha256', v_cert.pdf_sha256,
                            'employeeDocumentId', v_cert.employee_document_id,
                            'registered', v_doc IS NOT NULL);
END
$function$;

-- function hse_void_certificate: HSE anula una constancia (con motivo). No se borra: queda como historia, y su documento
-- del legajo se ARCHIVA ("Ya no aplica"). El empleado puede volver a firmar su aprobación vigente.
CREATE OR REPLACE FUNCTION public.hse_void_certificate(p_certificate_id uuid, p_reason text, p_voided_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_cert public.hse_training_certificates%ROWTYPE;
BEGIN
  IF NOT public.app_has_permission('hse', 'actas', 'delete') THEN
    RAISE EXCEPTION 'hse_void_certificate: sin permiso';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'hse_void_certificate: falta el motivo';
  END IF;
  SELECT * INTO v_cert FROM public.hse_training_certificates
  WHERE id = p_certificate_id AND company_id = public.app_current_company_id()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hse_void_certificate: la constancia no existe';
  END IF;
  IF v_cert.voided_at IS NOT NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('app.hse_certifying', 'on', true);
  UPDATE public.hse_training_certificates
  SET voided_at = now(), voided_by = p_voided_by, void_reason = btrim(p_reason)
  WHERE id = v_cert.id;
  PERFORM set_config('app.hse_certifying', 'off', true);
  IF v_cert.employee_document_id IS NOT NULL THEN
    UPDATE public.documents_employees SET archived_at = now()
    WHERE id = v_cert.employee_document_id AND archived_at IS NULL;
  END IF;
END
$function$;

-- function hse_certificate_guard: la constancia se crea solo firmando; su contenido y firma no cambian; el PDF se
-- adjunta una vez; la anulación es única y con motivo; un borrado desde la app (con actor) se rechaza.
CREATE OR REPLACE FUNCTION public.hse_certificate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_flag boolean := current_setting('app.hse_certifying', true) IS NOT DISTINCT FROM 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.app_current_actor_kind() IS NOT NULL THEN
      RAISE EXCEPTION 'Una constancia no se borra: se anula';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT v_flag OR NEW.voided_at IS NOT NULL OR NEW.pdf_path IS NOT NULL OR NEW.employee_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'Las constancias se emiten solo con la firma del empleado';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.company_id, NEW.training_id, NEW.employee_id, NEW.attempt_id, NEW.score_percent, NEW.passed_at,
      NEW.valid_until, NEW.content, NEW.content_sha256, NEW.signer_name, NEW.signer_position, NEW.signer_file,
      NEW.signer_company, NEW.ip, NEW.user_agent, NEW.signed_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.company_id, OLD.training_id, OLD.employee_id, OLD.attempt_id, OLD.score_percent, OLD.passed_at,
      OLD.valid_until, OLD.content, OLD.content_sha256, OLD.signer_name, OLD.signer_position, OLD.signer_file,
      OLD.signer_company, OLD.ip, OLD.user_agent, OLD.signed_at, OLD.created_at) THEN
    RAISE EXCEPTION 'La constancia firmada no se modifica';
  END IF;
  IF (NEW.pdf_path, NEW.pdf_sha256) IS DISTINCT FROM (OLD.pdf_path, OLD.pdf_sha256)
     AND (NOT v_flag OR OLD.pdf_path IS NOT NULL OR NEW.pdf_path IS NULL OR NEW.pdf_sha256 IS NULL) THEN
    RAISE EXCEPTION 'El PDF de la constancia se adjunta una sola vez';
  END IF;
  IF (NEW.voided_at, NEW.voided_by, NEW.void_reason) IS DISTINCT FROM (OLD.voided_at, OLD.voided_by, OLD.void_reason)
     AND (NOT v_flag OR OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL OR NEW.void_reason IS NULL) THEN
    RAISE EXCEPTION 'La anulación de la constancia es única y con motivo';
  END IF;
  -- La FK `ON DELETE SET NULL` (borran el documento del legajo) siempre pasa; vincularlo, solo la función.
  IF NEW.employee_document_id IS DISTINCT FROM OLD.employee_document_id AND NEW.employee_document_id IS NOT NULL
     AND (NOT v_flag OR OLD.employee_document_id IS NOT NULL) THEN
    RAISE EXCEPTION 'La constancia se registra en el legajo una sola vez';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS hse_certificate_guard ON public.hse_training_certificates;
CREATE TRIGGER hse_certificate_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.hse_training_certificates
  FOR EACH ROW EXECUTE FUNCTION public.hse_certificate_guard();

-- function hse_close_training_record: cierra el acta (permiso `hse:actas:approve`). Exige datos completos, al menos un
-- capacitador y un asistente presente. Congela en `content` los datos del acta, la capacitación, los capacitadores y
-- cada asistente con su resultado y su firma AL MOMENTO (las firmas posteriores no cambian el acta: se ven en el
-- detalle). Huella = SHA-256 de `content::text`. Devuelve `{ ok }` o `{ ok: false, reason }`.
CREATE OR REPLACE FUNCTION public.hse_close_training_record(p_record_id uuid, p_closed_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_company uuid := public.app_current_company_id();
  v_record public.hse_training_records%ROWTYPE;
  v_training public.hse_trainings%ROWTYPE;
  v_now timestamptz := now();
  v_instructors jsonb;
  v_attendees jsonb;
  v_present integer;
  v_closer text;
  v_company_row record;
  v_content jsonb;
BEGIN
  IF NOT public.app_has_permission('hse', 'actas', 'approve') THEN
    RAISE EXCEPTION 'hse_close_training_record: sin permiso';
  END IF;
  SELECT * INTO v_record FROM public.hse_training_records
  WHERE id = p_record_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_record.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_draft');
  END IF;
  SELECT * INTO v_training FROM public.hse_trainings WHERE id = v_record.training_id;
  IF v_training.status = 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'training_draft');
  END IF;
  IF length(btrim(v_record.topics)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_topics');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'employeeId', i.employee_id, 'fullName', i.full_name,
                                               'license', i.license, 'roleTitle', i.role_title)
                            ORDER BY i.position, i.full_name), '[]'::jsonb)
  INTO v_instructors FROM public.hse_training_record_instructors i WHERE i.record_id = v_record.id;
  IF jsonb_array_length(v_instructors) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_instructors');
  END IF;

  SELECT count(*) FILTER (WHERE a.attended),
         coalesce(jsonb_agg(jsonb_build_object(
           'employeeId', e.id,
           'fullName', btrim(e.lastname || ' ' || e.firstname),
           'file', e.file,
           'cuil', e.cuil,
           'position', cp.name,
           'attended', a.attended,
           'result', CASE WHEN asg.id IS NULL THEN jsonb_build_object('status', 'not_assigned') ELSE jsonb_build_object(
             'status', CASE WHEN asg.status = 'passed' AND asg.valid_until IS NOT NULL AND asg.valid_until < current_date
                            THEN 'expired' ELSE asg.status::text END,
             'scorePercent', asg.last_score_percent,
             'attempts', asg.attempts_total,
             'passedAt', asg.passed_at,
             'validUntil', asg.valid_until) END,
           'certificate', (SELECT jsonb_build_object('id', c.id, 'signedAt', c.signed_at, 'sha256', c.content_sha256)
                           FROM public.hse_training_certificates c
                           WHERE c.attempt_id = asg.passed_attempt_id AND c.voided_at IS NULL)
         ) ORDER BY e.lastname, e.firstname, e.id), '[]'::jsonb)
  INTO v_present, v_attendees
  FROM public.hse_training_record_attendees a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.company_positions cp ON cp.id = e.company_position
  LEFT JOIN public.hse_training_assignments asg ON asg.training_id = v_record.training_id AND asg.employee_id = e.id
  WHERE a.record_id = v_record.id;
  IF coalesce(v_present, 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_attendees');
  END IF;

  SELECT fullname INTO v_closer FROM public.profile WHERE id = p_closed_by;
  SELECT company_name, company_cuit INTO v_company_row FROM public.company WHERE id = v_record.company_id;

  v_content := jsonb_build_object(
    'schema', 'hse.training_record.v1',
    'recordId', v_record.id,
    'number', v_record.number,
    'company', jsonb_build_object('id', v_record.company_id, 'name', v_company_row.company_name,
                                  'cuit', v_company_row.company_cuit),
    'training', jsonb_build_object('id', v_training.id, 'title', v_training.title, 'kind', v_training.kind,
                                   'passingScore', v_training.passing_score, 'validityMonths', v_training.validity_months),
    'heldOn', v_record.held_on,
    'modality', v_record.modality,
    'location', v_record.location,
    'durationMinutes', v_record.duration_minutes,
    'topics', v_record.topics,
    'observations', v_record.observations,
    'instructors', v_instructors,
    'attendees', v_attendees,
    'closedAt', v_now,
    'closedBy', jsonb_build_object('profileId', p_closed_by, 'name', v_closer)
  );

  PERFORM set_config('app.hse_closing', 'on', true);
  UPDATE public.hse_training_records
  SET status = 'closed', closed_at = v_now, closed_by = p_closed_by, content = v_content,
      content_sha256 = encode(sha256(convert_to(v_content::text, 'UTF8')), 'hex'), updated_at = v_now
  WHERE id = v_record.id;
  PERFORM set_config('app.hse_closing', 'off', true);
  RETURN jsonb_build_object('ok', true);
END
$function$;

-- function hse_void_training_record: anula un acta CERRADA (permiso `hse:actas:delete`, con motivo). No se borra.
CREATE OR REPLACE FUNCTION public.hse_void_training_record(p_record_id uuid, p_reason text, p_voided_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
BEGIN
  IF NOT public.app_has_permission('hse', 'actas', 'delete') THEN
    RAISE EXCEPTION 'hse_void_training_record: sin permiso';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'hse_void_training_record: falta el motivo';
  END IF;
  PERFORM set_config('app.hse_closing', 'on', true);
  UPDATE public.hse_training_records
  SET status = 'voided', voided_at = now(), voided_by = p_voided_by, void_reason = btrim(p_reason), updated_at = now()
  WHERE id = p_record_id AND company_id = public.app_current_company_id() AND status = 'closed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hse_void_training_record: solo se anula un acta cerrada';
  END IF;
  PERFORM set_config('app.hse_closing', 'off', true);
END
$function$;

-- function hse_attach_record_pdf: adjunta (UNA vez) el PDF del acta cerrada o anulada (permiso `hse:actas:view`).
-- Devuelve el PDF que quedó (puede ser el de una llamada concurrente).
CREATE OR REPLACE FUNCTION public.hse_attach_record_pdf(p_record_id uuid, p_pdf_path text, p_pdf_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_record public.hse_training_records%ROWTYPE;
BEGIN
  IF NOT public.app_has_permission('hse', 'actas', 'view') THEN
    RAISE EXCEPTION 'hse_attach_record_pdf: sin permiso';
  END IF;
  SELECT * INTO v_record FROM public.hse_training_records
  WHERE id = p_record_id AND company_id = public.app_current_company_id()
  FOR UPDATE;
  IF NOT FOUND OR v_record.status = 'draft' THEN
    RAISE EXCEPTION 'hse_attach_record_pdf: el acta no está cerrada';
  END IF;
  IF v_record.pdf_path IS NULL THEN
    IF p_pdf_sha256 !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'hse_attach_record_pdf: huella inválida';
    END IF;
    PERFORM set_config('app.hse_closing', 'on', true);
    UPDATE public.hse_training_records SET pdf_path = p_pdf_path, pdf_sha256 = p_pdf_sha256
    WHERE id = v_record.id
    RETURNING * INTO v_record;
    PERFORM set_config('app.hse_closing', 'off', true);
  END IF;
  RETURN jsonb_build_object('pdfPath', v_record.pdf_path, 'pdfSha256', v_record.pdf_sha256);
END
$function$;

-- function hse_record_guard: el acta en borrador se edita (datos); se cierra y se anula solo con las funciones
-- (`app.hse_closing`); cerrada o anulada no cambia, salvo adjuntar el PDF una vez y anular una cerrada. Un acta que no
-- es borrador no se borra desde la app.
CREATE OR REPLACE FUNCTION public.hse_record_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_flag boolean := current_setting('app.hse_closing', true) IS NOT DISTINCT FROM 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' AND public.app_current_actor_kind() IS NOT NULL THEN
      RAISE EXCEPTION 'Un acta cerrada no se borra: se anula';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' AND NOT v_flag THEN
      RAISE EXCEPTION 'El acta nace en borrador';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.company_id, NEW.training_id, NEW.number, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.company_id, OLD.training_id, OLD.number, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'El acta no cambia de capacitación ni de número';
  END IF;
  IF OLD.status = 'draft' THEN
    IF NOT v_flag AND (NEW.status <> 'draft' OR NEW.content IS NOT NULL OR NEW.content_sha256 IS NOT NULL
                       OR NEW.closed_at IS NOT NULL OR NEW.pdf_path IS NOT NULL OR NEW.voided_at IS NOT NULL) THEN
      RAISE EXCEPTION 'El acta se cierra solo con el cierre formal';
    END IF;
    RETURN NEW;
  END IF;
  -- Cerrada o anulada: nada de los datos ni del contenido congelado cambia.
  IF (NEW.held_on, NEW.modality, NEW.location, NEW.duration_minutes, NEW.topics, NEW.observations, NEW.closed_at,
      NEW.closed_by, NEW.content, NEW.content_sha256)
     IS DISTINCT FROM (OLD.held_on, OLD.modality, OLD.location, OLD.duration_minutes, OLD.topics, OLD.observations,
      OLD.closed_at, OLD.closed_by, OLD.content, OLD.content_sha256) THEN
    RAISE EXCEPTION 'Un acta cerrada no se modifica';
  END IF;
  IF NOT v_flag THEN
    RAISE EXCEPTION 'Un acta cerrada no se modifica';
  END IF;
  IF (NEW.pdf_path, NEW.pdf_sha256) IS DISTINCT FROM (OLD.pdf_path, OLD.pdf_sha256) AND OLD.pdf_path IS NOT NULL THEN
    RAISE EXCEPTION 'El PDF del acta se adjunta una sola vez';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'closed' AND NEW.status = 'voided' AND NEW.void_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'Un acta cerrada solo se puede anular';
  END IF;
  IF OLD.status = 'voided' AND (NEW.voided_at, NEW.voided_by, NEW.void_reason)
     IS DISTINCT FROM (OLD.voided_at, OLD.voided_by, OLD.void_reason) THEN
    RAISE EXCEPTION 'La anulación del acta no se modifica';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS hse_record_guard ON public.hse_training_records;
CREATE TRIGGER hse_record_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.hse_training_records
  FOR EACH ROW EXECUTE FUNCTION public.hse_record_guard();

-- function hse_record_children_guard: capacitadores y asistentes de un acta se tocan solo en BORRADOR. SECURITY
-- DEFINER para leer el acta sin depender de la RLS; si el acta ya no existe (borrado en cascada) deja pasar.
CREATE OR REPLACE FUNCTION public.hse_record_children_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_status public.hse_record_status;
BEGIN
  SELECT r.status INTO v_status FROM public.hse_training_records r
  WHERE r.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.record_id ELSE NEW.record_id END;
  IF FOUND AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'El acta está cerrada: capacitadores y asistentes no se modifican';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.record_id <> OLD.record_id THEN
    RAISE EXCEPTION 'No cambia de acta';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;

DROP TRIGGER IF EXISTS hse_record_children_guard ON public.hse_training_record_instructors;
CREATE TRIGGER hse_record_children_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.hse_training_record_instructors
  FOR EACH ROW EXECUTE FUNCTION public.hse_record_children_guard();
DROP TRIGGER IF EXISTS hse_record_children_guard ON public.hse_training_record_attendees;
CREATE TRIGGER hse_record_children_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.hse_training_record_attendees
  FOR EACH ROW EXECUTE FUNCTION public.hse_record_children_guard();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────────────────────
SELECT public.app_enable_tenant_isolation('public.hse_training_instructors');
SELECT public.app_enable_tenant_isolation('public.hse_training_records');
SELECT public.app_enable_tenant_isolation('public.hse_training_record_instructors');
SELECT public.app_enable_tenant_isolation('public.hse_training_record_attendees');
SELECT public.app_enable_tenant_isolation('public.hse_training_certificates');
SELECT public.app_enable_tenant_isolation('public.hse_training_document_types');
SELECT public.app_enable_tenant_isolation('public.hse_expiry_notices');

-- Capacitadores habituales: configuración de la capacitación (el empleado no los lee: la constancia los congela).
SELECT public.app_enable_read_gate('public.hse_training_instructors', 'hse:capacitaciones:view');
SELECT public.app_require_any_permission_for_writes('public.hse_training_instructors',
  ARRAY['hse:capacitaciones:create', 'hse:capacitaciones:update']);

-- Actas: solo con permiso, sin compuerta para el empleado (listan a todos los asistentes).
SELECT public.app_enable_read_gate('public.hse_training_records', 'hse:actas:view');
SELECT public.app_enable_read_gate('public.hse_training_record_instructors', 'hse:actas:view');
SELECT public.app_enable_read_gate('public.hse_training_record_attendees', 'hse:actas:view');
SELECT public.app_require_any_permission_for_writes('public.hse_training_records',
  ARRAY['hse:actas:create', 'hse:actas:update', 'hse:actas:approve', 'hse:actas:delete']);
SELECT public.app_require_any_permission_for_writes('public.hse_training_record_instructors',
  ARRAY['hse:actas:create', 'hse:actas:update']);
SELECT public.app_require_any_permission_for_writes('public.hse_training_record_attendees',
  ARRAY['hse:actas:create', 'hse:actas:update']);

-- Tipo de documento del legajo por capacitación: lo escribe solo `hse_attach_certificate_pdf` (SECURITY DEFINER).
SELECT public.app_enable_read_gate('public.hse_training_document_types', 'hse:capacitaciones:view');
SELECT public.app_require_any_permission_for_writes('public.hse_training_document_types',
  ARRAY['hse:capacitaciones:approve']);

-- Constancias: el empleado lee las suyas; el dashboard con permiso. Nadie escribe directo: las funciones de firma,
-- PDF y anulación (SECURITY DEFINER) y el trigger guarda.
SELECT public.app_enable_employee_self('public.hse_training_certificates',
  'hse:capacitaciones:view', 'hse:actas:delete', 'employee_id', false);

-- Avisos de vencimiento: el empleado lee los suyos; los escribe el job (`prismaSystem`).
SELECT public.app_enable_employee_self('public.hse_expiry_notices',
  'hse:cumplimiento:view', 'hse:configuracion-hse:update', 'employee_id', false);

-- ── 4. Permisos y avisos ─────────────────────────────────────────────────────────────────────
INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
SELECT '4a81c057-5669-42a8-ab53-530d626a62dd', m.id, 'actas', 'Actas y constancias',
       'Actas de dictado (capacitadores, asistentes y resultados), cierre formal y constancias firmadas', 4, NULL
FROM modules m
WHERE m.id = '33d06789-45d5-443d-9aaa-4bd1fd6777ff'
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, t.id, a.id
FROM roles r
JOIN tabs t ON t.id = '4a81c057-5669-42a8-ab53-530d626a62dd'
JOIN actions a ON a.slug = ANY (ARRAY['view', 'create', 'update', 'delete', 'approve'])
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;

INSERT INTO role_notifications (role_id, event_key, channel)
SELECT r.id, 'hse.expiry_weekly', 'in_app'::notification_channel
FROM roles r
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, event_key, channel) DO NOTHING;
