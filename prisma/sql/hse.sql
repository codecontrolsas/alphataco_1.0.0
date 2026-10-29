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

-- function hse_mark_material_opened: el empleado del contexto registra que ABRIÓ un material de una capacitación que le
-- aplica (clic en el enlace del portal). La primera apertura queda; las siguientes solo mueven `last_opened_at`. NO
-- cuenta como lectura: no toca `hse_training_material_reads`, así que no destraba el examen. Con `first_opened_at` y
-- el `read_at` de la lectura se mide el tiempo de estudio.
CREATE OR REPLACE FUNCTION public.hse_mark_material_opened(p_material_id uuid)
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
    RAISE EXCEPTION 'hse_mark_material_opened: falta el empleado del contexto';
  END IF;
  SELECT m.training_id INTO v_training
  FROM public.hse_training_materials m
  WHERE m.id = p_material_id AND m.company_id = v_company;
  IF v_training IS NULL OR NOT public.hse_employee_can_read_training(v_training) THEN
    RAISE EXCEPTION 'hse_mark_material_opened: el material no está disponible';
  END IF;
  INSERT INTO public.hse_training_material_opens (company_id, training_id, material_id, employee_id)
  VALUES (v_company, v_training, p_material_id, v_employee)
  ON CONFLICT (material_id, employee_id) DO UPDATE SET last_opened_at = now();
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
  -- Orden de bloqueo ÚNICO en todas las funciones del examen (asignación → intento): sin deadlocks entre el envío,
  -- una respuesta tardía y el job de vencidos sobre el mismo intento.
  PERFORM 1 FROM public.hse_training_assignments
  WHERE id = (SELECT x.assignment_id FROM public.hse_training_attempts x WHERE x.id = p_attempt_id)
  FOR UPDATE;
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
  -- Aprobado con aritmética entera (sin el redondeo del porcentaje que se muestra).
  v_passed := v_attempt.max_points > 0 AND v_points * 100 >= v_training.passing_score * v_attempt.max_points;
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
  PERFORM 1 FROM public.hse_training_assignments
  WHERE id = (SELECT x.assignment_id FROM public.hse_training_attempts x
              WHERE x.id = p_attempt_id AND x.employee_id = v_employee AND x.company_id = v_company)
  FOR UPDATE;
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
