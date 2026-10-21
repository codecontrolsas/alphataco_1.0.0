'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Power } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';

import { analyzeDocumentTypeImpact } from '../actions/consistency.server';
import { deactivateDocumentType, hardDeleteDocumentType, reactivateDocumentType } from '../actions/mutations.server';
import type { DocumentTypeListItem } from '../actions/queries.server';

// ============================================
// TIPOS
// ============================================

interface ToggleDocTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: DocumentTypeListItem;
  onSuccess: () => void;
}

type DeactivateOption = 'deactivate_keep' | 'hard_delete';

// ============================================
// SUBCOMPONENTE: CONTENIDO DE DESACTIVACIÓN
// ============================================

interface DeactivateContentProps {
  uploadedCount: number;
  canHardDelete: boolean;
  selectedOption: DeactivateOption;
  onOptionChange: (value: DeactivateOption) => void;
}

function DeactivateContent({ uploadedCount, canHardDelete, selectedOption, onOptionChange }: DeactivateContentProps) {
  return (
    <div className="space-y-4">
      {uploadedCount > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
          <p className="text-sm text-yellow-800">
            Este tipo tiene{' '}
            <Badge variant="outline" className="font-semibold">
              {uploadedCount}
            </Badge>{' '}
            documento{uploadedCount !== 1 ? 's' : ''} subido{uploadedCount !== 1 ? 's' : ''}. No se puede eliminar
            permanentemente; al desactivarlo dejará de exigirse y los documentos se conservan.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Al desactivar el tipo dejará de exigirse a los recursos y se recalculará el estado documental de la empresa.
        </p>
      )}
      <RadioGroup value={selectedOption} onValueChange={(v) => onOptionChange(v as DeactivateOption)}>
        <div className="flex items-start gap-3 rounded-md border p-3">
          <RadioGroupItem value="deactivate_keep" id="deactivate_keep" className="mt-0.5" />
          <Label htmlFor="deactivate_keep" className="cursor-pointer font-normal leading-snug">
            Desactivar el tipo de documento
          </Label>
        </div>
        {canHardDelete ? (
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 p-3">
            <RadioGroupItem
              value="hard_delete"
              id="hard_delete"
              className="mt-0.5 border-destructive text-destructive"
            />
            <Label htmlFor="hard_delete" className="cursor-pointer font-normal leading-snug text-destructive">
              Eliminar permanentemente el tipo
            </Label>
          </div>
        ) : null}
      </RadioGroup>
    </div>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function _ToggleDocTypeDialog({ open, onOpenChange, documentType, onSuccess }: ToggleDocTypeDialogProps) {
  const queryClient = useQueryClient();
  const isDeactivating = documentType.is_active;

  const [deactivateOption, setDeactivateOption] = useState<DeactivateOption>('deactivate_keep');

  const {
    data: impact,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['doc-type-impact', documentType.id],
    queryFn: () => analyzeDocumentTypeImpact(documentType.id),
    enabled: open,
    staleTime: 0,
    // Si el análisis rechaza (tipo inexistente o de otra empresa), reintentar no cambia nada y sólo demora el mensaje.
    retry: false,
  });

  const errorMessage = error ? (error instanceof Error ? error.message : 'No se pudo analizar el impacto') : null;

  const invalidateAndClose = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['doc-types'] });
    onSuccess();
  }, [queryClient, onSuccess]);

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateDocumentType(documentType.id),
    onSuccess: () => {
      toast.success('Tipo de documento desactivado');
      invalidateAndClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Error al desactivar');
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: () => hardDeleteDocumentType(documentType.id),
    onSuccess: () => {
      toast.success('Tipo de documento eliminado permanentemente');
      invalidateAndClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateDocumentType(documentType.id),
    onSuccess: () => {
      toast.success('Tipo de documento activado');
      invalidateAndClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Error al activar');
    },
  });

  const isMutationPending =
    deactivateMutation.isPending || hardDeleteMutation.isPending || reactivateMutation.isPending;

  const handleConfirm = useCallback(() => {
    if (isDeactivating) {
      if (deactivateOption === 'hard_delete') {
        hardDeleteMutation.mutate();
      } else {
        deactivateMutation.mutate();
      }
    } else {
      reactivateMutation.mutate();
    }
  }, [isDeactivating, deactivateOption, hardDeleteMutation, deactivateMutation, reactivateMutation]);

  const isHardDelete = isDeactivating && deactivateOption === 'hard_delete';
  const confirmVariant = isHardDelete ? 'destructive' : isDeactivating ? 'destructive' : 'default';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Power className={`h-4 w-4 ${isDeactivating ? 'text-destructive' : 'text-green-600'}`} />
            {isDeactivating ? 'Desactivar' : 'Activar'} &ldquo;{documentType.name}&rdquo;
          </AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            {isDeactivating
              ? 'Opciones para desactivar el tipo de documento'
              : 'Opciones para activar el tipo de documento'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : errorMessage ? (
            // Sin esto el diálogo quedaba VACÍO cuando el análisis fallaba (el caso típico es un
            // tipo global, que no se edita desde una empresa) y el botón de confirmar seguía
            // habilitado: el usuario apretaba y sólo veía el toast del error de la mutación.
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{errorMessage}</p>
            </div>
          ) : impact ? (
            isDeactivating ? (
              <DeactivateContent
                uploadedCount={impact.uploadedCount}
                canHardDelete={impact.canHardDelete}
                selectedOption={deactivateOption}
                onOptionChange={setDeactivateOption}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Se activará el tipo de documento y volverá a exigirse a los recursos a los que aplique. Los recursos que
                no lo tengan cargado pasarán a figurar como faltantes.
              </p>
            )
          ) : null}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMutationPending}>
            {errorMessage ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            disabled={isLoading || isMutationPending || errorMessage !== null}
          >
            {isMutationPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : isHardDelete ? (
              'Eliminar permanentemente'
            ) : isDeactivating ? (
              'Desactivar'
            ) : (
              'Activar'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
