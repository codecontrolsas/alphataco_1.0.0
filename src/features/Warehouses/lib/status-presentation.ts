import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Ban,
  CheckCircle2,
  CircleCheck,
  CircleOff,
  Clock,
  Lock,
  PackageCheck,
  RotateCcw,
  SlidersHorizontal,
  Undo2,
  XCircle,
} from 'lucide-react';
import { TONE_TO_BADGE, type StatusUi } from '../../Mantenimiento/lib/status-presentation';
import type { BatchExpiryStatus } from './batch-expiry';
import { MOVEMENT_TYPE_LABELS, REQUEST_STATUS_LABELS, type MovementKind } from './labels';
import type { MaterialRequestStatus } from './request-state-machine';

/**
 * Fuente única de la presentación de estados de Almacenes (etiqueta, tono e ícono) por entidad.
 *
 * Módulo sin directiva: lo consumen servidor y cliente. Las etiquetas salen de `lib/labels.ts` y de los
 * textos que ya mostraban las pantallas; acá solo se decide el tono y el ícono.
 */

export { TONE_TO_BADGE };
export type { StatusUi };

/** Pedidos de materiales (`material_requests.status`). */
export const REQUEST_STATUS_UI: Record<MaterialRequestStatus, StatusUi> = {
  PENDING_APPROVAL: { label: REQUEST_STATUS_LABELS.PENDING_APPROVAL, tone: 'warn', icon: Clock },
  APPROVED: { label: REQUEST_STATUS_LABELS.APPROVED, tone: 'info', icon: CheckCircle2 },
  PARTIALLY_DELIVERED: { label: REQUEST_STATUS_LABELS.PARTIALLY_DELIVERED, tone: 'pending', icon: PackageCheck },
  DELIVERED: { label: REQUEST_STATUS_LABELS.DELIVERED, tone: 'ok', icon: CircleCheck },
  REJECTED: { label: REQUEST_STATUS_LABELS.REJECTED, tone: 'danger', icon: XCircle },
  CLOSED: { label: REQUEST_STATUS_LABELS.CLOSED, tone: 'neutral', icon: Lock },
  CANCELLED: { label: REQUEST_STATUS_LABELS.CANCELLED, tone: 'danger', icon: Ban },
};

/** Tipos de movimiento de stock. */
export const MOVEMENT_TYPE_UI: Record<MovementKind, StatusUi> = {
  ENTRY: { label: MOVEMENT_TYPE_LABELS.ENTRY, tone: 'ok', icon: ArrowDownToLine },
  EXIT: { label: MOVEMENT_TYPE_LABELS.EXIT, tone: 'warn', icon: ArrowUpFromLine },
  TRANSFER: { label: MOVEMENT_TYPE_LABELS.TRANSFER, tone: 'info', icon: ArrowLeftRight },
  ADJUSTMENT: { label: MOVEMENT_TYPE_LABELS.ADJUSTMENT, tone: 'pending', icon: SlidersHorizontal },
  RETURN: { label: MOVEMENT_TYPE_LABELS.RETURN, tone: 'brand', icon: RotateCcw },
};

/** Vigencia de un movimiento frente a las anulaciones (mismos textos que la columna Estado de Movimientos). */
export type ReversalStatus = 'VALID' | 'REVERSED' | 'REVERSAL';

export const REVERSAL_STATUS_UI: Record<ReversalStatus, StatusUi> = {
  VALID: { label: 'Vigente', tone: 'ok', icon: CheckCircle2 },
  REVERSED: { label: 'Anulado', tone: 'danger', icon: Ban },
  REVERSAL: { label: 'Anulación', tone: 'neutral', icon: Undo2 },
};

/** Vencimiento de un lote (ver `classifyBatch`). El plazo exacto de "por vencer" lo aporta quien lo muestra. */
export const BATCH_EXPIRY_UI: Record<BatchExpiryStatus, StatusUi> = {
  EXPIRED: { label: 'Vencido', tone: 'danger', icon: XCircle },
  EXPIRING: { label: 'Por vencer', tone: 'warn', icon: AlertTriangle },
  OK: { label: 'Vigente', tone: 'ok', icon: CheckCircle2 },
};

/** Nivel de stock de un material frente a su mínimo. */
export type StockLevel = 'OUT_OF_STOCK' | 'BELOW_MIN' | 'OK';

export const STOCK_LEVEL_UI: Record<StockLevel, StatusUi> = {
  OUT_OF_STOCK: { label: 'Agotado', tone: 'danger', icon: CircleOff },
  BELOW_MIN: { label: 'Bajo mínimo', tone: 'warn', icon: AlertTriangle },
  OK: { label: 'En stock', tone: 'ok', icon: CheckCircle2 },
};

/** Entidades de Almacenes con estado presentable. */
export const WAREHOUSE_STATUS_UI = {
  request: REQUEST_STATUS_UI,
  movementType: MOVEMENT_TYPE_UI,
  reversal: REVERSAL_STATUS_UI,
  batchExpiry: BATCH_EXPIRY_UI,
  stockLevel: STOCK_LEVEL_UI,
} as const;
