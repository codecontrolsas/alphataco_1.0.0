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
 * Identidad del empleado en la cabecera de la ficha: el legajo arriba (es como lo identifican),
 * nombre, puesto, documento y estados. La tarjeta y las acciones las pone `RecordHeader`.
 */
export function EmployeeHeaderContent({ employee }: EmployeeHeaderContentProps) {
  const fullName = `${employee.lastname} ${employee.firstname}`;
  const initials = `${employee.lastname?.[0] ?? ''}${employee.firstname?.[0] ?? ''}`;
  const role = [employee.company_positions?.name, employee.hierarchy?.name].filter(Boolean).join(' · ');

  return (
    <div className="flex min-w-0 items-start gap-4 sm:items-center">
      <Avatar className="size-14 shrink-0 sm:size-16">
        <AvatarImage src={employee.picture || undefined} alt={fullName} />
        <AvatarFallback className="bg-brand-subtle text-brand-subtle-foreground text-lg font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 space-y-1">
        <p className="text-muted-foreground font-mono text-sm tabular-nums">
          Legajo <span className="text-foreground font-semibold">{employee.file ?? '—'}</span>
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{fullName}</h1>
        <p className="text-muted-foreground text-sm">
          {role || 'Sin puesto asignado'}
          <span aria-hidden="true"> · </span>
          <span className="font-mono tabular-nums">DNI {employee.document_number ?? '—'}</span>
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
