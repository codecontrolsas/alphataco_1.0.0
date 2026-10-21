import type { payment_order_status } from '@/generated/prisma/enums';
import {
  Ban,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  FilePen,
  Lock,
  MailCheck,
  PackageCheck,
  PackageOpen,
  Send,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { TONE_TO_BADGE, type StatusUi } from '../../Mantenimiento/lib/status-presentation';
import { SUPPLIER_INVOICE_STATUS_LABELS, type SupplierInvoiceStatus } from './invoice-status';
import { PURCHASE_ORDER_STATUS_LABELS, type PurchaseOrderStatus } from './order-state-machine';
import { PAYMENT_ORDER_STATUS_LABELS } from './payment-order-state-machine';
import { PURCHASE_QUOTE_STATUS_LABELS, type PurchaseQuoteStatus } from './quote-state-machine';
import { PURCHASE_REQUEST_STATUS_LABELS, type PurchaseRequestStatus } from './request-state-machine';

/**
 * Fuente única de la presentación de estados de Compras (etiqueta, tono e ícono) por entidad.
 *
 * Módulo sin directiva: lo consumen servidor y cliente. Las etiquetas salen de las máquinas de estado
 * de cada entidad (no se redactan acá); acá solo se decide el tono y el ícono.
 */

export { TONE_TO_BADGE };
export type { StatusUi };

/** Solicitudes de compra. */
export const REQUEST_STATUS_UI: Record<PurchaseRequestStatus, StatusUi> = {
  DRAFT: { label: PURCHASE_REQUEST_STATUS_LABELS.DRAFT, tone: 'neutral', icon: FilePen },
  PENDING_APPROVAL: { label: PURCHASE_REQUEST_STATUS_LABELS.PENDING_APPROVAL, tone: 'warn', icon: Clock },
  APPROVED: { label: PURCHASE_REQUEST_STATUS_LABELS.APPROVED, tone: 'ok', icon: CheckCircle2 },
  PARTIALLY_ORDERED: { label: PURCHASE_REQUEST_STATUS_LABELS.PARTIALLY_ORDERED, tone: 'pending', icon: CircleDashed },
  ORDERED: { label: PURCHASE_REQUEST_STATUS_LABELS.ORDERED, tone: 'info', icon: PackageCheck },
  CLOSED: { label: PURCHASE_REQUEST_STATUS_LABELS.CLOSED, tone: 'neutral', icon: Lock },
  REJECTED: { label: PURCHASE_REQUEST_STATUS_LABELS.REJECTED, tone: 'danger', icon: XCircle },
  CANCELLED: { label: PURCHASE_REQUEST_STATUS_LABELS.CANCELLED, tone: 'danger', icon: Ban },
};

/** Pedidos de cotización. */
export const QUOTE_STATUS_UI: Record<PurchaseQuoteStatus, StatusUi> = {
  DRAFT: { label: PURCHASE_QUOTE_STATUS_LABELS.DRAFT, tone: 'neutral', icon: FilePen },
  SENT: { label: PURCHASE_QUOTE_STATUS_LABELS.SENT, tone: 'info', icon: MailCheck },
  RECEIVED: { label: PURCHASE_QUOTE_STATUS_LABELS.RECEIVED, tone: 'ok', icon: CheckCircle2 },
  DECLINED: { label: PURCHASE_QUOTE_STATUS_LABELS.DECLINED, tone: 'neutral', icon: XCircle },
  CANCELLED: { label: PURCHASE_QUOTE_STATUS_LABELS.CANCELLED, tone: 'danger', icon: Ban },
};

/** Órdenes de compra. */
export const ORDER_STATUS_UI: Record<PurchaseOrderStatus, StatusUi> = {
  DRAFT: { label: PURCHASE_ORDER_STATUS_LABELS.DRAFT, tone: 'neutral', icon: FilePen },
  PENDING_APPROVAL: { label: PURCHASE_ORDER_STATUS_LABELS.PENDING_APPROVAL, tone: 'warn', icon: Clock },
  APPROVED: { label: PURCHASE_ORDER_STATUS_LABELS.APPROVED, tone: 'ok', icon: CheckCircle2 },
  SENT: { label: PURCHASE_ORDER_STATUS_LABELS.SENT, tone: 'info', icon: Send },
  PARTIALLY_RECEIVED: { label: PURCHASE_ORDER_STATUS_LABELS.PARTIALLY_RECEIVED, tone: 'pending', icon: PackageOpen },
  RECEIVED: { label: PURCHASE_ORDER_STATUS_LABELS.RECEIVED, tone: 'ok', icon: PackageCheck },
  CLOSED: { label: PURCHASE_ORDER_STATUS_LABELS.CLOSED, tone: 'neutral', icon: Lock },
  CANCELLED: { label: PURCHASE_ORDER_STATUS_LABELS.CANCELLED, tone: 'danger', icon: Ban },
};

/** Comprobantes de proveedor. */
export const INVOICE_STATUS_UI: Record<SupplierInvoiceStatus, StatusUi> = {
  CONFORMING: { label: SUPPLIER_INVOICE_STATUS_LABELS.CONFORMING, tone: 'ok', icon: CircleCheck },
  OBSERVED: { label: SUPPLIER_INVOICE_STATUS_LABELS.OBSERVED, tone: 'warn', icon: TriangleAlert },
  APPROVED: { label: SUPPLIER_INVOICE_STATUS_LABELS.APPROVED, tone: 'info', icon: BadgeCheck },
  REJECTED: { label: SUPPLIER_INVOICE_STATUS_LABELS.REJECTED, tone: 'danger', icon: CircleX },
  CANCELLED: { label: SUPPLIER_INVOICE_STATUS_LABELS.CANCELLED, tone: 'neutral', icon: Ban },
};

/** Órdenes de pago. */
export const PAYMENT_ORDER_STATUS_UI: Record<payment_order_status, StatusUi> = {
  DRAFT: { label: PAYMENT_ORDER_STATUS_LABELS.DRAFT, tone: 'neutral', icon: FilePen },
  PENDING_APPROVAL: { label: PAYMENT_ORDER_STATUS_LABELS.PENDING_APPROVAL, tone: 'warn', icon: Clock },
  APPROVED: { label: PAYMENT_ORDER_STATUS_LABELS.APPROVED, tone: 'ok', icon: CheckCircle2 },
  PAID: { label: PAYMENT_ORDER_STATUS_LABELS.PAID, tone: 'info', icon: Banknote },
  CANCELLED: { label: PAYMENT_ORDER_STATUS_LABELS.CANCELLED, tone: 'neutral', icon: Ban },
};

/** Claves del estado de una recepción (derivado de `cancelled_at`; coinciden con el filtro de la tabla). */
export type ReceiptStatusKey = 'active' | 'cancelled';

/** Recepciones: Vigente / Anulada. Misma fuente para la celda de la tabla, su filtro y la ficha. */
export const RECEIPT_STATUS_UI: Record<ReceiptStatusKey, StatusUi> = {
  active: { label: 'Vigente', tone: 'ok', icon: CheckCircle2 },
  cancelled: { label: 'Anulada', tone: 'danger', icon: Ban },
};
