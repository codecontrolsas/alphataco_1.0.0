import type { OrderChangeSet } from '../../schemas/order-changes';
import type { OrderManagementItem } from '../../actions/queries.server';

type OrderItem = OrderManagementItem['maintenance_order_items'][number];

/** Ítem del pedido tal como lo maneja el wizard (con marcas de estado local). */
export interface LocalItem {
  id: string;
  description: string | null;
  is_diagnostico: boolean;
  maintenance_request_item_id: string | null;
  repair_type_id: string | null;
  assigned_sector_id: string | null;
  assigned_workshop_id: string | null;
  sector_sequence_order: number | null;
  types_of_repairs: OrderItem['types_of_repairs'];
  maintenance_order_item_repair_types: OrderItem['maintenance_order_item_repair_types'];
  maintenance_request_items: OrderItem['maintenance_request_items'];
  workshop_sectors: OrderItem['workshop_sectors'];
  /**
   * Fotos que cargo el supervisor (ticket 592). Sin esto el wizard no las
   * arrastraba al estado local y el jefe de taller decidia el sector a ciegas.
   */
  images: OrderItem['images'];
  /** Grupo de reparaciones del que salio el item, para mostrarlo en los listados */
  maintenance_request_groups: OrderItem['maintenance_request_groups'];
  work_order_id: string | null;
  workshop_chief_comment: string | null;
  _isTemp?: boolean;
  _tempRepairTypeIds?: string[];
  _deleted?: boolean;
  _rejected?: boolean;
  _rejectionReason?: string;
}

/** Mapea un ítem del servidor al estado local (única copia: antes estaba duplicada). */
export function mapOrderItemToLocal(item: OrderItem): LocalItem {
  return {
    id: item.id,
    description: item.description,
    is_diagnostico: item.is_diagnostico,
    maintenance_request_item_id: item.maintenance_request_item_id,
    repair_type_id: item.repair_type_id,
    assigned_sector_id: item.assigned_sector_id,
    assigned_workshop_id: item.assigned_workshop_id,
    sector_sequence_order: item.sector_sequence_order,
    types_of_repairs: item.types_of_repairs,
    maintenance_order_item_repair_types: item.maintenance_order_item_repair_types,
    maintenance_request_items: item.maintenance_request_items,
    workshop_sectors: item.workshop_sectors,
    images: item.images,
    maintenance_request_groups: item.maintenance_request_groups,
    work_order_id: item.work_order_id,
    workshop_chief_comment: item.workshop_chief_comment,
    _rejected: item.is_rejected || false,
    _rejectionReason: item.rejection_reason || undefined,
  };
}

export function emptyChanges(): OrderChangeSet {
  return {
    deletes: [],
    adds: [],
    sectorAssignments: [],
    repairTypeUpdates: [],
    sequenceUpdates: [],
    descriptionUpdates: [],
    chiefCommentUpdates: [],
    workshopAssignments: [],
    rejections: [],
    restorations: [],
  };
}

/** Tipos de reparación de un ítem según lo que el servidor devolvió (pivot, o el campo legacy). */
export function serverRepairTypeIds(item: LocalItem): string[] {
  const pivot = (item.maintenance_order_item_repair_types || [])
    .map((rt) => rt.repair_type_id)
    .filter((id): id is string => !!id);
  if (pivot.length > 0) return pivot;
  return item.repair_type_id ? [item.repair_type_id] : [];
}

/** Baseline por ítem: lo que el servidor tenía al cargar. Las bajas se calculan contra esto. */
export function buildRepairTypeBaseline(items: LocalItem[]): Map<string, string[]> {
  return new Map(items.map((item) => [item.id, serverRepairTypeIds(item)]));
}
