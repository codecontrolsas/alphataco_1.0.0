import { percentageOrNull } from '@/features/Dashboard/lib/metric';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { getAllVehicleTypes, getEquipmentIndicators } from '../actions/fleet.server';
import type { EquipmentIndicatorResult } from '../actions/types';
import { getOperationToday } from '../lib/dashboard-dates';
import { availableUnits } from '../lib/indicators';
import { VEHICLE_TYPES_PARAM, parseUrlIdList } from '../lib/url-list';
import { EquipmentOperationClient } from './EquipmentOperationClient';

export async function EquipmentOperationSection({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // Filtro de tipos en la URL (`?tipos_equipo=`): se comparte con el link y no vence.
  const typeIds = parseUrlIdList(searchParams[VEHICLE_TYPES_PARAM]);
  const initialFilterValues = typeIds ?? [];

  // async-parallel — only indicators + types for SSR; vehicle detail loads lazily in dialog
  const [equipmentData, vehicleTypes] = await Promise.all([getEquipmentIndicators(typeIds), getAllVehicleTypes()]);

  const date = formatDateAr(getOperationToday());

  // server-serialization — pre-compute with SINGLE LOOP (js-combine-iterations)
  let totalActive = 0;
  let totalInUse = 0;
  let totalCancelled = 0;
  let totalNotAvailable = 0;
  let totalAvailable = 0;

  for (const item of equipmentData) {
    totalActive += item.available_units;
    totalInUse += item.used_units;
    totalCancelled += item.cancelled_units;
    totalNotAvailable += item.not_available_units;
    totalAvailable += availableUnits(item);
  }

  const totalVehicles = totalActive + totalNotAvailable;
  // Operatividad = operativos / flota total (equipos activos); `null` sin flota.
  const operativityPercentage = percentageOrNull(totalActive, totalVehicles);

  // Build stacked bar chart data: Disponibles / Fuera de Servicio / Trabajando
  const chartData = equipmentData
    .map((item: EquipmentIndicatorResult) => {
      const name = item.type_name;
      const shortName = name.length > 20 ? name.substring(0, 20) + '...' : name;
      return {
        name,
        shortName,
        disponibles: availableUnits(item),
        fueraDeServicio: item.not_available_units,
        trabajando: item.used_units,
        cancelados: item.cancelled_units,
      };
    })
    .slice(0, 8);

  return (
    <EquipmentOperationClient
      date={date}
      chartData={chartData}
      totalTypes={equipmentData.length}
      totalActive={totalActive}
      totalInUse={totalInUse}
      totalCancelled={totalCancelled}
      totalAvailable={totalAvailable}
      totalFleet={totalVehicles}
      operativityPercentage={operativityPercentage}
      typeIds={typeIds}
      vehicleTypes={vehicleTypes.map((t) => ({ label: t.name ?? '', value: t.id }))}
      initialFilterValues={initialFilterValues}
    />
  );
}
