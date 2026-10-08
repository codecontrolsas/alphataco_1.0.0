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
import { toast } from 'sonner';
import { transformDailyReports } from '../lib/transform';
import { bulkCertifyRows } from '../actions/mutations.server';
import { Logger } from '@/lib/logger';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

type TableRow = ReturnType<typeof transformDailyReports>[number];

const logger = new Logger('BulkCertificacionModal');

interface BulkCertificacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRows: TableRow[];
  onSuccess?: () => void;
}

export function BulkCertificacionModal({ isOpen, onClose, selectedRows, onSuccess }: BulkCertificacionModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async () => {
    if (selectedRows.length === 0) {
      toast.error('Error', { description: 'No hay registros seleccionados.', duration: Infinity });
      return;
    }

    try {
      setIsUpdating(true);

      // Una sola server action: pasa a 'en_certificacion' las filas elegibles.
      const result = await bulkCertifyRows(selectedRows.map((row: TableRow) => row.id));

      toast.success('Éxito', { description: result.skippedIds.length > 0
            ? `Se actualizaron ${result.certified} de ${selectedRows.length} registro(s) a En certificación. ${result.skippedIds.length} no estaban en estado "ejecutado".`
            : `Se actualizaron ${result.certified} registro(s) a En certificación.` });

      // Llamar callback para refrescar datos
      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (error) {
      logger.error('Error al actualizar los registros seleccionados', { data: { error } });
      toast.error('Error', { description: error instanceof Error ? error.message : 'Ocurrió un error al actualizar los registros.', duration: Infinity });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
              {selectedRows.map((row: TableRow) => (
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
          <Button variant="outline" onClick={onClose} disabled={isUpdating}>
            Cancelar
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
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
