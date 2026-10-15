import { ActionDialogResource } from '@/features/Mantenimiento/shared/components/ActionDialogParts';
import { getResourceCondition } from '../../../shared/maintenance-resource';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { MaintenanceRequestData } from '../../actions/queries.server';

/** Encabezado de los diálogos de validación: equipo, chofer, supervisor, fecha y descripción de la solicitud. */
export function RequestSummary({ request }: { request: MaintenanceRequestData }) {
  const driver = request.driver_employee;
  const driverLabel = driver
    ? `${driver.file != null ? `[${driver.file}] ` : ''}${driver.lastname ?? ''} ${driver.firstname ?? ''}`.trim()
    : null;
  const supervisorName = request.supervisor?.fullname ?? null;

  const meta: Array<{ label: string; value: string | null }> = [
    { label: 'Chofer', value: driverLabel },
    { label: 'Supervisor', value: supervisorName },
    { label: 'Fecha solicitud', value: request.created_at ? formatArgentinaDateTime(request.created_at) : null },
    { label: 'Kilometraje', value: request.kilometer ? Number(request.kilometer).toLocaleString('es-AR') : null },
  ];

  return (
    <div className="space-y-3">
      <ActionDialogResource row={request} condition={getResourceCondition(request)} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        {meta
          .filter((entry) => entry.value)
          .map((entry) => (
            <div key={entry.label} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{entry.label}</dt>
              <dd className="truncate font-medium" title={entry.value ?? undefined}>
                {entry.value}
              </dd>
            </div>
          ))}
      </dl>

      {request.description && (
        <div className="bg-muted rounded-lg p-3">
          <span className="text-muted-foreground text-sm">Descripción: </span>
          <p className="font-medium break-words whitespace-pre-wrap">{request.description}</p>
        </div>
      )}
    </div>
  );
}
