import 'server-only';

import type { DiagramAxle } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { calculatePositions } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { StockError } from '@/features/Warehouses/lib/stock-errors';
import { applyTireStatusChange } from '@/features/Warehouses/lib/tire-stock';
import type { Prisma } from '@/generated/prisma/client';
import type { TireStatus } from '@/generated/prisma/enums';
import type { DisplacedTireAction } from '../schemas/axles';

type Tx = Prisma.TransactionClient;

/** Quien mueve el stock de las cubiertas que salen del diagrama. */
export type StockActor = { companyId: string; createdBy: string };

const DESTINATION_STATUS: Record<DisplacedTireAction['destination'], TireStatus> = {
  AVAILABLE: 'AVAILABLE',
  REPAIR: 'IN_REPAIR',
  DISCARD: 'DISCARDED',
};

/** Los depósitos elegidos tienen que ser de la empresa: el id llega del cliente. */
export async function assertWarehousesInCompany(
  tx: Tx,
  companyId: string,
  warehouseIds: Array<string | null | undefined>
): Promise<void> {
  const unique = [...new Set(warehouseIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return;
  const found = await tx.warehouses.count({ where: { id: { in: unique }, company_id: companyId } });
  if (found !== unique.length) {
    throw new StockError('INVALID_INPUT', 'El depósito elegido no pertenece a la empresa');
  }
}

/**
 * Rebuilds vehicle_tire_positions for a given template after axles have been
 * (re)inserted. Preserves tire assignments where position_number matches and
 * applies the caller-supplied destination for any displaced tires.
 */
export async function rebuildPositionsPreservingTires(
  tx: Tx,
  vehicleId: string,
  templateId: string,
  displacedTireActions: DisplacedTireAction[],
  actor: StockActor
) {
  // 1. Capture current tire assignments by position number
  const oldPositions = await tx.vehicle_tire_positions.findMany({
    where: { vehicle_id: vehicleId },
    select: { position_number: true, tire_id: true },
  });

  const tireByPosition = new Map<number, string>();
  for (const pos of oldPositions) {
    if (pos.tire_id) {
      tireByPosition.set(pos.position_number, pos.tire_id);
    }
  }

  // 2. Delete all old positions
  await tx.vehicle_tire_positions.deleteMany({ where: { vehicle_id: vehicleId } });

  // 3. Fetch the newly inserted axles for this template
  const newAxles = await tx.tire_template_axles.findMany({
    where: { template_id: templateId },
    orderBy: { axle_number: 'asc' },
  });

  // 4. Compute new positions
  const diagramAxles: DiagramAxle[] = newAxles.map((a) => ({
    id: a.id,
    axle_number: a.axle_number,
    tires_per_side: a.tires_per_side,
    tire_size: a.tire_size,
    is_drive_axle: a.is_drive_axle,
    is_spare: a.is_spare,
  }));

  const computedPositions = calculatePositions(diagramAxles);
  const axleIdByNumber = new Map(newAxles.map((a) => [a.axle_number, a.id]));

  // 5. Determine which tires land in new positions and which are displaced
  const newPositionNumbers = new Set(computedPositions.map((p) => p.position_number));
  const displacedTireIds = new Set<string>();

  for (const [posNum, tireId] of tireByPosition) {
    if (!newPositionNumbers.has(posNum)) {
      displacedTireIds.add(tireId);
    }
  }

  // 6. Create new positions, preserving tire assignments where position matches
  if (computedPositions.length > 0) {
    await tx.vehicle_tire_positions.createMany({
      data: computedPositions.map((pos) => ({
        vehicle_id: vehicleId,
        template_axle_id: axleIdByNumber.get(pos.axle_number)!,
        position_number: pos.position_number,
        axle_number: pos.axle_number,
        side: pos.side,
        tire_id: tireByPosition.get(pos.position_number) ?? null,
      })),
    });
  }

  // 6.5 Cleanup: borrar overrides de medida cuyo axle_number ya no existe
  const newAxleNumbers = new Set(newAxles.map((a) => a.axle_number));
  await tx.vehicle_axle_tire_sizes.deleteMany({
    where: {
      vehicle_id: vehicleId,
      axle_number: { notIn: [...newAxleNumbers] },
    },
  });

  // 7. Apply destination for displaced tires
  if (displacedTireIds.size === 0) return;

  // Solo se consideran las acciones de cubiertas que realmente salen del diagrama: cualquier otro
  // `tireId` que mande el cliente se ignora.
  const actionMap = new Map(
    displacedTireActions.filter((a) => displacedTireIds.has(a.tireId)).map((a) => [a.tireId, a])
  );
  await assertWarehousesInCompany(
    tx,
    actor.companyId,
    [...actionMap.values()].map((a) => a.warehouseId)
  );

  // Una lectura para todas las cubiertas (acotada a la empresa) en vez de una por cubierta.
  const tires = await tx.tires.findMany({
    where: { id: { in: [...displacedTireIds] }, company_id: actor.companyId },
    select: { id: true, status: true },
  });
  if (tires.length !== displacedTireIds.size) {
    throw new StockError('NOT_FOUND', 'Una de las cubiertas del diagrama no existe en la empresa');
  }

  // El motor de stock mueve cada unidad por separado; los cambios de estado se agrupan por destino.
  const idsByDestination: Record<DisplacedTireAction['destination'], string[]> = {
    AVAILABLE: [],
    REPAIR: [],
    DISCARD: [],
  };
  for (const tire of tires) {
    const action = actionMap.get(tire.id);
    const destination = action?.destination ?? 'AVAILABLE';
    await applyTireStatusChange(tx, actor.companyId, actor.createdBy, {
      tireId: tire.id,
      from: tire.status,
      to: DESTINATION_STATUS[destination],
      warehouseId: action?.warehouseId ?? null,
      notes: 'Quitada al editar el diagrama del equipo',
    });
    idsByDestination[destination].push(tire.id);
  }

  if (idsByDestination.AVAILABLE.length > 0) {
    await tx.tires.updateMany({ where: { id: { in: idsByDestination.AVAILABLE } }, data: { status: 'AVAILABLE' } });
  }
  if (idsByDestination.REPAIR.length > 0) {
    await tx.tires.updateMany({ where: { id: { in: idsByDestination.REPAIR } }, data: { status: 'IN_REPAIR' } });
  }
  if (idsByDestination.DISCARD.length > 0) {
    await tx.tires.updateMany({
      where: { id: { in: idsByDestination.DISCARD } },
      data: { status: 'DISCARDED', discarded_at: new Date() },
    });
  }
}
