'use client';

import {
  getRepairVehicleSingleFacet,
  getRepairVehiclesForExport,
  getRepairVehiclesPaginated,
} from '../actions/fleet-lists.server';
import VehicleListDialog from './VehicleListDialog';

/** Condiciones que entran al listado de fuera de servicio (las mismas que filtra la action). */
const OUT_OF_SERVICE_CONDITIONS = ['no_operativo', 'en_reparacion', 'en_preparacion'] as const;

const EXPORT_OPTIONS = {
  filename: 'vehiculos-fuera-de-servicio',
  sheetName: 'Fuera de servicio',
  title: 'Equipos fuera de servicio',
};

const QUERY_KEY = ['dashboard-repair-vehicles'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
}

export default function VehiclesOnRepairDialog({ open, onOpenChange, count }: Props) {
  return (
    <VehicleListDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Equipos fuera de servicio (${count})`}
      description="Equipos activos con condición no operativo, en reparación o en preparación."
      conditionVariant="destructive"
      allowedConditions={OUT_OF_SERVICE_CONDITIONS}
      fetchPage={getRepairVehiclesPaginated}
      fetchFacet={getRepairVehicleSingleFacet}
      fetchExport={getRepairVehiclesForExport}
      queryKey={QUERY_KEY}
      exportOptions={EXPORT_OPTIONS}
      emptyMessage="No hay equipos fuera de servicio"
      paramNamespace="veh-repair-dialog"
    />
  );
}
