'use client';

import { getChecklistIdsForSubType } from '@/features/Empresa/Equipos/EquipmentSubTypes/actions.server';
import { useQuery } from '@tanstack/react-query';

/**
 * Hook para obtener los IDs de checklists asignados a un subtipo.
 * Migrado de supabaseBrowser a server action con Prisma.
 */
export function useSubTypeChecklists(subTypeId: string | null) {
  return useQuery({
    queryKey: ['subtype-checklists', subTypeId],
    queryFn: () => getChecklistIdsForSubType(subTypeId!),
    enabled: !!subTypeId,
    // Alimenta el form y la base del delta {add, remove}: siempre datos frescos al abrir.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
