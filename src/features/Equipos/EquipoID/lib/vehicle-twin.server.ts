import 'server-only';

import { loadEquipmentPermanentRows } from '@/features/Documentacion/DocumentosEquipos/lib/permanent-list.server';
import { toDiagramPosition } from '@/features/Mantenimiento/Gomeria/shared/iso/diagram-position';
import { getStatusLabel } from '@/features/Mantenimiento/lib/status-presentation';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getVehicleTirePositionsWithDetails } from '../components/vehicle-tires/actions/positions.server';
import { TERMINAL_ORDER_STATUSES } from './pending-maintenance';
import {
  classifyVehicle,
  orderNeedsAttention,
  type TwinDeviations,
  type TwinDocuments,
  type TwinHitch,
  type TwinOrders,
  type TwinTires,
  type TwinZoneId,
  type VehicleTwinData,
} from './vehicle-twin';

const logger = new Logger('features/Equipos/vehicle-twin');

/** Pestaña de permisos (módulo, slug) detrás de cada zona. */
const ZONE_PERMISSION: Record<TwinZoneId, [string, string] | null> = {
  tires: ['equipos', 'cubiertas-equipo'],
  documents: ['documentacion', 'documentos-de-equipos'],
  checklists: ['equipos', 'checklist-equipo'],
  maintenance: ['equipos', 'historial-mantenimiento-equipo'],
  hitch: null,
};

interface TwinVehicle {
  id: string;
  domain: string | null;
  type: { id: string; name: string; has_hitch: boolean | null; is_tractor_unit: boolean | null };
  sub_type: { name: string } | null;
  brand_vehicles: { name: string | null } | null;
  model_vehicles: { name: string | null } | null;
}

/** Sección que falla no tumba el gemelo: la zona queda "sin dato". */
async function safely<T>(name: string, task: Promise<T>): Promise<T | null> {
  try {
    return await task;
  } catch (error) {
    logger.warn(`No se pudo cargar ${name} del gemelo`, { data: { error } });
    return null;
  }
}

async function loadDocuments(equipmentId: string): Promise<TwinDocuments> {
  const rows = await loadEquipmentPermanentRows(equipmentId);
  const out: TwinDocuments = { overdue: 0, expiringSoon: 0, missing: 0, rejected: 0, inReview: 0, ok: 0 };
  for (const row of rows) {
    if (row.notApplicable) continue;
    if (row.isMissing) out.missing += 1;
    else if (row.state === 'vencido') out.overdue += 1;
    else if (row.state === 'rechazado') out.rejected += 1;
    else if (row.state === 'presentado') out.inReview += 1;
    else if (row.expiringSoon) out.expiringSoon += 1;
    else out.ok += 1;
  }
  return out;
}

async function loadDeviations(equipmentId: string, now: Date): Promise<TwinDeviations> {
  // Pendiente = sin solicitud de mantenimiento (misma regla que la lista de equipos con desvíos).
  const rows = await prisma.checklist_deviations.findMany({
    where: { equipment_id: equipmentId, maintenance_request_items: { none: {} } },
    select: { is_critical: true, created_at: true },
  });
  let oldest: number | null = null;
  for (const row of rows) {
    if (!row.created_at) continue;
    const days = Math.floor((now.getTime() - row.created_at.getTime()) / 86_400_000);
    if (oldest === null || days > oldest) oldest = days;
  }
  return { total: rows.length, critical: rows.filter((r) => r.is_critical === true).length, oldestDays: oldest };
}

async function loadOrders(equipmentId: string, now: Date): Promise<TwinOrders> {
  const rows = await prisma.maintenance_orders.findMany({
    where: { equipment_id: equipmentId, status: { notIn: TERMINAL_ORDER_STATUSES } },
    select: { status: true, created_at: true, workshop_entry_date: true },
  });
  const byStatus = new Map<string, number>();
  let attention = 0;
  for (const row of rows) {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    if (orderNeedsAttention(row, now)) attention += 1;
  }
  return {
    total: rows.length,
    attention,
    byStatus: [...byStatus.entries()].map(([status, count]) => ({ label: getStatusLabel('order', status), count })),
  };
}

async function loadTires(equipmentId: string): Promise<TwinTires> {
  const positions = await getVehicleTirePositionsWithDetails(equipmentId);
  const axleMap = new Map<string, TwinTires['axles'][number]>();
  for (const pos of positions) {
    const axle = pos.template_axle;
    if (!axle || axleMap.has(axle.id)) continue;
    axleMap.set(axle.id, {
      id: axle.id,
      axle_number: axle.axle_number,
      tires_per_side: axle.tires_per_side,
      tire_size: axle.tire_size,
      is_drive_axle: axle.is_drive_axle,
      is_spare: axle.is_spare,
    });
  }
  return { axles: [...axleMap.values()], positions: positions.map(toDiagramPosition) };
}

/** Tipos con los que el equipo puede acoplarse (tractor -> remolcados, o remolcado -> tractores). */
async function loadHitch(vehicle: TwinVehicle): Promise<TwinHitch> {
  const { type } = vehicle;
  if (!type.has_hitch) return { capable: false, compatibleTypes: [] };
  const rows = type.is_tractor_unit
    ? await prisma.type_hitch_types.findMany({
        where: { type_id: type.id },
        select: { type_type_hitch_types_compatible_type_idTotype: { select: { name: true } } },
      })
    : await prisma.type_hitch_types.findMany({
        where: { compatible_type_id: type.id },
        select: { type_type_hitch_types_type_idTotype: { select: { name: true } } },
      });
  const names = rows.map((row) =>
    'type_type_hitch_types_compatible_type_idTotype' in row
      ? row.type_type_hitch_types_compatible_type_idTotype.name
      : row.type_type_hitch_types_type_idTotype.name
  );
  return { capable: true, compatibleTypes: [...new Set(names)] };
}

/**
 * Datos del gemelo: todo en paralelo y por equipo (sin N+1), y cada sección solo si el usuario puede
 * verla. El mapa de permisos ya lo trae la ficha; las filas de documentos comparten la caché por
 * request con la pestaña Documentación.
 */
export async function loadVehicleTwinData(
  vehicle: TwinVehicle,
  permissions: Readonly<Record<string, boolean>>
): Promise<VehicleTwinData> {
  const isVisible = createTabVisibilityChecker(permissions);
  const access = Object.fromEntries(
    (Object.keys(ZONE_PERMISSION) as TwinZoneId[]).map((id) => {
      const slug = ZONE_PERMISSION[id];
      return [id, slug === null ? true : isVisible(slug[0], slug[1])];
    })
  ) as Record<TwinZoneId, boolean>;

  const now = new Date();
  const [tires, documents, deviations, orders, hitch] = await Promise.all([
    access.tires ? safely('cubiertas', loadTires(vehicle.id)) : null,
    access.documents ? safely('documentos', loadDocuments(vehicle.id)) : null,
    access.checklists ? safely('desvíos', loadDeviations(vehicle.id, now)) : null,
    access.maintenance ? safely('órdenes', loadOrders(vehicle.id, now)) : null,
    safely('enganche', loadHitch(vehicle)),
  ]);

  const name = [vehicle.brand_vehicles?.name, vehicle.model_vehicles?.name].filter(Boolean).join(' ');
  return {
    label: [vehicle.domain, name].filter(Boolean).join(' · ') || 'Equipo',
    category: classifyVehicle({
      typeName: vehicle.type.name,
      subTypeName: vehicle.sub_type?.name,
      isTractorUnit: vehicle.type.is_tractor_unit,
      hasHitch: vehicle.type.has_hitch,
    }),
    typeName: vehicle.type.name,
    tires,
    hitch: hitch ?? { capable: false, compatibleTypes: [] },
    documents,
    deviations,
    orders,
    access,
    canEditTires: permissions['equipos:cubiertas-equipo:update'] === true,
  };
}
