import { percentageOrNull } from '@/features/Dashboard/lib/metric';
import { getAllVehicleTypes, getEquipmentIndicators } from '../actions/fleet.server';
import { EquipmentFleetClient } from './EquipmentFleetClient';

const MOTOR_UNIT_TYPES = ['chasis', 'tractor'];

export async function EquipmentFleetSection() {
  // getEquipmentIndicators y getAllVehicleTypes están memoizados por request (clave primitiva), así que
  // se comparten con EquipmentOperationSection cuando no hay filtro de tipos.
  // vehiclesOnRepair loads lazily in dialog via useQuery (bundle-dynamic-imports)
  const [equipmentData, vehicleTypes] = await Promise.all([getEquipmentIndicators(), getAllVehicleTypes()]);

  // IDs de los tipos "motora" (Chasis & Tractor) — para filtrar el modal de disponibles
  const motorTypeIds = vehicleTypes
    .filter((t) => MOTOR_UNIT_TYPES.includes((t.name ?? '').toLowerCase()))
    .map((t) => t.id);

  // Pre-compute fleet metrics with SINGLE LOOP (not 4 separate .reduce())
  let totalActive = 0;
  let totalInUse = 0;
  let totalNotAvailable = 0;

  // Motor units (Chasis & Tractor) — separate metrics
  let motorActive = 0;
  let motorInUse = 0;
  let motorNotAvailable = 0;

  for (const item of equipmentData) {
    totalActive += item.available_units;
    totalInUse += item.used_units;
    totalNotAvailable += item.not_available_units;

    if (MOTOR_UNIT_TYPES.includes(item.type_name.toLowerCase())) {
      motorActive += item.available_units;
      motorInUse += item.used_units;
      motorNotAvailable += item.not_available_units;
    }
  }

  const totalFleet = totalActive + totalNotAvailable;
  // Operatividad = operativos / flota total; Uso = en operaciones / operativos. `null` si no hay base.
  const operativityPercent = percentageOrNull(totalActive, totalFleet);
  const usagePercent = percentageOrNull(totalInUse, totalActive);

  // Motor unit metrics
  const motorFleet = motorActive + motorNotAvailable;
  const motorOperativityPercent = percentageOrNull(motorActive, motorFleet);
  const motorUsagePercent = percentageOrNull(motorInUse, motorActive);

  return (
    <EquipmentFleetClient
      totalActive={totalActive}
      totalNotAvailable={totalNotAvailable}
      totalInUse={totalInUse}
      totalFleet={totalFleet}
      operativityPercent={operativityPercent}
      usagePercent={usagePercent}
      motorActive={motorActive}
      motorInUse={motorInUse}
      motorNotAvailable={motorNotAvailable}
      motorFleet={motorFleet}
      motorOperativityPercent={motorOperativityPercent}
      motorUsagePercent={motorUsagePercent}
      motorTypeIds={motorTypeIds}
    />
  );
}
