'use client';

import { getActiveServiceItems } from '@/features/Empresa/Clientes/actions/service-items.server';
import { fetchContractsByClientId } from '@/features/Equipos/EquipoID/actions/customer-catalog-actions';
import {
  fetchAreasByContract,
  fetchEquipmentsByCustomer,
  fetchSectorsByContract,
} from '@/features/Operaciones/Preparte/actions/form-data.server';
import { useQuery } from '@tanstack/react-query';

/**
 * Hook para obtener contratos por cliente
 * Se activa solo cuando hay un clienteId válido
 */
export function useContratos(clienteId: string | undefined) {
  return useQuery({
    queryKey: ['preparte-contratos', clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      return fetchContractsByClientId(clienteId);
    },
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 10 * 60 * 1000, // 10 minutos en cache
  });
}

/**
 * Hook para obtener items de servicio por contrato
 * Se activa solo cuando hay un contratoId válido
 */
export function useServiceItems(contratoId: string | undefined) {
  return useQuery({
    queryKey: ['preparte-service-items', contratoId],
    queryFn: async () => {
      if (!contratoId) return [];
      return getActiveServiceItems(contratoId);
    },
    enabled: !!contratoId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000, // 10 minutos en cache
  });
}

/**
 * Hook para obtener sectores por contrato
 * Se activa solo cuando hay un contratoId válido
 */
export function useSectors(contratoId: string | undefined) {
  return useQuery({
    queryKey: ['preparte-sectors', contratoId],
    queryFn: async () => {
      if (!contratoId) return [];
      return fetchSectorsByContract(contratoId);
    },
    enabled: !!contratoId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000, // 10 minutos en cache
  });
}

/**
 * Hook para obtener áreas por contrato
 * Se activa solo cuando hay un contratoId válido
 */
export function useAreas(contratoId: string | undefined) {
  return useQuery({
    queryKey: ['preparte-areas', contratoId],
    queryFn: async () => {
      if (!contratoId) return [];
      return fetchAreasByContract(contratoId);
    },
    enabled: !!contratoId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000, // 10 minutos en cache
  });
}

/**
 * Hook para obtener equipos por cliente
 * Se activa solo cuando hay un clienteId válido
 */
export function useEquipments(clienteId: string | undefined) {
  return useQuery({
    queryKey: ['preparte-equipments', clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      return fetchEquipmentsByCustomer(clienteId);
    },
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000, // 10 minutos en cache
  });
}

/**
 * Hook combinado para obtener todas las opciones dependientes del formulario
 * Útil cuando necesitas cargar sectores, áreas y equipos de forma coordinada
 */
export function usePreparteFormDependentOptions(clienteId: string | undefined, contratoId: string | undefined) {
  const sectorsQuery = useSectors(contratoId);
  const areasQuery = useAreas(contratoId);
  const equipmentsQuery = useEquipments(clienteId);

  return {
    sectors: sectorsQuery.data || [],
    areas: areasQuery.data || [],
    equipments: equipmentsQuery.data || [],
    isLoading: sectorsQuery.isLoading || areasQuery.isLoading || equipmentsQuery.isLoading,
    isLoadingSectors: sectorsQuery.isLoading,
    isLoadingAreas: areasQuery.isLoading,
    isLoadingEquipments: equipmentsQuery.isLoading,
    isError: sectorsQuery.isError || areasQuery.isError || equipmentsQuery.isError,
  };
}
