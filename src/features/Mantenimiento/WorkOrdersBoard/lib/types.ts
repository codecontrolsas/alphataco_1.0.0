/**
 * Modelo del tablero de órdenes de Taller (778, F4). Módulo sin directiva: lo importan el servidor y el cliente.
 * Todo lo que cruza a un componente de cliente es serializable.
 */

export type BoardColumnId = 'scheduling' | 'confirmed' | 'in_workshop' | 'validation';

export interface BoardCardData {
  id: string;
  /** `null` mientras la orden no ingresó: todavía no tiene número. */
  orderNumber: string | null;
  status: string;
  /** Patente, serie o N° interno del equipo, y su número interno. */
  resource: { kind: 'vehicle' | 'equipment'; identifier: string; internNumber: string | null };
  /** Fecha que ordena la columna (ISO): aprobación, fecha de recepción, ingreso o último cambio. */
  date: string | null;
  /** Qué significa `date` en esta columna ("Aprobado", "Recepción", "Ingreso", "Actualizado"). */
  dateLabel: string;
  /** `date` es solo día (columna `@db.Date`) o un instante. */
  dateKind: 'day' | 'instant';
  /** Días desde `date` hasta hoy (calculados en el servidor, hora argentina). */
  ageDays: number | null;
  /** Sectores asignados a los ítems de la orden (hasta 3). */
  sectors: string[];
  /** Chip «Devuelta»: el taller o Operaciones la rechazaron y volvió a taller. */
  returned: boolean;
}

export interface BoardColumnData {
  id: BoardColumnId;
  label: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Total REAL de la columna (puede ser mayor que `items.length`). `null` si falló. */
  total: number | null;
  items: BoardCardData[];
  /** La consulta de esta columna falló: se muestra el error con «Reintentar» y las demás siguen. */
  error?: string;
}

export interface BoardData {
  columns: BoardColumnData[];
}

/** Tope de tarjetas por columna. */
export const BOARD_COLUMN_LIMIT = 50;
