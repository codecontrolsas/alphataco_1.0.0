/**
 * Tipos para el flujo de mantenimiento
 *
 * NOTA: Los tipos de datos con relaciones se infieren automáticamente
 * de las queries usando `Awaited<ReturnType<typeof fnName>>` en cada action file.
 * Este archivo solo contiene tipos utilitarios (status, filtros, inputs).
 */

// Estados de solicitud de mantenimiento
export type MaintenanceRequestStatus = 'pending_approval' | 'approved' | 'rejected';

// Estados de items de solicitud
export type MaintenanceRequestItemStatus = 'pending' | 'approved' | 'rejected';

// Estados de pedidos de mantenimiento
export type MaintenanceOrderStatus = 'pending_scheduling' | 'scheduled' | 'in_workshop' | 'completed' | 'rejected';

// Tipos para acciones
export interface ApproveRequestItemsInput {
  requestId: string;
  /** Items aprobados - Los tipos de reparación se asignan en la etapa de Planificación */
  approvedItems: {
    itemId: string;
    /** Comentario del validador (opcional) */
    validatorComment?: string;
  }[];
  rejectedItems: {
    itemId: string;
    reason: string;
    /** Comentario del validador (opcional) */
    validatorComment?: string;
  }[];
  /** Aprueba la solicitud preventiva completa como unidad (sin items) */
  preventiveApproval?: boolean;
  /** Comentario del validador para aprobación preventiva */
  validatorComment?: string;
  /**
   * Descripción de lo aprobado, obligatoria cuando la aprobación genera un pedido.
   * Se persiste en `maintenance_orders.description` y es lo que ve el taller.
   */
  description?: string;
}

export interface ScheduleOrderInput {
  orderId: string;
  scheduledDate: string;
}

/** Ticket 676: rechazo del taller sobre un pedido del paso "Por Programar" */
export interface RejectPendingOrderInput {
  orderId: string;
  /** Obligatorio: el taller debe indicar por que rechaza el pedido */
  reason: string;
}

export interface ApproveWorkshopEntryInput {
  orderId: string;
  /** Un equipamiento no lleva kilometraje (ticket 596): solo llega para vehiculos */
  kilometer?: string;
  engine_hours?: string;
}

export interface RejectOperationInput {
  orderId: string;
  reason: string;
}
