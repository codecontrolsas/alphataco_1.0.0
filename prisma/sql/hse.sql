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
