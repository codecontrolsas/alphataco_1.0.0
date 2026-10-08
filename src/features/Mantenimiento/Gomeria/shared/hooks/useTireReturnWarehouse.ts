'use client';

import { getTireReturnWarehousesForVehicle } from '@/features/Mantenimiento/Gomeria/Ordenes/actions/actions.server';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Depósito al que vuelven las cubiertas con stock que pasan a disponibles (Almacenes etapa 6).
 * Con un solo depósito activo viene elegido; con varios, el usuario elige (`needsChoice`).
 */
export function useTireReturnWarehouse(vehicleId: string, enabled = true) {
  const [selectedId, setSelectedId] = useState('');
  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['tire-return-warehouses', vehicleId],
    queryFn: () => getTireReturnWarehousesForVehicle(vehicleId),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  const warehouseId = selectedId || (warehouses.length === 1 ? warehouses[0]!.id : '');
  return {
    warehouses,
    isLoading,
    warehouseId,
    setWarehouseId: setSelectedId,
    needsChoice: warehouses.length > 1,
  };
}
