import type { BoardColumnId } from './types';

/**
 * Columnas del tablero. Cada una se muestra solo con el `view` de la pestaña (módulo `mantenimiento`) del paso
 * equivalente de Taller: son las mismas que usa `TallerPipelineContent` para sus pasos.
 */
export interface BoardColumnDef {
  id: BoardColumnId;
  label: string;
  description: string;
  /** Pestaña de `mantenimiento` cuyo `view` habilita la columna. */
  tab: string;
  statuses: readonly string[];
  emptyTitle: string;
  emptyDescription: string;
}

export const BOARD_COLUMNS: readonly BoardColumnDef[] = [
  {
    id: 'scheduling',
    label: 'Programación',
    description: 'Pedidos aprobados que esperan su fecha de taller.',
    tab: 'pedidos_pendientes',
    // Mismo criterio que la pestaña "Programación pendiente" (su vista por defecto y su contador):
    // PENDING_LIST_DEFAULT_STATUS. Los `scheduled` solo aparecen ahí filtrando a mano.
    statuses: ['pending_scheduling'],
    emptyTitle: 'No hay pedidos para programar.',
    emptyDescription: 'Aparecen cuando operaciones aprueba un pedido y todavía no tiene fecha de taller.',
  },
  {
    id: 'confirmed',
    label: 'Para ingreso',
    description: 'Pedidos con fecha asignada que esperan al equipo.',
    tab: 'pedidos_confirmados',
    statuses: ['date_confirmed'],
    emptyTitle: 'No hay pedidos esperando ingreso.',
    emptyDescription: 'Aparecen cuando un pedido tiene fecha de recepción y el equipo todavía no ingresó.',
  },
  {
    id: 'in_workshop',
    label: 'En taller',
    description: 'Equipos dentro del taller, incluidas las órdenes devueltas.',
    tab: 'ordenes_mantenimiento',
    statuses: ['in_workshop', 'workshop_rejected', 'operations_rejected'],
    emptyTitle: 'No hay equipos en el taller.',
    emptyDescription: 'Aparecen cuando se registra el ingreso de un equipo al taller.',
  },
  {
    id: 'validation',
    label: 'Esperan validación',
    description: 'Órdenes con todas sus OT terminadas que esperan revisión.',
    tab: 'ordenes_mantenimiento',
    statuses: ['pending_workshop_validation', 'pending_operations_validation'],
    emptyTitle: 'No hay órdenes esperando validación.',
    emptyDescription: 'Aparecen cuando todas las OT de una orden quedan terminadas.',
  },
];

/** Estados que se muestran con el chip «Devuelta». */
export const RETURNED_STATUSES: readonly string[] = ['workshop_rejected', 'operations_rejected'];

/** Pestañas que habilitan el tablero: alcanza con ver alguna columna. */
export const BOARD_VIEW_TABS = [...new Set(BOARD_COLUMNS.map((column) => column.tab))];
