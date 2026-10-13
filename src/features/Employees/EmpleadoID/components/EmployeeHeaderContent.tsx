import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  employeeStatusBadges,
  employeeStatusLabels,
  getEnumLabel,
  reasonForTerminationLabels,
} from '@/shared/utils/mappers';
import moment from 'moment';
import type { EmployeeDetailData } from '../actions.server';

interface EmployeeHeaderContentProps {
  employee: NonNullable<EmployeeDetailData>;
}

/**
 * Identidad del empleado en la cabecera del legajo: foto, nombre, puesto, identificadores en
 * mono y estados. Sin tarjeta propia: la envuelve `EmployeeHeaderShell`, que le suma las acciones.
 */
export function EmployeeHeaderContent({ employee }: EmployeeHeaderContentProps) {
  const fullName = `${employee.lastname} ${employee.firstname}`;
  const initials = `${employee.lastname?.[0] ?? ''}${employee.firstname?.[0] ?? ''}`;
  const role = [employee.company_positions?.name, employee.hierarchy?.name].filter(Boolean).join(' · ');

  return (
    <div className="flex min-w-0 items-center gap-5">
      <Avatar className="size-16 shrink-0">
        <AvatarImage src={employee.picture || undefined} alt={fullName} />
        <AvatarFallback className="bg-foreground text-background text-lg font-semibold">{initials}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 space-y-1.5">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{fullName}</h1>
        <p className="text-muted-foreground truncate">{role || 'Sin puesto asignado'}</p>
        <p className="text-muted-foreground flex flex-wrap gap-x-4 font-mono text-sm tabular-nums">
          <span>Legajo {employee.file ?? '-'}</span>
          <span>DNI {employee.document_number ?? '-'}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant={employee.is_active ? 'success' : 'secondary'}>{employee.is_active ? 'Activo' : 'Baja'}</Badge>
          {employee.status && (
            <Badge variant={employeeStatusBadges[employee.status] ?? 'default'}>
              {getEnumLabel(employee.status, employeeStatusLabels)}
            </Badge>
          )}
          {!employee.is_active && employee.termination_date && (
            <span className="text-danger-subtle-foreground text-sm">
              Baja el <span className="font-mono">{moment.utc(employee.termination_date).format('DD/MM/YYYY')}</span>
              {employee.reason_for_termination &&
                ` · ${getEnumLabel(employee.reason_for_termination, reasonForTerminationLabels)}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
