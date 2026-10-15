import 'server-only';

/**
 * Select del listado de órdenes (paso "En Taller").
 *
 * Solo trae lo que consumen `columns.tsx` (progreso, sector actual, necesidades, recurso) y
 * `RequestedItemsDialog` (ítems solicitados con fotos). El detalle completo de la orden se pide aparte
 * (`OrderDetailDialog` / `getOrderForManagement`), por eso no se arrastran más campos por fila.
 */
export const MAINTENANCE_ORDERS_SELECT = {
  id: true,
  order_number: true,
  status: true,
  description: true,
  workshop_entry_date: true,
  created_at: true,
  equipment_id: true,
  other_equipment_id: true,
  vehicles: {
    select: { id: true, domain: true, serie: true, intern_number: true },
  },
  // Ticket 596: el pedido puede ser de un equipamiento en vez de un vehiculo
  other_equipment: {
    select: { id: true, serial_number: true, intern_number: true },
  },
  // Solo la descripción de respaldo que muestra la columna "Descripción"
  maintenance_requests: {
    select: { description: true },
  },
  // Items para calcular progreso y sector actual, y mostrar items solicitados
  maintenance_order_items: {
    select: {
      id: true,
      assigned_sector_id: true,
      sector_sequence_order: true,
      is_diagnostico: true,
      // Estado `rejected` del recorrido por sectores (un ítem rechazado no cuenta como trabajo)
      is_rejected: true,
      is_critical: true,
      description: true,
      // Ticket 592: fotos que cargo el supervisor al pedir la reparacion
      images: true,
      types_of_repairs: { select: { id: true, name: true } },
      maintenance_order_item_repair_types: {
        select: { types_of_repairs: { select: { id: true, name: true } } },
      },
      maintenance_request_items: {
        select: {
          // Ticket 592: un item cargado a mano no tiene desvio de checklist —
          // su titulo vive en free_text y su aclaracion/fotos en la solicitud
          free_text: true,
          description: true,
          images: true,
          checklist_deviations: { select: { id: true, item_code: true, item_label: true } },
        },
      },
      workshop_sectors: {
        select: { id: true, name: true },
      },
      // Solo el estado de cada reparación (la columna Progreso cuenta completadas / activas)
      work_orders: {
        select: {
          work_order_items: {
            select: {
              work_order_item_repairs: { select: { status: true } },
            },
          },
        },
      },
    },
  },
} as const;
