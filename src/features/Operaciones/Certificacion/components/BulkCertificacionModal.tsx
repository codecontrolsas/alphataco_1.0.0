'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { bulkCertifyRows } from '../actions/mutations.server';
import type { CertificationRow } from '../actions/queries.server';
import { Logger } from '@/lib/logger';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';

const logger = new Logger('BulkCertificacionModal');

interface BulkCertificacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRows: CertificationRow[];
  onSuccess?: () => void;
}

export function BulkCertificacionModal({ isOpen, onClose, selectedRows, onSuccess }: BulkCertificacionModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async () => {
    if (selectedRows.length === 0) {
      toast({
        title: 'Error',
        description: 'No hay registros seleccionados.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUpdating(true);

      // Una sola server action: pasa a 'en_certificacion' las filas elegibles.
      const result = await bulkCertifyRows(selectedRows.map((row: CertificationRow) => row.id));

      toast({
        title: 'Éxito',
        description:
          result.skippedIds.length > 0
            ? `Se actualizaron ${result.certified} de ${selectedRows.length} registro(s) a En certificación. ${result.skippedIds.length} no estaban en estado "ejecutado".`
            : `Se actualizaron ${result.certified} registro(s) a En certificación.`,
      });

      // Llamar callback para refrescar datos
      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (error) {
      logger.error('Error al actualizar los registros seleccionados', { data: { error } });
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Ocurrió un error al actualizar los registros.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Actualización masiva a En certificación</DialogTitle>
          <DialogDescription>
            Se cambiará el estado de {selectedRows.length} registro(s) seleccionado(s) a En certificación.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="max-h-[300px] overflow-y-auto mb-4 border rounded-md p-2">
            <ul className="text-sm space-y-1">
              {selectedRows.map((row: CertificationRow) => (
                <li key={row.id} className="p-2 bg-muted rounded-md flex justify-between items-center">
                  <span className="font-medium">{row.customer}</span>
                  <span className="text-muted-foreground text-xs">
                    {row.services} - {row.item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isUpdating}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleUpdate} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Actualizando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirmar actualización
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
