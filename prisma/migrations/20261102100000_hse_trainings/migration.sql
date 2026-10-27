-- HSE, capacitaciones y exámenes (ticket 804, fase 3).
-- 1. Tablas (DDL de `prisma migrate diff`, solo lo de capacitaciones) + CHECK de coherencia e índice de un solo intento
--    abierto por empleado.
-- 2. Lógica de prisma/sql/hse.sql: regla compartida de destinatarios (también la usan ahora los documentos),
--    conciliación de asignaciones, compuerta de lectura del empleado, examen (empezar, responder, corregir, cerrar
--    vencidos) y triggers guarda.
-- 3. RLS: empresa en todas; contenido con compuerta (el empleado lee solo lo publicado que le aplica); la CLAVE solo con
--    permiso (el empleado nunca la lee); asignaciones, intentos, respuestas y lecturas con la capa por empleado SIN
--    escritura propia (escriben solo las funciones del examen).
-- 4. Permisos: pestaña `capacitaciones` del módulo `hse`, solo para los 3 roles de acceso completo. Tolerante a una base
--    sin seed: la pestaña se crea solo si existe el módulo; sin roles no se asigna nada (el seed lo hace).

-- ── 1. Tablas ────────────────────────────────────────────────────────────────────────────────
-- CreateEnum
CREATE TYPE "hse_training_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "hse_training_kind" AS ENUM ('induction', 'refresher', 'specific', 'other');

-- CreateEnum
CREATE TYPE "hse_material_kind" AS ENUM ('file', 'link');

-- CreateEnum
CREATE TYPE "hse_assignment_status" AS ENUM ('pending', 'in_progress', 'passed', 'failed');

-- CreateEnum
CREATE TYPE "hse_attempt_status" AS ENUM ('in_progress', 'submitted', 'expired');

-- CreateTable
CREATE TABLE "hse_trainings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "hse_training_kind" NOT NULL DEFAULT 'other',
    "status" "hse_training_status" NOT NULL DEFAULT 'draft',
    "passing_score" INTEGER NOT NULL DEFAULT 70,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "time_limit_minutes" INTEGER,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "validity_months" INTEGER,
    "created_by" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "hse_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "kind" "hse_target_kind" NOT NULL,
    "position_id" UUID,
    "sector_id" UUID,
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "hse_training_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "kind" "hse_material_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "file_path" TEXT,
    "file_name" TEXT,
    "file_size" INTEGER,
    "file_sha256" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "hse_training_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "hse_training_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

CONSTRAINT "hse_training_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_answer_keys" (
    "question_id" UUID NOT NULL,
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,

CONSTRAINT "hse_training_answer_keys_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "hse_training_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" "hse_assignment_status" NOT NULL DEFAULT 'pending',
    "attempts_used" INTEGER NOT NULL DEFAULT 0,
    "attempts_total" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6),
    "last_score_percent" DECIMAL(5,2),
    "passed_attempt_id" UUID,
    "passed_at" TIMESTAMPTZ(6),
    "valid_until" DATE,
    "archived_at" TIMESTAMPTZ(6),
    "archive_reason" "hse_ack_archive_reason",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "hse_training_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "hse_attempt_status" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "score_points" INTEGER,
    "max_points" INTEGER NOT NULL,
    "score_percent" DECIMAL(5,2),
    "passed" BOOLEAN,
    "question_order" UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "hse_training_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "attempt_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "hse_training_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_training_material_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "training_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "hse_training_material_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hse_trainings_company_status" ON "hse_trainings"("company_id", "status");

-- CreateIndex
CREATE INDEX "idx_hse_training_targets_training" ON "hse_training_targets"("training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_targets_company_id" ON "hse_training_targets"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_materials_file_path_key" ON "hse_training_materials"("file_path");

-- CreateIndex
CREATE INDEX "idx_hse_training_materials_training" ON "hse_training_materials"("training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_materials_company_id" ON "hse_training_materials"("company_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_questions_training" ON "hse_training_questions"("training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_questions_company_id" ON "hse_training_questions"("company_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_options_question" ON "hse_training_options"("question_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_options_company_id" ON "hse_training_options"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_options_id_question_key" ON "hse_training_options"("id", "question_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_answer_keys_training" ON "hse_training_answer_keys"("training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_answer_keys_company_id" ON "hse_training_answer_keys"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_answer_keys_option_key" ON "hse_training_answer_keys"("option_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_assignments_passed_attempt_key" ON "hse_training_assignments"("passed_attempt_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_assignments_employee" ON "hse_training_assignments"("employee_id", "archived_at");

-- CreateIndex
CREATE INDEX "idx_hse_training_assignments_company_id" ON "hse_training_assignments"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_assignments_training_employee_key" ON "hse_training_assignments"("training_id", "employee_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_attempts_employee" ON "hse_training_attempts"("employee_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_attempts_open" ON "hse_training_attempts"("status", "deadline_at");

-- CreateIndex
CREATE INDEX "idx_hse_training_attempts_company_id" ON "hse_training_attempts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_attempts_number_key" ON "hse_training_attempts"("training_id", "employee_id", "attempt_number");

-- CreateIndex
CREATE INDEX "idx_hse_training_answers_company_id" ON "hse_training_answers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_answers_attempt_question_key" ON "hse_training_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_material_reads_employee" ON "hse_training_material_reads"("employee_id", "training_id");

-- CreateIndex
CREATE INDEX "idx_hse_training_material_reads_company_id" ON "hse_training_material_reads"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "hse_training_material_reads_material_employee_key" ON "hse_training_material_reads"("material_id", "employee_id");

-- AddForeignKey
ALTER TABLE "hse_training_targets" ADD CONSTRAINT "hse_training_targets_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_targets" ADD CONSTRAINT "hse_training_targets_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "company_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_targets" ADD CONSTRAINT "hse_training_targets_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "hierarchy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_targets" ADD CONSTRAINT "hse_training_targets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_materials" ADD CONSTRAINT "hse_training_materials_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_questions" ADD CONSTRAINT "hse_training_questions_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_options" ADD CONSTRAINT "hse_training_options_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_options" ADD CONSTRAINT "hse_training_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "hse_training_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_answer_keys" ADD CONSTRAINT "hse_training_answer_keys_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_answer_keys" ADD CONSTRAINT "hse_training_answer_keys_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "hse_training_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_answer_keys" ADD CONSTRAINT "hse_training_answer_keys_option_id_question_id_fkey" FOREIGN KEY ("option_id", "question_id") REFERENCES "hse_training_options"("id", "question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_assignments" ADD CONSTRAINT "hse_training_assignments_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_assignments" ADD CONSTRAINT "hse_training_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_assignments" ADD CONSTRAINT "hse_training_assignments_passed_attempt_id_fkey" FOREIGN KEY ("passed_attempt_id") REFERENCES "hse_training_attempts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_attempts" ADD CONSTRAINT "hse_training_attempts_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_attempts" ADD CONSTRAINT "hse_training_attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "hse_training_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_attempts" ADD CONSTRAINT "hse_training_attempts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_answers" ADD CONSTRAINT "hse_training_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "hse_training_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_answers" ADD CONSTRAINT "hse_training_answers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_answers" ADD CONSTRAINT "hse_training_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "hse_training_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_answers" ADD CONSTRAINT "hse_training_answers_option_id_question_id_fkey" FOREIGN KEY ("option_id", "question_id") REFERENCES "hse_training_options"("id", "question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_material_reads" ADD CONSTRAINT "hse_training_material_reads_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "hse_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_material_reads" ADD CONSTRAINT "hse_training_material_reads_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "hse_training_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hse_training_material_reads" ADD CONSTRAINT "hse_training_material_reads_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hse_trainings" ADD CONSTRAINT "hse_trainings_config_check" CHECK (
  passing_score BETWEEN 1 AND 100
  AND max_attempts BETWEEN 1 AND 20
  AND (time_limit_minutes IS NULL OR time_limit_minutes BETWEEN 1 AND 600)
  AND (validity_months IS NULL OR validity_months BETWEEN 1 AND 120)
);
ALTER TABLE "hse_training_targets" ADD CONSTRAINT "hse_training_targets_kind_check" CHECK (
  (kind = 'all' AND position_id IS NULL AND sector_id IS NULL AND employee_id IS NULL)
  OR (kind = 'position' AND position_id IS NOT NULL AND sector_id IS NULL AND employee_id IS NULL)
  OR (kind = 'sector' AND sector_id IS NOT NULL AND position_id IS NULL AND employee_id IS NULL)
  OR (kind = 'employee' AND employee_id IS NOT NULL AND position_id IS NULL AND sector_id IS NULL)
);
ALTER TABLE "hse_training_materials" ADD CONSTRAINT "hse_training_materials_kind_check" CHECK (
  (kind = 'file' AND file_path IS NOT NULL AND file_name IS NOT NULL AND url IS NULL)
  OR (kind = 'link' AND url ~ '^https://' AND file_path IS NULL)
);
ALTER TABLE "hse_training_questions" ADD CONSTRAINT "hse_training_questions_points_check" CHECK (points BETWEEN 1 AND 100);
ALTER TABLE "hse_training_attempts" ADD CONSTRAINT "hse_training_attempts_result_check" CHECK (
  (status = 'in_progress' AND submitted_at IS NULL AND passed IS NULL AND score_percent IS NULL)
  OR (status <> 'in_progress' AND submitted_at IS NOT NULL AND passed IS NOT NULL AND score_points IS NOT NULL
      AND score_percent IS NOT NULL)
);
ALTER TABLE "hse_training_attempts" ALTER COLUMN "question_order" SET NOT NULL;
-- Un solo intento abierto por empleado y capacitación (carreras entre pestañas o dobles clics).
CREATE UNIQUE INDEX "hse_training_attempts_one_open" ON "hse_training_attempts"("training_id", "employee_id")
  WHERE status = 'in_progress';

-- ── 2. Lógica HSE (prisma/sql/hse.sql) ──────────────────────────────────────────────────────
-- ── Capacitaciones y exámenes (ticket 804, fase 3) ─────────────────────────────────────────
-- Reglas de seguridad del examen (diagnóstico S1, S2 y S8 del blueprint):
--   * la clave de respuestas vive en `hse_training_answer_keys`, que el empleado no puede leer (RLS sin compuerta);
--   * el empleado NO escribe directo en intentos, respuestas ni lecturas: todo pasa por funciones SECURITY DEFINER que
--     validan que el intento sea suyo, que esté abierto y dentro del tiempo medido con el reloj de la base;
--   * una sola regla de puntaje (`hse_grade_attempt`): porcentaje de puntos sobre el total ponderado de las preguntas
--     del intento, igual para el envío del empleado y para el cierre automático de los vencidos;
--   * un intento cerrado es inmutable y el examen de una capacitación publicada queda congelado (triggers guarda).
-- Las funciones que tocan resultados prenden `app.hse_grading` en la transacción: los triggers guarda rechazan
-- cualquier cambio de resultado que no venga de ellas (aunque una action futura escriba directo).

-- function hse_employee_matches_target: regla ÚNICA de "a quién aplica" (documentos y capacitaciones): todos, su puesto
-- (`company_position`), su sector (`hierarchical_position`) o él mismo. SQL inmutable: el planificador la inlinea.
CREATE OR REPLACE FUNCTION public.hse_employee_matches_target(
  p_kind public.hse_target_kind,
  p_position_id uuid,
  p_sector_id uuid,
  p_target_employee_id uuid,
  p_employee_id uuid,
  p_employee_position uuid,
  p_employee_sector uuid
)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT coalesce(
       p_kind = 'all'
    OR (p_kind = 'position' AND p_employee_position = p_position_id)
    OR (p_kind = 'sector' AND p_employee_sector = p_sector_id)
    OR (p_kind = 'employee' AND p_employee_id = p_target_employee_id),
    false)
$function$;

-- function hse_sync_acknowledgements: (ver arriba) ahora con la regla compartida `hse_employee_matches_target`.
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
   AND public.hse_employee_matches_target(t.kind, t.position_id, t.sector_id, t.employee_id,
                                          e.id, e.company_position, e.hierarchical_position)
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
          AND public.hse_employee_matches_target(t.kind, t.position_id, t.sector_id, t.employee_id,
                                                 e.id, e.company_position, e.hierarchical_position)
      )
    );
END
$function$;

-- function hse_sync_training_assignments: concilia quién tiene que hacer cada capacitación PUBLICADA, dentro de una
-- empresa. Alcance: una capacitación, un empleado, ambos o toda la empresa (los dos NULL). Misma regla que los
-- documentos: lo que aplica y falta se crea pendiente, lo que vuelve a aplicar se desarchiva (con su resultado), lo que
-- dejó de aplicar se ARCHIVA (nunca se borra: un aprobado queda como constancia). Idempotente. SECURITY DEFINER: la
-- llaman también las acciones de Empleados (usuario sin permisos de HSE); controla ella misma la empresa.
CREATE OR REPLACE FUNCTION public.hse_sync_training_assignments(
  p_company_id uuid,
  p_training_id uuid DEFAULT NULL,
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
    RAISE EXCEPTION 'hse_sync_training_assignments: falta la empresa';
  END IF;
  IF public.app_current_company_id() IS NOT NULL AND p_company_id <> public.app_current_company_id() THEN
    RAISE EXCEPTION 'hse_sync_training_assignments: la empresa no es la del contexto';
  END IF;

  INSERT INTO public.hse_training_assignments (company_id, training_id, employee_id)
  SELECT DISTINCT tr.company_id, tr.id, e.id
  FROM public.hse_trainings tr
  JOIN public.hse_training_targets t ON t.training_id = tr.id
  JOIN public.employees e
    ON e.company_id = tr.company_id
   AND coalesce(e.is_active, true)
   AND public.hse_employee_matches_target(t.kind, t.position_id, t.sector_id, t.employee_id,
                                          e.id, e.company_position, e.hierarchical_position)
  WHERE tr.company_id = p_company_id
    AND tr.status = 'published'
    AND (p_training_id IS NULL OR tr.id = p_training_id)
    AND (p_employee_id IS NULL OR e.id = p_employee_id)
  ON CONFLICT (training_id, employee_id) DO UPDATE
    SET archived_at = NULL, archive_reason = NULL, updated_at = now()
    WHERE public.hse_training_assignments.archived_at IS NOT NULL;

  UPDATE public.hse_training_assignments a
  SET archived_at = now(), archive_reason = 'no_longer_applies', updated_at = now()
  FROM public.hse_trainings tr
  WHERE tr.id = a.training_id
    AND a.company_id = p_company_id
    AND a.archived_at IS NULL
    AND tr.status = 'published'
    AND (p_training_id IS NULL OR a.training_id = p_training_id)
    AND (p_employee_id IS NULL OR a.employee_id = p_employee_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.hse_training_targets t
      JOIN public.employees e
        ON e.id = a.employee_id
       AND e.company_id = tr.company_id
       AND coalesce(e.is_active, true)
      WHERE t.training_id = tr.id
        AND public.hse_employee_matches_target(t.kind, t.position_id, t.sector_id, t.employee_id,
                                               e.id, e.company_position, e.hierarchical_position)
    );
END
$function$;

-- function hse_employee_can_read_training: compuerta de lectura del contenido de una capacitación (la capacitación,
-- su material, sus preguntas y sus opciones; NUNCA la clave) para el empleado del portal: publicada y asignada a él.
CREATE OR REPLACE FUNCTION public.hse_employee_can_read_training(p_training_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT public.app_current_employee_id() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hse_training_assignments a
    JOIN public.hse_trainings t ON t.id = a.training_id
    WHERE a.training_id = p_training_id
      AND a.employee_id = public.app_current_employee_id()
      AND a.company_id = public.app_current_company_id()
      AND a.archived_at IS NULL
      AND t.status = 'published'
  )
$function$;

-- function hse_mark_material_read: el empleado del contexto registra que leyó un material de una capacitación que le
-- aplica. Idempotente (la primera lectura queda).
CREATE OR REPLACE FUNCTION public.hse_mark_material_read(p_material_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_employee uuid := public.app_current_employee_id();
  v_company uuid := public.app_current_company_id();
  v_training uuid;
BEGIN
  IF v_employee IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'hse_mark_material_read: falta el empleado del contexto';
  END IF;
  SELECT m.training_id INTO v_training
  FROM public.hse_training_materials m
  WHERE m.id = p_material_id AND m.company_id = v_company;
  IF v_training IS NULL OR NOT public.hse_employee_can_read_training(v_training) THEN
    RAISE EXCEPTION 'hse_mark_material_read: el material no está disponible';
  END IF;
  INSERT INTO public.hse_training_material_reads (company_id, training_id, material_id, employee_id)
  VALUES (v_company, v_training, p_material_id, v_employee)
  ON CONFLICT (material_id, employee_id) DO NOTHING;
END
$function$;

-- function hse_grade_attempt: LA corrección (una sola regla). Cierra el intento y calcula puntos (suma de los puntos de
-- las preguntas respondidas con la opción de la clave), porcentaje sobre `max_points` (fijado al empezar) y aprobado
-- (porcentaje >= `passing_score`). Si ya pasó `deadline_at` (reloj de la base) queda `expired`, con lo respondido hasta
-- ese momento. Actualiza el resultado del empleado (constancia: aprobado el día X, vigente hasta Y).
-- Idempotente: un intento cerrado devuelve su resultado sin tocar nada. Puede cerrarlo su dueño (el empleado del
-- contexto), o cualquiera si ya venció (job de vencidos). Devuelve el resultado SIN detalle por pregunta.
CREATE OR REPLACE FUNCTION public.hse_grade_attempt(p_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_attempt public.hse_training_attempts%ROWTYPE;
  v_training public.hse_trainings%ROWTYPE;
  v_employee uuid := public.app_current_employee_id();
  v_company uuid := public.app_current_company_id();
  v_expired boolean;
  v_points integer;
  v_percent numeric(5, 2);
  v_passed boolean;
  v_when timestamptz;
BEGIN
  SELECT * INTO v_attempt FROM public.hse_training_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR (v_company IS NOT NULL AND v_attempt.company_id <> v_company) THEN
    RAISE EXCEPTION 'hse_grade_attempt: el intento no existe';
  END IF;
  v_expired := v_attempt.deadline_at IS NOT NULL AND now() >= v_attempt.deadline_at;

  IF v_attempt.status <> 'in_progress' THEN
    IF v_employee IS DISTINCT FROM v_attempt.employee_id
       AND public.app_current_actor_kind() IS DISTINCT FROM 'job'
       AND NOT public.app_has_permission('hse', 'capacitaciones', 'view') THEN
      RAISE EXCEPTION 'hse_grade_attempt: el intento no es tuyo';
    END IF;
    RETURN jsonb_build_object(
      'status', v_attempt.status, 'scorePoints', v_attempt.score_points, 'maxPoints', v_attempt.max_points,
      'scorePercent', v_attempt.score_percent, 'passed', v_attempt.passed, 'alreadyClosed', true);
  END IF;

  IF v_employee IS DISTINCT FROM v_attempt.employee_id AND NOT v_expired THEN
    RAISE EXCEPTION 'hse_grade_attempt: solo el empleado cierra su intento antes de que venza';
  END IF;

  SELECT * INTO v_training FROM public.hse_trainings WHERE id = v_attempt.training_id;

  SELECT coalesce(sum(q.points), 0) INTO v_points
  FROM public.hse_training_answers a
  JOIN public.hse_training_questions q ON q.id = a.question_id
  JOIN public.hse_training_answer_keys k ON k.question_id = a.question_id AND k.option_id = a.option_id
  WHERE a.attempt_id = v_attempt.id
    AND a.question_id = ANY (v_attempt.question_order);

  v_percent := CASE WHEN v_attempt.max_points > 0 THEN round(v_points * 100.0 / v_attempt.max_points, 2) ELSE 0 END;
  v_passed := v_percent >= v_training.passing_score;
  v_when := CASE WHEN v_expired THEN v_attempt.deadline_at ELSE now() END;

  PERFORM set_config('app.hse_grading', 'on', true);
  UPDATE public.hse_training_attempts
  SET status = CASE WHEN v_expired THEN 'expired'::public.hse_attempt_status ELSE 'submitted'::public.hse_attempt_status END,
      submitted_at = v_when,
      score_points = v_points,
      score_percent = v_percent,
      passed = v_passed
  WHERE id = v_attempt.id;

  UPDATE public.hse_training_assignments
  SET status = CASE
                 WHEN v_passed THEN 'passed'::public.hse_assignment_status
                 WHEN attempts_used >= v_training.max_attempts THEN 'failed'::public.hse_assignment_status
                 ELSE 'pending'::public.hse_assignment_status
               END,
      last_score_percent = v_percent,
      passed_attempt_id = CASE WHEN v_passed THEN v_attempt.id ELSE passed_attempt_id END,
      passed_at = CASE WHEN v_passed THEN v_when ELSE passed_at END,
      valid_until = CASE
                      WHEN NOT v_passed THEN valid_until
                      WHEN v_training.validity_months IS NULL THEN NULL
                      ELSE (v_when::date + make_interval(months => v_training.validity_months))::date
                    END,
      updated_at = now()
  WHERE id = v_attempt.assignment_id;
  PERFORM set_config('app.hse_grading', 'off', true);

  RETURN jsonb_build_object(
    'status', CASE WHEN v_expired THEN 'expired' ELSE 'submitted' END, 'scorePoints', v_points,
    'maxPoints', v_attempt.max_points, 'scorePercent', v_percent, 'passed', v_passed, 'alreadyClosed', false);
END
$function$;

-- function hse_start_attempt: el empleado del contexto empieza (o retoma) el examen de una capacitación.
-- Devuelve `{ ok, attemptId, resumed }` o `{ ok: false, reason }`:
--   not_available (no publicada o no le aplica), already_passed (aprobada y vigente), no_attempts_left,
--   materials_pending (falta leer material obligatorio; `pending` = cuántos), no_questions.
-- Un solo intento abierto por empleado (índice único parcial + bloqueo de su fila de resultado). Si el abierto ya
-- venció, primero se corrige. Si la aprobación anterior venció (`valid_until`), arranca un ciclo nuevo de intentos.
CREATE OR REPLACE FUNCTION public.hse_start_attempt(p_training_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_employee uuid := public.app_current_employee_id();
  v_company uuid := public.app_current_company_id();
  v_training public.hse_trainings%ROWTYPE;
  v_assignment public.hse_training_assignments%ROWTYPE;
  v_open uuid;
  v_pending integer;
  v_order uuid[];
  v_max integer;
  v_id uuid;
BEGIN
  IF v_employee IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'hse_start_attempt: falta el empleado del contexto';
  END IF;
  SELECT * INTO v_training FROM public.hse_trainings WHERE id = p_training_id AND company_id = v_company;
  IF NOT FOUND OR v_training.status <> 'published' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_available');
  END IF;
  SELECT * INTO v_assignment FROM public.hse_training_assignments
  WHERE training_id = p_training_id AND employee_id = v_employee AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_available');
  END IF;

  PERFORM public.hse_grade_attempt(a.id)
  FROM public.hse_training_attempts a
  WHERE a.training_id = p_training_id AND a.employee_id = v_employee AND a.status = 'in_progress'
    AND a.deadline_at IS NOT NULL AND a.deadline_at <= now();

  SELECT id INTO v_open FROM public.hse_training_attempts
  WHERE training_id = p_training_id AND employee_id = v_employee AND status = 'in_progress';
  IF v_open IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'attemptId', v_open, 'resumed', true);
  END IF;

  SELECT * INTO v_assignment FROM public.hse_training_assignments WHERE id = v_assignment.id;
  IF v_assignment.status = 'passed' AND v_assignment.valid_until IS NOT NULL AND v_assignment.valid_until < current_date THEN
    PERFORM set_config('app.hse_grading', 'on', true);
    UPDATE public.hse_training_assignments SET status = 'pending', attempts_used = 0, updated_at = now()
    WHERE id = v_assignment.id
    RETURNING * INTO v_assignment;
    PERFORM set_config('app.hse_grading', 'off', true);
  END IF;
  IF v_assignment.status = 'passed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_passed');
  END IF;
  IF v_assignment.attempts_used >= v_training.max_attempts THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_attempts_left');
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.hse_training_materials m
  WHERE m.training_id = p_training_id AND m.is_required
    AND NOT EXISTS (
      SELECT 1 FROM public.hse_training_material_reads r WHERE r.material_id = m.id AND r.employee_id = v_employee
    );
  IF v_pending > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'materials_pending', 'pending', v_pending);
  END IF;

  SELECT array_agg(q.id ORDER BY CASE WHEN v_training.shuffle_questions THEN random() ELSE 0 END, q.position, q.created_at),
         sum(q.points)
  INTO v_order, v_max
  FROM public.hse_training_questions q
  WHERE q.training_id = p_training_id;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_questions');
  END IF;

  PERFORM set_config('app.hse_grading', 'on', true);
  INSERT INTO public.hse_training_attempts (
    company_id, training_id, assignment_id, employee_id, attempt_number, deadline_at, max_points, question_order
  ) VALUES (
    v_company, p_training_id, v_assignment.id, v_employee, v_assignment.attempts_total + 1,
    CASE WHEN v_training.time_limit_minutes IS NULL THEN NULL
         ELSE now() + make_interval(mins => v_training.time_limit_minutes) END,
    v_max, v_order
  ) RETURNING id INTO v_id;
  UPDATE public.hse_training_assignments
  SET status = 'in_progress', attempts_used = attempts_used + 1, attempts_total = attempts_total + 1,
      last_attempt_at = now(), updated_at = now()
  WHERE id = v_assignment.id;
  PERFORM set_config('app.hse_grading', 'off', true);

  RETURN jsonb_build_object('ok', true, 'attemptId', v_id, 'resumed', false);
END
$function$;

-- function hse_save_answer: guarda (o cambia) la opción elegida en una pregunta de un intento PROPIO y ABIERTO, dentro
-- del tiempo (reloj de la base). El cliente manda solo la opción: nunca si es correcta. Devuelve `{ ok }` o
-- `{ ok: false, reason: closed | expired }` (si venció, lo corrige en el momento).
CREATE OR REPLACE FUNCTION public.hse_save_answer(p_attempt_id uuid, p_question_id uuid, p_option_id uuid)
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
BEGIN
  IF v_employee IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'hse_save_answer: falta el empleado del contexto';
  END IF;
  SELECT * INTO v_attempt FROM public.hse_training_attempts
  WHERE id = p_attempt_id AND employee_id = v_employee AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hse_save_answer: el intento no existe';
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed');
  END IF;
  IF v_attempt.deadline_at IS NOT NULL AND now() >= v_attempt.deadline_at THEN
    PERFORM public.hse_grade_attempt(v_attempt.id);
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF NOT (p_question_id = ANY (v_attempt.question_order)) THEN
    RAISE EXCEPTION 'hse_save_answer: la pregunta no es de este examen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hse_training_options o WHERE o.id = p_option_id AND o.question_id = p_question_id) THEN
    RAISE EXCEPTION 'hse_save_answer: la opción no es de esa pregunta';
  END IF;
  INSERT INTO public.hse_training_answers (company_id, attempt_id, employee_id, question_id, option_id)
  VALUES (v_company, v_attempt.id, v_employee, p_question_id, p_option_id)
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET option_id = EXCLUDED.option_id, answered_at = now();
  RETURN jsonb_build_object('ok', true);
END
$function$;

-- function hse_close_expired_attempts: cierra y corrige (misma `hse_grade_attempt`) los intentos de la empresa cuyo
-- tiempo venció. Lo llama el job `hse-expired-attempts`. Idempotente: lo ya cerrado no vuelve a aparecer.
CREATE OR REPLACE FUNCTION public.hse_close_expired_attempts(p_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_id uuid;
  v_closed integer := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'hse_close_expired_attempts: falta la empresa';
  END IF;
  IF public.app_current_company_id() IS NOT NULL AND p_company_id <> public.app_current_company_id() THEN
    RAISE EXCEPTION 'hse_close_expired_attempts: la empresa no es la del contexto';
  END IF;
  FOR v_id IN
    SELECT a.id FROM public.hse_training_attempts a
    WHERE a.company_id = p_company_id AND a.status = 'in_progress'
      AND a.deadline_at IS NOT NULL AND a.deadline_at <= now()
    ORDER BY a.deadline_at
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.hse_grade_attempt(v_id);
    v_closed := v_closed + 1;
  END LOOP;
  RETURN v_closed;
END
$function$;

-- function hse_training_freeze_guard: al publicar, la configuración del examen queda congelada; una capacitación
-- retirada no se edita; los estados solo avanzan (borrador → publicada → retirada, o borrador → retirada).
CREATE OR REPLACE FUNCTION public.hse_training_freeze_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'La capacitación no cambia de empresa';
  END IF;
  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'La capacitación está retirada: no se modifica';
  END IF;
  IF OLD.status = 'published' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Una capacitación publicada no vuelve a borrador';
  END IF;
  IF OLD.status <> 'draft' AND (NEW.passing_score, NEW.max_attempts, NEW.time_limit_minutes, NEW.shuffle_questions)
     IS DISTINCT FROM (OLD.passing_score, OLD.max_attempts, OLD.time_limit_minutes, OLD.shuffle_questions) THEN
    RAISE EXCEPTION 'El examen de una capacitación publicada no se modifica';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS hse_training_freeze_guard ON public.hse_trainings;
CREATE TRIGGER hse_training_freeze_guard
  BEFORE UPDATE ON public.hse_trainings
  FOR EACH ROW EXECUTE FUNCTION public.hse_training_freeze_guard();

-- function hse_training_content_guard: material, preguntas, opciones y clave solo se tocan en BORRADOR. SECURITY
-- DEFINER para leer el estado de la capacitación sin depender de la RLS de quien escribe. Si la capacitación ya no
-- existe (borrado en cascada de un borrador) deja pasar.
CREATE OR REPLACE FUNCTION public.hse_training_content_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_status public.hse_training_status;
BEGIN
  SELECT t.status INTO v_status FROM public.hse_trainings t
  WHERE t.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.training_id ELSE NEW.training_id END;
  IF FOUND AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'El contenido de una capacitación publicada o retirada no se modifica';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.training_id <> OLD.training_id THEN
    RAISE EXCEPTION 'El contenido no cambia de capacitación';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;

DROP TRIGGER IF EXISTS hse_training_content_guard ON public.hse_training_materials;
CREATE TRIGGER hse_training_content_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.hse_training_materials
  FOR EACH ROW EXECUTE FUNCTION public.hse_training_content_guard();
DROP TRIGGER IF EXISTS hse_training_content_guard ON public.hse_training_questions;
CREATE TRIGGER hse_training_content_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.hse_training_questions
  FOR EACH ROW EXECUTE FUNCTION public.hse_training_content_guard();
DROP TRIGGER IF EXISTS hse_training_content_guard ON public.hse_training_options;
CREATE TRIGGER hse_training_content_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.hse_training_options
  FOR EACH ROW EXECUTE FUNCTION public.hse_training_content_guard();
DROP TRIGGER IF EXISTS hse_training_content_guard ON public.hse_training_answer_keys;
CREATE TRIGGER hse_training_content_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.hse_training_answer_keys
  FOR EACH ROW EXECUTE FUNCTION public.hse_training_content_guard();

-- function hse_attempt_guard: los intentos los abren y cierran solo `hse_start_attempt` y `hse_grade_attempt`
-- (`app.hse_grading`); cerrado, un intento es inmutable; lo que lo identifica no cambia nunca.
CREATE OR REPLACE FUNCTION public.hse_attempt_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('app.hse_grading', true) IS DISTINCT FROM 'on' OR NEW.status <> 'in_progress' THEN
      RAISE EXCEPTION 'Los intentos se abren solo desde el examen';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Un intento cerrado no se modifica';
  END IF;
  IF current_setting('app.hse_grading', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Los intentos se cierran solo con la corrección del servidor';
  END IF;
  IF (NEW.company_id, NEW.training_id, NEW.assignment_id, NEW.employee_id, NEW.attempt_number, NEW.started_at,
      NEW.deadline_at, NEW.max_points, NEW.question_order)
     IS DISTINCT FROM (OLD.company_id, OLD.training_id, OLD.assignment_id, OLD.employee_id, OLD.attempt_number,
      OLD.started_at, OLD.deadline_at, OLD.max_points, OLD.question_order) THEN
    RAISE EXCEPTION 'Los datos de inicio del intento no se modifican';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS hse_attempt_guard ON public.hse_training_attempts;
CREATE TRIGGER hse_attempt_guard
  BEFORE INSERT OR UPDATE ON public.hse_training_attempts
  FOR EACH ROW EXECUTE FUNCTION public.hse_attempt_guard();

-- function hse_answer_guard: una respuesta se escribe solo en un intento ABIERTO y dentro del tiempo, y solo por el
-- empleado dueño del intento (el del contexto). SECURITY DEFINER para leer el intento sin depender de la RLS.
CREATE OR REPLACE FUNCTION public.hse_answer_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_attempt public.hse_training_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM public.hse_training_attempts WHERE id = NEW.attempt_id;
  IF NOT FOUND OR v_attempt.status <> 'in_progress'
     OR (v_attempt.deadline_at IS NOT NULL AND now() >= v_attempt.deadline_at) THEN
    RAISE EXCEPTION 'El intento está cerrado';
  END IF;
  IF NEW.employee_id <> v_attempt.employee_id OR NEW.company_id <> v_attempt.company_id
     OR public.app_current_employee_id() IS DISTINCT FROM v_attempt.employee_id THEN
    RAISE EXCEPTION 'Solo el empleado responde su examen';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.attempt_id, NEW.question_id) IS DISTINCT FROM (OLD.attempt_id, OLD.question_id) THEN
    RAISE EXCEPTION 'La respuesta no cambia de intento ni de pregunta';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS hse_answer_guard ON public.hse_training_answers;
CREATE TRIGGER hse_answer_guard
  BEFORE INSERT OR UPDATE ON public.hse_training_answers
  FOR EACH ROW EXECUTE FUNCTION public.hse_answer_guard();

-- function hse_training_assignment_guard: el resultado del empleado (estado, intentos, aprobado, vigencia) lo escriben
-- solo las funciones de examen (`app.hse_grading`); capacitación, empleado y empresa no cambian.
CREATE OR REPLACE FUNCTION public.hse_training_assignment_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (NEW.company_id, NEW.training_id, NEW.employee_id) IS DISTINCT FROM (OLD.company_id, OLD.training_id, OLD.employee_id) THEN
    RAISE EXCEPTION 'La asignación no cambia de capacitación, empleado ni empresa';
  END IF;
  IF current_setting('app.hse_grading', true) IS DISTINCT FROM 'on' AND (
       NEW.status, NEW.attempts_used, NEW.attempts_total, NEW.last_attempt_at, NEW.last_score_percent,
       NEW.passed_attempt_id, NEW.passed_at, NEW.valid_until
     ) IS DISTINCT FROM (
       OLD.status, OLD.attempts_used, OLD.attempts_total, OLD.last_attempt_at, OLD.last_score_percent,
       OLD.passed_attempt_id, OLD.passed_at, OLD.valid_until
     ) THEN
    RAISE EXCEPTION 'El resultado de una capacitación lo calcula solo el examen';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS hse_training_assignment_guard ON public.hse_training_assignments;
CREATE TRIGGER hse_training_assignment_guard
  BEFORE UPDATE ON public.hse_training_assignments
  FOR EACH ROW EXECUTE FUNCTION public.hse_training_assignment_guard();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────────────────────
SELECT public.app_enable_tenant_isolation('public.hse_trainings');
SELECT public.app_enable_tenant_isolation('public.hse_training_targets');
SELECT public.app_enable_tenant_isolation('public.hse_training_materials');
SELECT public.app_enable_tenant_isolation('public.hse_training_questions');
SELECT public.app_enable_tenant_isolation('public.hse_training_options');
SELECT public.app_enable_tenant_isolation('public.hse_training_answer_keys');
SELECT public.app_enable_tenant_isolation('public.hse_training_assignments');
SELECT public.app_enable_tenant_isolation('public.hse_training_attempts');
SELECT public.app_enable_tenant_isolation('public.hse_training_answers');
SELECT public.app_enable_tenant_isolation('public.hse_training_material_reads');

-- Contenido: con permiso, o lo publicado que le aplica al empleado de la transacción.
SELECT public.app_enable_read_gate('public.hse_trainings', 'hse:capacitaciones:view',
  'public.hse_employee_can_read_training(uuid)'::regprocedure, 'id');
SELECT public.app_enable_read_gate('public.hse_training_materials', 'hse:capacitaciones:view',
  'public.hse_employee_can_read_training(uuid)'::regprocedure, 'training_id');
SELECT public.app_enable_read_gate('public.hse_training_questions', 'hse:capacitaciones:view',
  'public.hse_employee_can_read_training(uuid)'::regprocedure, 'training_id');
SELECT public.app_enable_read_gate('public.hse_training_options', 'hse:capacitaciones:view',
  'public.hse_employee_can_read_training(uuid)'::regprocedure, 'training_id');
-- Destinatarios y CLAVE DE RESPUESTAS: solo con permiso (sin compuerta: el empleado nunca las lee).
SELECT public.app_enable_read_gate('public.hse_training_targets', 'hse:capacitaciones:view');
SELECT public.app_enable_read_gate('public.hse_training_answer_keys', 'hse:capacitaciones:view');

SELECT public.app_require_any_permission_for_writes('public.hse_trainings',
  ARRAY['hse:capacitaciones:create', 'hse:capacitaciones:update', 'hse:capacitaciones:delete', 'hse:capacitaciones:approve']);
SELECT public.app_require_any_permission_for_writes('public.hse_training_targets',
  ARRAY['hse:capacitaciones:create', 'hse:capacitaciones:update', 'hse:capacitaciones:approve']);
SELECT public.app_require_any_permission_for_writes('public.hse_training_materials',
  ARRAY['hse:capacitaciones:create', 'hse:capacitaciones:update']);
SELECT public.app_require_any_permission_for_writes('public.hse_training_questions',
  ARRAY['hse:capacitaciones:create', 'hse:capacitaciones:update']);
SELECT public.app_require_any_permission_for_writes('public.hse_training_options',
  ARRAY['hse:capacitaciones:create', 'hse:capacitaciones:update']);
SELECT public.app_require_any_permission_for_writes('public.hse_training_answer_keys',
  ARRAY['hse:capacitaciones:create', 'hse:capacitaciones:update']);

-- Filas del empleado: las lee él (las suyas) o el dashboard con permiso. Escribir exige permiso de dashboard: el
-- empleado NO escribe directo (`p_self_write` en false); sus escrituras pasan por las funciones del examen.
SELECT public.app_enable_employee_self('public.hse_training_assignments',
  'hse:capacitaciones:view', 'hse:capacitaciones:approve', 'employee_id', false);
SELECT public.app_enable_employee_self('public.hse_training_attempts',
  'hse:capacitaciones:view', 'hse:capacitaciones:approve', 'employee_id', false);
SELECT public.app_enable_employee_self('public.hse_training_answers',
  'hse:capacitaciones:view', 'hse:capacitaciones:approve', 'employee_id', false);
SELECT public.app_enable_employee_self('public.hse_training_material_reads',
  'hse:capacitaciones:view', 'hse:capacitaciones:approve', 'employee_id', false);

-- ── 4. Permisos ──────────────────────────────────────────────────────────────────────────────
INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
SELECT '083b4c64-8d46-4f06-8943-d3dd568ac58b', m.id, 'capacitaciones', 'Capacitaciones',
       'Capacitaciones con material y examen corregido en el servidor: alta, publicación, cumplimiento y resultados', 3, NULL
FROM modules m
WHERE m.id = '33d06789-45d5-443d-9aaa-4bd1fd6777ff'
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, t.id, a.id
FROM roles r
JOIN tabs t ON t.id = '083b4c64-8d46-4f06-8943-d3dd568ac58b'
JOIN actions a ON a.slug = ANY (ARRAY['view', 'create', 'update', 'delete', 'approve'])
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
