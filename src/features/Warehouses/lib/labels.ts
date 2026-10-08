/**
 * Etiquetas de Almacenes: tipos de movimiento, destinos, tipos de control y estados de unidad.
 * Fuente unica para tablas, filtros, detalle, kardex y export (regla del repo: los labels del
 * filtro coinciden exactamente con los de la celda).
 */
import {
  STOCK_MOVEMENT_TYPES,
  type MaterialTrackingTypeValue,
  type StockDestinationTypeValue,
} from '../schemas/stock-movement';
import type { MaterialRequestStatus } from './request-state-machine';

/**
 * Todos los tipos de movimiento, incluida la devolucion. `STOCK_MOVEMENT_TYPES` (del schema
 * del formulario) NO incluye `RETURN` a proposito: la devolucion no se carga desde "Nuevo
 * movimiento" sino desde Prestamos, que sabe de que salida viene. Tablas, filtros, detalle y
 * kardex usan esta lista completa.
 */
export const ALL_MOVEMENT_TYPES = [...STOCK_MOVEMENT_TYPES, 'RETURN'] as const;
export type MovementKind = (typeof ALL_MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementKind, string> = {
  ENTRY: 'Entrada',
  EXIT: 'Salida',
  TRANSFER: 'Transferencia',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
};

export const WRITE_OFF_REASON_LABELS: Record<'LOST' | 'BROKEN', string> = {
  LOST: 'Extraviada',
  BROKEN: 'Rota',
};

export const REQUEST_STATUS_LABELS: Record<MaterialRequestStatus, string> = {
  PENDING_APPROVAL: 'Pendiente de aprobación',
  APPROVED: 'Aprobado',
  PARTIALLY_DELIVERED: 'Entregado en parte',
  DELIVERED: 'Entregado',
  REJECTED: 'Rechazado',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
};

export const DESTINATION_TYPE_LABELS: Record<StockDestinationTypeValue, string> = {
  EMPLOYEE: 'Empleado',
  VEHICLE: 'Vehículo',
  OTHER_EQUIPMENT: 'Equipo',
  MAINTENANCE_ORDER: 'Orden de mantenimiento',
  CUSTOMER: 'Cliente',
};

export const TRACKING_TYPE_LABELS: Record<MaterialTrackingTypeValue, string> = {
  QUANTITY: 'Por cantidad',
  SERIAL: 'Por número de serie',
  BATCH: 'Por lote',
};

// ── Etiquetas de recursos ───────────────────────────────────────────────────
// Una sola forma de nombrar cada recurso: el buscador del formulario, el detalle, la tabla y el
// kardex tienen que mostrar lo mismo.

export function employeeLabel(e: { file: string; lastname: string; firstname: string }): string {
  return `[${e.file}] ${e.lastname} ${e.firstname}`;
}

export function vehicleLabel(v: { intern_number: string | null; domain: string | null; serie: string | null }): string {
  return [v.intern_number && `Int. ${v.intern_number}`, v.domain ?? v.serie].filter(Boolean).join(' · ') || 'Sin identificación';
}

export function otherEquipmentLabel(e: {
  intern_number: string | null;
  serial_number: string | null;
  type?: { name: string } | null;
}): string {
  return (
    [e.type?.name, e.intern_number && `Int. ${e.intern_number}`, e.serial_number && `S/N ${e.serial_number}`]
      .filter(Boolean)
      .join(' · ') || 'Sin identificación'
  );
}

export function contractLabel(s: { contract_number: string | null; service_name: string | null }): string {
  return [s.contract_number && `Contrato ${s.contract_number}`, s.service_name].filter(Boolean).join(' · ') || 'Contrato sin nombre';
}

/** Relaciones de destino tal como las incluyen las queries de movimientos. */
export interface DestinationRelations {
  destination_type: StockDestinationTypeValue | null;
  employee: { file: string; lastname: string; firstname: string } | null;
  vehicle: { intern_number: string | null; domain: string | null; serie: string | null } | null;
  other_equipment: { intern_number: string | null; serial_number: string | null; type: { name: string } | null } | null;
  maintenance_order: { order_number: string | null } | null;
  customer: { name: string } | null;
  customer_service: { service_name: string | null; contract_number: string | null } | null;
}

/** Select de Prisma que trae exactamente lo que necesita `destinationLabel`. */
export const DESTINATION_SELECT = {
  destination_type: true,
  employee: { select: { file: true, lastname: true, firstname: true } },
  vehicle: { select: { intern_number: true, domain: true, serie: true } },
  other_equipment: { select: { intern_number: true, serial_number: true, type: { select: { name: true } } } },
  maintenance_order: { select: { order_number: true } },
  customer: { select: { name: true } },
  customer_service: { select: { service_name: true, contract_number: true } },
} as const;

/** Etiqueta del destino de una salida: "[123] Perez Juan", "YPF · Contrato 45 · Perforación", etc. */
export function destinationLabel(m: DestinationRelations): string | null {
  switch (m.destination_type) {
    case 'EMPLOYEE':
      return m.employee ? employeeLabel(m.employee) : null;
    case 'VEHICLE':
      return m.vehicle ? vehicleLabel(m.vehicle) : null;
    case 'OTHER_EQUIPMENT':
      return m.other_equipment ? otherEquipmentLabel(m.other_equipment) : null;
    case 'MAINTENANCE_ORDER':
      return m.maintenance_order?.order_number ?? 'Orden sin número';
    case 'CUSTOMER':
      if (!m.customer) return null;
      return [m.customer.name, m.customer_service && contractLabel(m.customer_service)].filter(Boolean).join(' · ');
    default:
      return null;
  }
}
