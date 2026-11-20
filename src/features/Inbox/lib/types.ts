/**
 * Contrato de Mi bandeja: lo que cada módulo le debe al usuario como DECISIÓN (o aviso), en una sola lista.
 * Módulo sin directiva: lo importan servidor y cliente. Todo lo que cruza a un componente de cliente es serializable.
 */

export type InboxActionId = 'approve' | 'reject' | 'reassign' | 'open' | 'validate';

/** Acción posible sobre un ítem. Si el usuario no tiene permiso para una acción de decisión, directamente no se lista. */
export interface InboxAction {
  id: InboxActionId;
  enabled: boolean;
  /** Por qué está deshabilitada (se muestra y se asocia con `aria-describedby`). */
  disabledReason?: string;
}

export interface InboxItem {
  /** `${providerId}:${type}:${entityId}` */
  id: string;
  providerId: string;
  moduleSlug: string;
  /** task_authorization | task_reassignment | order_validation | order_returned */
  type: string;
  /** `decision` suma al contador; `info` es solo un aviso. */
  kind: 'decision' | 'info';
  title: string;
  context: string;
  /** Quién lo pidió o lo devolvió (nombre de usuario). */
  requestedBy?: string;
  /** ISO. Se omite si la fuente no trae fecha (nunca se inventa una). */
  createdAt?: string;
  actions: InboxAction[];
  /** Dónde se ve el detalle fuera de la bandeja. */
  href: string;
  /** Id de la entidad sobre la que actúan las acciones (tarea u orden). */
  entityId: string;
  /** Identificación del equipo (patente, serie o N° interno), su número interno y si es un vehículo u otro equipo. */
  resource?: { kind: 'vehicle' | 'equipment'; identifier: string; internNumber?: string | null };
  /** Número de la orden de mantenimiento o de la OT. */
  reference?: string;
  /** Chip de contexto (sector, motivo de la devolución…). */
  badge?: string;
  /** Cita del operario, del chofer o motivo de una devolución. */
  quote?: { label: string; text: string; tone: 'warn' | 'danger' };
  /** OT cuyo historial se puede abrir. */
  workOrderId?: string | null;
  /** Orden cuyo detalle se abre en la bandeja. */
  orderId?: string;
}

/** Una categoría de un proveedor (ej. «Autorizaciones»), con sus ítems ya recortados y el total real. */
export interface InboxSection {
  type: string;
  label: string;
  description: string;
  kind: 'decision' | 'info';
  emptyTitle: string;
  emptyDescription: string;
  /** Total real de la categoría (puede ser mayor que `items.length`: tope por categoría). */
  total: number;
  items: InboxItem[];
  /** La consulta de esta categoría falló: se muestra el error con «Reintentar» y las demás siguen. */
  error?: string;
}

export interface InboxGroup {
  providerId: string;
  moduleSlug: string;
  label: string;
  sections: InboxSection[];
  /** El proveedor entero falló. */
  error?: string;
}

export interface InboxData {
  groups: InboxGroup[];
  /** Suma de las categorías de decisión de todos los proveedores. */
  decisionCount: number;
}

export interface InboxCtx {
  companyId: string;
  /** Mapa `modulo:tab:accion -> boolean` del usuario. */
  permissions: Readonly<Record<string, boolean>>;
  /** Tipos de equipamiento ocultos para el usuario (ticket 690). */
  hiddenTypeIds: readonly string[];
}

export interface InboxFetchOptions {
  /** Tope de ítems por categoría. */
  limit: number;
  /** Solo esta categoría (`type` del ítem). */
  type?: string;
}

export interface InboxProvider {
  id: string;
  moduleSlug: string;
  label: string;
  /** Sin base de datos: solo mira los permisos. */
  isEnabled(permissions: Readonly<Record<string, boolean>>): boolean;
  /** Cantidad de DECISIONES pendientes (no cuenta los avisos). Usa el mismo `where` que la lista. */
  countPending(ctx: InboxCtx): Promise<number>;
  fetchPending(ctx: InboxCtx, opts: InboxFetchOptions): Promise<InboxSection[]>;
}

/** Tope de ítems por categoría en la bandeja; «Ver todo» (`?type=`) lo levanta. */
export const INBOX_SECTION_LIMIT = 50;
export const INBOX_SECTION_LIMIT_ALL = 500;
