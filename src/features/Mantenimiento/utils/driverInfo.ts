/**
 * Utilidad para extraer información de comentarios de items de mantenimiento.
 *
 * Maneja correctamente la distinción entre:
 * - Solicitudes de checklist (creadas por chofer): muestra "Comentario del chofer"
 * - Solicitudes manuales (creadas por supervisor): muestra "Comentario del supervisor"
 *
 * Deduplica comentarios idénticos entre driver_comment, supervisor_comment, validator_comment y description.
 * Incluye nombre del autor y rol para cada comentario.
 */

type DriverRequestInput = {
  driver_employee?: { firstname: string; lastname: string; file?: string | null } | null;
  checklist_answers?: { answer_data: unknown } | null;
  employees?: { firstname: string; lastname: string; file?: string | null } | null;
};

/**
 * Resolve driver info as structured data from a maintenance request.
 * Use this in UIs with enough space to show legajo and name separately.
 * Priority: driver_employee (new FK) → answer_data.chofer (legacy) → employees (old FK) → fallback
 */
export function resolveDriverInfo(request: DriverRequestInput): {
  name: string;
  fileNumber: string | null;
} {
  // Priority 1: New FK — driver_employee
  if (request.driver_employee) {
    const { firstname, lastname, file } = request.driver_employee;
    return { name: `${firstname} ${lastname}`.trim(), fileNumber: file ?? null };
  }

  // Priority 2: Legacy JSON — checklist_answers.answer_data.chofer
  const answerData = request.checklist_answers?.answer_data as { chofer?: string } | null;
  if (answerData?.chofer) return { name: answerData.chofer, fileNumber: null };

  // Priority 3: Old FK — employees (employee_id)
  if (request.employees) {
    const { firstname, lastname, file } = request.employees;
    return { name: `${firstname} ${lastname}`.trim(), fileNumber: file ?? null };
  }

  return { name: 'No especificado', fileNumber: null };
}

/**
 * Extrae el nombre del chofer desde los datos de checklist_deviations
 * Prioriza: driverEmployee (explicit param) > employee firstname+lastname > user.fullname > user.email
 */
export function getDriverName(
  item: unknown,
  driverEmployee?: { firstname: string; lastname: string } | null
): string | null {
  // Priority 0: Explicit driver_employee from parent request
  if (driverEmployee) {
    return `${driverEmployee.firstname} ${driverEmployee.lastname}`.trim() || null;
  }

  const checklistAnswers = (item as Record<string, unknown>)?.maintenance_request_items as
    | Record<string, unknown>
    | undefined;
  const deviations = checklistAnswers?.checklist_deviations as Record<string, unknown> | undefined;
  const answers = deviations?.checklist_answers as Record<string, unknown> | undefined;

  if (!answers) return null;

  // Prioridad 1: Employee firstname + lastname
  const employee = answers.employee as { firstname?: string; lastname?: string } | undefined;
  if (employee?.firstname || employee?.lastname) {
    const name = [employee.firstname, employee.lastname].filter(Boolean).join(' ');
    if (name) return name;
  }

  // Prioridad 2: User fullname (Prisma retorna 'profile', Supabase retornaba 'user' — soportar ambos)
  const user = (answers.profile ?? answers.user) as { fullname?: string; email?: string } | undefined;
  if (user?.fullname) {
    return user.fullname;
  }

  // Prioridad 3: User email
  if (user?.email) {
    return user.email;
  }

  return null;
}

/**
 * Extrae el comentario del chofer desde los datos del item
 * Busca en maintenance_request_items.driver_comment o checklist_deviations.driver_comment
 */
export function getDriverComment(item: unknown): string | null {
  const requestItems = (item as Record<string, unknown>)?.maintenance_request_items as
    | Record<string, unknown>
    | undefined;

  // Prioridad al comentario en maintenance_request_items
  const requestComment = requestItems?.driver_comment;
  if (typeof requestComment === 'string' && requestComment) return requestComment;

  // Fallback al comentario en checklist_deviations
  const deviations = requestItems?.checklist_deviations as Record<string, unknown> | undefined;
  const deviationComment = deviations?.driver_comment;
  if (typeof deviationComment === 'string' && deviationComment) return deviationComment;

  return null;
}

// =============================================================================
// Sistema de comentarios con deduplicación, detección de origen y autor
// =============================================================================

export interface CommentEntry {
  /** Label a mostrar (ej: "Comentario del chofer", "Comentario del supervisor") */
  label: string;
  /** El texto del comentario */
  text: string;
  /** Estilo visual: 'driver' (amber), 'validator' (blue), 'description' (neutral), 'chief' (emerald), 'operator' (purple) */
  style: 'driver' | 'validator' | 'description' | 'chief' | 'operator';
  /** Nombre del autor del comentario (del profile JOIN) */
  authorName?: string;
  /** Rol del autor */
  role: string;
}

/** Helper para extraer fullname de un profile JOIN resuelto */
function getProfileName(profile: unknown): string | undefined {
  if (!profile || typeof profile !== 'object') return undefined;
  const p = profile as { fullname?: string | null };
  return p.fullname || undefined;
}

/**
 * Obtiene todos los comentarios de un item de maintenance_order deduplicados.
 *
 * @param item - Item de maintenance_order_items (con maintenance_request_items embebido)
 * @param source - Origen de la solicitud: 'checklist' | 'manual' | null
 * @returns Array de comentarios únicos con labels apropiados según el origen
 */
export function getItemComments(
  item: unknown,
  source: string | null | undefined,
  fallbackAuthorName?: string | null
): CommentEntry[] {
  const comments: CommentEntry[] = [];
  const seenTexts = new Set<string>();

  const itemObj = item as Record<string, unknown>;
  const requestItems = itemObj?.maintenance_request_items as Record<string, unknown> | undefined;

  // 1. driver_comment — siempre "Comentario del chofer" si existe
  const driverComment = getDriverComment(item);
  if (driverComment) {
    const driverProfileName = getProfileName(requestItems?.driver_comment_profile);
    const driverName = driverProfileName || getDriverName(item);

    comments.push({
      label: 'Comentario del chofer',
      text: driverComment,
      style: 'driver',
      authorName: driverName || undefined,
      role: 'Chofer',
    });
    seenTexts.add(driverComment.trim().toLowerCase());
  }

  // 2. supervisor_comment — siempre "Comentario del supervisor" si existe
  const supervisorComment = requestItems?.supervisor_comment;
  if (typeof supervisorComment === 'string' && supervisorComment) {
    const normalized = supervisorComment.trim().toLowerCase();
    if (!seenTexts.has(normalized)) {
      const supervisorProfileName = getProfileName(requestItems?.supervisor_comment_profile);

      comments.push({
        label: 'Comentario del supervisor',
        text: supervisorComment,
        style: 'validator',
        authorName: supervisorProfileName || fallbackAuthorName || undefined,
        role: 'Supervisor',
      });
      seenTexts.add(normalized);
    }
  }

  // 3. validator_comment - "Comentario del validador" (solo si es diferente)
  const validatorComment = requestItems?.validator_comment;
  if (typeof validatorComment === 'string' && validatorComment) {
    const normalized = validatorComment.trim().toLowerCase();
    if (!seenTexts.has(normalized)) {
      const validatorProfileName = getProfileName(requestItems?.validator_comment_profile);

      comments.push({
        label: 'Comentario del validador',
        text: validatorComment,
        style: 'validator',
        authorName: validatorProfileName || fallbackAuthorName || undefined,
        role: 'Supervisor',
      });
      seenTexts.add(normalized);
    }
  }

  // 4. description del request_item - "Descripción del desvío" (solo si es diferente)
  const requestDescription = requestItems?.description;
  if (typeof requestDescription === 'string' && requestDescription) {
    const normalized = requestDescription.trim().toLowerCase();
    if (!seenTexts.has(normalized)) {
      comments.push({
        label: 'Descripción del desvío',
        text: requestDescription,
        style: 'description',
        role: '',
      });
      seenTexts.add(normalized);
    }
  }

  // 5. description del order_item - "Descripción adicional" (solo si es diferente)
  const itemDescription = itemObj?.description;
  if (typeof itemDescription === 'string' && itemDescription) {
    const normalized = itemDescription.trim().toLowerCase();
    if (!seenTexts.has(normalized)) {
      comments.push({
        label: 'Descripción adicional',
        text: itemDescription,
        style: 'description',
        role: '',
      });
      seenTexts.add(normalized);
    }
  }

  // 6. workshop_chief_comment - "Comentario del Jefe de Taller"
  const chiefComment = itemObj?.workshop_chief_comment;
  if (typeof chiefComment === 'string' && chiefComment) {
    const normalized = chiefComment.trim().toLowerCase();
    if (!seenTexts.has(normalized)) {
      const chiefProfileName = getProfileName(itemObj?.workshop_chief_comment_profile);

      comments.push({
        label: 'Comentario del Jefe de Taller',
        text: chiefComment,
        style: 'chief',
        authorName: chiefProfileName,
        role: 'Jefe de Taller',
      });
      seenTexts.add(normalized);
    }
  }

  // 7. technician_notes (de work_order_item_repairs) - se agregan externamente si se necesitan

  return comments;
}

/**
 * Extrae comentarios de technician_notes de los repairs de un item.
 * Se usa para agregar notas del operario al array de comentarios.
 */
export function getTechnicianComments(item: unknown): CommentEntry[] {
  const comments: CommentEntry[] = [];
  const itemObj = item as Record<string, unknown>;

  // Acceder a work_orders -> work_order_items -> work_order_item_repairs
  const workOrders = itemObj?.work_orders;
  if (!workOrders || Array.isArray(workOrders)) return comments;

  const woItems = (workOrders as Record<string, unknown>)?.work_order_items;
  if (!Array.isArray(woItems)) return comments;

  for (const woItem of woItems) {
    const repairs = (woItem as Record<string, unknown>)?.work_order_item_repairs;
    if (!Array.isArray(repairs)) continue;

    for (const repair of repairs) {
      const repairObj = repair as Record<string, unknown>;
      const notes = repairObj?.technician_notes;
      if (typeof notes !== 'string' || !notes) continue;

      const techProfileName = getProfileName(repairObj?.technician_notes_profile);

      comments.push({
        label: 'Notas del operario',
        text: notes,
        style: 'operator',
        authorName: techProfileName,
        role: 'Operario',
      });
    }
  }

  return comments;
}
