'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createRemito, deleteRemito, getAvailableRemitosForLinking, getRemitosWithDocuments, linkExistingRemito, unlinkRemito } from '../actions/remitos.server';

export const remitoQueryKeys = {
  all: ['remitos'] as const,
  byRowId: (rowId: string) => ['remitos', rowId] as const,
};

export function useRemitos(dailyReportRowId: string) {
  return useQuery({
    queryKey: remitoQueryKeys.byRowId(dailyReportRowId),
    queryFn: () => getRemitosWithDocuments(dailyReportRowId),
    staleTime: 5 * 60 * 1000,
    enabled: !!dailyReportRowId,
  });
}

export function useCreateRemito(dailyReportRowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (remitNumber: string) => createRemito(dailyReportRowId, remitNumber),
    onSuccess: (newRemito) => {
      queryClient.invalidateQueries({
        queryKey: remitoQueryKeys.byRowId(dailyReportRowId),
      });
      toast.success(`Remito ${newRemito.remit_number} creado`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al crear el remito');
    },
  });
}

export function useDeleteRemito(dailyReportRowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (remitId: string) => deleteRemito(remitId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: remitoQueryKeys.byRowId(dailyReportRowId),
      });
      toast.success('Remito eliminado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al eliminar el remito');
    },
  });
}

export function useUnlinkRemito(dailyReportRowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (remitId: string) => unlinkRemito(remitId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: remitoQueryKeys.byRowId(dailyReportRowId),
      });
      toast.success('Remito desvinculado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al desvincular el remito');
    },
  });
}

export function useRemitosStats(dailyReportRowId: string) {
  const { data: remitos = [] } = useRemitos(dailyReportRowId);

  return {
    totalRemitos: remitos.length,
    remitosWithDocuments: remitos.filter((r) => r.remito_documents.length > 0).length,
    remitosWithoutDocuments: remitos.filter((r) => r.remito_documents.length === 0).length,
    totalDocuments: remitos.reduce((acc, r) => acc + r.remito_documents.length, 0),
  };
}

export function useAvailableRemitosForLinking(currentDailyReportRowId: string, searchQuery?: string) {
  return useQuery({
    queryKey: ['available-remitos', currentDailyReportRowId, searchQuery],
    queryFn: () => getAvailableRemitosForLinking(currentDailyReportRowId, searchQuery),
    staleTime: 5 * 60 * 1000,
    enabled: !!currentDailyReportRowId,
  });
}

export function useLinkExistingRemito(targetDailyReportRowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceRemitId: string) => linkExistingRemito(sourceRemitId, targetDailyReportRowId),
    onSuccess: (newRemito) => {
      queryClient.invalidateQueries({
        queryKey: remitoQueryKeys.byRowId(targetDailyReportRowId),
      });
      toast.success(`Remito ${newRemito.remit_number} vinculado exitosamente`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al vincular el remito');
    },
  });
}
