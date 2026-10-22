'use client';

import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useCallback, useMemo } from 'react';
import {
  getAvailableVehicleSingleFacet,
  getAvailableVehiclesForExport,
  getAvailableVehiclesPaginated,
} from '../actions/fleet-lists.server';
import VehicleListDialog from './VehicleListDialog';

/** Condiciones que entran al listado de disponibles (las mismas que filtra la action). */
const AVAILABLE_CONDITIONS = ['operativo', 'operativo_condicionado'] as const;

const EXPORT_OPTIONS = {
  filename: 'vehiculos-disponibles-sin-asignar',
  sheetName: 'Disponible - Sin asignar',
  title: 'Disponible - Sin asignar',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  typeIds?: string[];
}

export default function AvailableVehiclesDialog({ open, onOpenChange, count, typeIds }: Props) {
  // Consultas server-side (Prisma): apuntan directo a las actions, filtradas por tipo si hay.
  const fetchPage = useCallback(
    (params: DataTableSearchParams) => getAvailableVehiclesPaginated(params, typeIds),
    [typeIds]
  );
  const fetchFacet = useCallback(
    (columnId: string, params: DataTableSearchParams) => getAvailableVehicleSingleFacet(columnId, typeIds, params),
    [typeIds]
  );
  const fetchExport = useCallback(
    (params: DataTableSearchParams) => getAvailableVehiclesForExport(params, typeIds),
    [typeIds]
  );
  const queryKey = useMemo(() => ['dashboard-available-vehicles', ...(typeIds ?? [])], [typeIds]);

  return (
    <VehicleListDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Disponible / Sin asignar (${count})`}
      description="Equipos con condición operativa u operativa condicionada que no están en el parte diario de hoy. La cifra del título es operativos − en operaciones; si difiere del total de la tabla, cuenta equipos con otra condición."
      conditionVariant="success"
      allowedConditions={AVAILABLE_CONDITIONS}
      fetchPage={fetchPage}
      fetchFacet={fetchFacet}
      fetchExport={fetchExport}
      queryKey={queryKey}
      exportOptions={EXPORT_OPTIONS}
      emptyMessage="No hay equipos disponibles"
      paramNamespace="veh-avail-dialog"
    />
  );
}
