import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import moment from 'moment';
import type { PreEmployeeDetailData } from '../actions/pre-employee-actions.server';

interface PreEmployeeStatusBannerProps {
  preEmployee: PreEmployeeDetailData;
  /** El usuario puede aprobar o rechazar (gerencia). */
  canApprove: boolean;
}

/** Aviso de la etapa en la que está el candidato y qué se espera de quien lo mira. */
export function PreEmployeeStatusBanner({ preEmployee, canApprove }: PreEmployeeStatusBannerProps) {
  if (preEmployee.status === 'pre_ingreso') {
    return (
      <Alert variant="info" role="status">
        <Info />
        <AlertTitle className="line-clamp-none">
          {canApprove ? 'Esperando tu decisión' : 'Enviado a pre ingreso'}
        </AlertTitle>
        <AlertDescription>
          {canApprove
            ? 'Aprobarlo crea su legajo; rechazarlo lo deja registrado con el motivo.'
            : 'Gerencia decide si se aprueba o se rechaza. Mientras tanto se pueden seguir completando datos y documentos.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (preEmployee.status === 'rechazado') {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle className="line-clamp-none">Candidato rechazado</AlertTitle>
        <AlertDescription>
          {preEmployee.rejection_reason}
          {preEmployee.reviewed_at && (
            <span className="block text-sm opacity-80">
              {moment(preEmployee.reviewed_at).format('DD/MM/YYYY')}
              {preEmployee.reviewed_by_profile?.fullname ? ` · ${preEmployee.reviewed_by_profile.fullname}` : ''}
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (preEmployee.status === 'legajo') {
    return (
      <Alert variant="success" role="status">
        <CircleCheck />
        <AlertTitle className="line-clamp-none">Legajo creado</AlertTitle>
        <AlertDescription>
          Los datos y documentos pasaron al legajo del empleado. Esta ficha queda como historial, de solo lectura.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
