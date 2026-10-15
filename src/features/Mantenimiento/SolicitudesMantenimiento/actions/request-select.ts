/**
 * Selects y mapeo compartidos de `maintenance_requests`.
 *
 * Vive en un módulo SIN directiva: un archivo `'use server'` solo puede exportar funciones
 * async, así que estas constantes y el mapper sincrónico no pueden salir de las actions.
 * Lo consumen `queries.server.ts`, `mutations.server.ts` y `approvals.server.ts`.
 */

// ─── Selector compartido para profile ───────────────────────────────────────
export const PROFILE_SELECT = { id: true, fullname: true, email: true } as const;

// ─── Selector de solicitudes completo ───────────────────────────────────────
export const MAINTENANCE_REQUEST_FULL_SELECT = {
  id: true,
  checklist_answer_id: true,
  equipment_id: true,
  other_equipment_id: true,
  employee_id: true,
  user_id: true,
  status: true,
  rejection_reason: true,
  rejected_by: true,
  rejected_at: true,
  approved_by: true,
  approved_at: true,
  kilometer: true,
  engine_hours: true,
  created_at: true,
  updated_at: true,
  supervisor_id: true,
  source: true,
  preventive_type: true,
  description: true,
  vehicles: {
    select: {
      id: true,
      domain: true,
      serie: true,
      intern_number: true,
      kilometer: true,
      engine_hours: true,
      condition: true,
    },
  },
  // Ticket 596: la solicitud puede ser de un equipamiento; sin esto el detalle mostraba "Sin identificar"
  other_equipment: {
    select: { id: true, serial_number: true, intern_number: true, condition: true },
  },
  employees: {
    select: { id: true, firstname: true, lastname: true, file: true },
  },
  driver_employee: {
    select: {
      id: true,
      firstname: true,
      lastname: true,
      file: true,
    },
  },
  checklist_answers: {
    select: { id: true, created_at: true, answer_data: true },
  },
  profile_maintenance_requests_user_idToprofile: {
    select: PROFILE_SELECT,
  },
  profile_maintenance_requests_supervisor_idToprofile: {
    select: PROFILE_SELECT,
  },
  maintenance_request_items: {
    select: {
      id: true,
      maintenance_request_id: true,
      checklist_deviation_id: true,
      repair_type_id: true,
      status: true,
      rejection_reason: true,
      created_at: true,
      description: true,
      driver_comment: true,
      validator_comment: true,
      driver_comment_by: true,
      validator_comment_by: true,
      supervisor_comment: true,
      supervisor_comment_by: true,
      profile_maintenance_request_items_driver_comment_byToprofile: {
        select: PROFILE_SELECT,
      },
      profile_maintenance_request_items_validator_comment_byToprofile: {
        select: PROFILE_SELECT,
      },
      profile_maintenance_request_items_supervisor_comment_byToprofile: {
        select: PROFILE_SELECT,
      },
      // Grupo de reparaciones del que salio el item, para marcarlo en los listados
      maintenance_request_groups: {
        select: { id: true, name: true },
      },
      checklist_deviations: {
        select: {
          id: true,
          item_code: true,
          item_label: true,
          section_code: true,
          is_critical: true,
          driver_comment: true,
          checklist_answers: { select: { template_id: true } },
        },
      },
      types_of_repairs: {
        select: { id: true, name: true },
      },
    },
  },
  maintenance_orders: {
    select: {
      id: true,
      status: true,
      scheduled_date: true,
      date_approved_at: true,
      date_approved_by: true,
    },
  },
} as const;

/**
 * Mapea el resultado de Prisma agregando aliases de compatibilidad
 * para que los componentes existentes sigan funcionando sin cambios.
 */
export function mapRequestWithAliases<
  T extends {
    profile_maintenance_requests_user_idToprofile: { id: string; fullname: string | null; email: string | null } | null;
    profile_maintenance_requests_supervisor_idToprofile: {
      id: string;
      fullname: string | null;
      email: string | null;
    } | null;
    maintenance_request_items: Array<{
      profile_maintenance_request_items_driver_comment_byToprofile: {
        id: string;
        fullname: string | null;
        email: string | null;
      } | null;
      profile_maintenance_request_items_validator_comment_byToprofile: {
        id: string;
        fullname: string | null;
        email: string | null;
      } | null;
      profile_maintenance_request_items_supervisor_comment_byToprofile: {
        id: string;
        fullname: string | null;
        email: string | null;
      } | null;
      [key: string]: unknown;
    }>;
  },
>(request: T) {
  return {
    ...request,
    // Alias de compatibilidad para componentes que usan `request.profile_user`
    profile_user: request.profile_maintenance_requests_user_idToprofile,
    // Alias de compatibilidad para componentes que usan `request.supervisor`
    supervisor: request.profile_maintenance_requests_supervisor_idToprofile,
    // Mapear aliases de profile en cada item para que ItemComments los encuentre
    maintenance_request_items: request.maintenance_request_items.map((item) => ({
      ...item,
      driver_comment_profile: item.profile_maintenance_request_items_driver_comment_byToprofile,
      validator_comment_profile: item.profile_maintenance_request_items_validator_comment_byToprofile,
      supervisor_comment_profile: item.profile_maintenance_request_items_supervisor_comment_byToprofile,
    })),
  };
}

/**
 * Obtiene las solicitudes de mantenimiento con filtros opcionales.
 * Incluye información de maintenance_orders para saber el estado del pedido.
 *
 * FILTRO DE SUPERVISOR:
 * - Usuarios con rol de sistema: ven TODAS las solicitudes
 * - Usuarios sin rol de sistema: solo ven solicitudes donde supervisor_id = su profile.id
 */
