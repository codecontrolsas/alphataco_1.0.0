'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { MaintenanceRequestData } from '../actions/queries.server';
import { ItemsApprovalForm } from './approval/ItemsApprovalForm';
import { PreventiveApprovalForm } from './approval/PreventiveApprovalForm';

interface SolicitudApprovalDialogProps {
  request: MaintenanceRequestData;
  open: boolean;
  onClose: () => void;
}

/**
 * Validación de una solicitud de mantenimiento (Operaciones — paso "Validar").
 *
 * Un solo diálogo de un paso: resumen del equipo arriba, ítems por severidad (críticos / no críticos) con
 * segmentado Aprobar / Rechazar, motivo inline obligatorio y contador vivo. Las preventivas se aprueban o
 * rechazan completas. La lógica vive en `./approval/*`; la API pública y las server actions no cambian.
 *
 * Permiso: `maintenance_requests:update` (lo exige el servidor y la tabla oculta la acción sin él).
 */
export function SolicitudApprovalDialog({ request, open, onClose }: SolicitudApprovalDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* El formulario vive dentro de DialogContent: al cerrar se desmonta y las decisiones no se arrastran. */}
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        {request.source === 'preventive' ? (
          <PreventiveApprovalForm request={request} onClose={onClose} />
        ) : (
          <ItemsApprovalForm request={request} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
