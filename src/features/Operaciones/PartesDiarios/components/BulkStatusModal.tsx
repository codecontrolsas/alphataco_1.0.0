import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Logger } from '@/lib/logger';
import moment from 'moment';
import { useEffect, useState } from 'react';
import { updateMultipleDailyReportStatus } from '../actions/mutations.server';
import { getDailyReportsForCurrentMonth } from '../actions/queries.server';

interface BulkStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRows: Awaited<ReturnType<typeof getDailyReportsForCurrentMonth>>;
  onSuccess?: () => void;
}

const logger = new Logger('PartesDiarios/BulkStatusModal');

export function BulkStatusModal({ isOpen, onClose, selectedRows, onSuccess }: BulkStatusModalProps) {
  const [status, setStatus] = useState<string>('');
  const [confirmedBy, setConfirmedBy] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Reiniciar formulario al abrir/cerrar el modal
  useEffect(() => {
    if (!isOpen) {
      setStatus('');
      setConfirmedBy('');
    }
  }, [isOpen]);

  // Verificar si el formulario es válido
  const isFormValid = () => {
    if (!status) return false;
    // Si el estado es ejecutado, verificar que esté presente el confirmante
    if (status === 'ejecutado' && !confirmedBy.trim()) {
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!isFormValid()) {
      toast.error('Error', { description: 'Por favor selecciona un estado.', duration: Infinity });
      return;
    }

    try {
      setIsLoading(true);

      // Obtener los IDs de los partes diarios seleccionados
      const selectedIds = selectedRows.map((row) => row.id);

      // Actualizar el estado de todos los partes diarios seleccionados
      await updateMultipleDailyReportStatus(selectedIds, status);

      toast.success('Éxito', { description: `Se actualizó el estado de ${selectedRows.length} parte${selectedRows.length > 1 ? 's' : ''} diario${selectedRows.length > 1 ? 's' : ''} a "${status}".` });

      // Llamar onSuccess para refrescar la tabla
      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (error) {
      logger.error('Error al actualizar los estados seleccionados', { data: { error } });
      toast.error('Error', { description: 'Ocurrió un error al actualizar los estados.', duration: Infinity });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Cambiar estado masivamente</DialogTitle>
          <DialogDescription>
            Estás cambiando el estado de {selectedRows.length} parte{selectedRows.length > 1 ? 's' : ''} diario
            {selectedRows.length > 1 ? 's' : ''} seleccionado{selectedRows.length > 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Lista de partes diarios seleccionados */}
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Partes diarios seleccionados:</h4>
            <div className="max-h-[150px] overflow-y-auto border rounded-md p-2">
              <ul className="text-sm space-y-1">
                {selectedRows.map((row) => (
                  <li key={row.id} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-md flex justify-between">
                    <span>{moment.utc(row.date).format('DD/MM/YYYY')}</span>
                    <span className="text-muted-foreground capitalize">
                      Estado actual: {row.status.replaceAll('_', ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Selector de nuevo estado */}
          <div className="space-y-2">
            <Label htmlFor="status">Nuevo estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Seleccionar nuevo estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abierto">Abierto</SelectItem>
                <SelectItem value="cerrado">Cerrado</SelectItem>
                <SelectItem value="cerrado_incompleto">Cerrado Incompleto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!isFormValid() || isLoading}>
            {isLoading ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
