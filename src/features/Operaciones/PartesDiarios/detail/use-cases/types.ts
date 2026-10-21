import type { PrismaClient } from '@/generated/prisma/client';
import type { RowErrorCode } from './errors';

/** Un empleado con rol opcional (para jornadas 12/24 hrs). */
export interface EmployeeInput {
  id: string;
  role?: 'chofer_dia' | 'chofer_noche' | 'ayudante_dia' | 'ayudante_noche';
}

/** Datos de una línea del parte diario para crear o actualizar. */
export interface DailyReportRowInput {
  /** Requerido solo en create */
  daily_report_id?: string;
  customer_id: string;
  service_id: string;
  item_id: string;
  status: string;
  /**
   * Cantidad de la línea. Si no viene, vale 1 (`resolveRowQuantity`). Se acepta `string`
   * porque el input del formulario entrega texto y convertirlo a `number` antes de tiempo
   * pierde decimales: la conversión a `Decimal` la hace el helper.
   */
  quantity?: string | number | null;
  working_day: string;
  /** Turno seleccionado para jornada 12h (excluyente). Null para otras jornadas. */
  shift_12h?: 'dia' | 'noche' | null;
  type_service?: 'mensual' | 'adicional' | 'adicional_permanente' | null;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  sector_service_id?: string | null;
  areas_service_id?: string | null;
  remit_number?: string | null;
  cancel_reason?: string | null;
  completed_day?: boolean | null;
  completed_night?: boolean | null;
  preparte_id?: string | null;
  employees?: EmployeeInput[];
  /** IDs de vehículos */
  equipment?: string[];
  /** IDs de otros equipos */
  other_equipment?: string[];
  /** IDs de equipos de clientes */
  customer_equipment?: string[];
}

/** Dependencias que el adaptador inyecta: el cliente base de Prisma (sin extensión de contexto). */
export interface UseCaseDeps {
  db: Pick<PrismaClient, '$transaction'>;
}

/** Identidad del comando: `commandId` lo genera el cliente (uuid v4) y hace idempotente el reintento. */
export interface CommandMeta {
  commandId: string;
  /** Momento en que el usuario hizo la acción (ISO). Auditoría de la cola offline: no decide conflictos. */
  capturedAt?: string;
}

/** Conjunto de recursos de una línea, por tipo. */
export interface ResourceSet {
  employees: EmployeeInput[];
  equipment: string[];
  otherEquipment: string[];
  customerEquipment: string[];
}

export type CreateRowCommand = CommandMeta & { dailyReportId: string; row: DailyReportRowInput };

/** Altas y bajas EXPLÍCITAS: un id que no figura en ninguna lista no se toca. */
export type ChangeRowResourcesCommand = CommandMeta & {
  rowId: string;
  baseVersion: number;
  add: ResourceSet;
  remove: ResourceSet;
};

export type ChangeRowStatusCommand = CommandMeta & {
  rowId: string;
  baseVersion: number;
  /** Estado de la lista del modal (`reprogramado` con clonado todavía no pasa por acá). */
  status?: 'ejecutado' | 'cancelado' | 'pendiente';
  cancelReason?: string | null;
  completeDay?: boolean;
  completeNight?: boolean;
};

export interface RowWriteResult {
  rowId: string;
  /** Versión final de la línea, leída al terminar (después de recalcular el estado). */
  version: number;
  status: string;
  added?: number;
  removed?: number;
}

export type UseCaseResult<T> =
  | { ok: true; data: T; replayed: boolean }
  | { ok: false; code: RowErrorCode; message: string; currentVersion?: number };

export const EMPTY_RESOURCES: ResourceSet = { employees: [], equipment: [], otherEquipment: [], customerEquipment: [] };
