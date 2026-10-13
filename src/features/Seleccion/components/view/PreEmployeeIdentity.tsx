import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { PreEmployeeDetailData } from '../../actions/pre-employee-actions.server';
import { STATUS_LABELS, STATUS_VARIANTS } from '../../lib/state-machine';

/** Identidad del candidato para la cabecera de su ficha: foto, nombre, función propuesta, identificadores y etapa. */
export function PreEmployeeIdentity({ preEmployee }: { preEmployee: PreEmployeeDetailData }) {
  const fullName = `${preEmployee.lastname} ${preEmployee.firstname}`;
  const initials = `${preEmployee.lastname?.[0] ?? ''}${preEmployee.firstname?.[0] ?? ''}`;
  const proposal = [preEmployee.company_positions?.name, preEmployee.hierarchy?.name].filter(Boolean).join(' · ');

  return (
    <div className="flex min-w-0 items-center gap-5">
      <Avatar className="size-16 shrink-0">
        <AvatarImage src={preEmployee.picture || undefined} alt={fullName} />
        <AvatarFallback className="bg-foreground text-background text-lg font-semibold">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 space-y-1.5">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{fullName}</h1>
        <p className="text-muted-foreground truncate">{proposal || 'Sin función propuesta'}</p>
        <p className="text-muted-foreground flex flex-wrap gap-x-4 font-mono text-sm tabular-nums">
          <span>Pre legajo {preEmployee.pre_file_number}</span>
          <span>CUIL {preEmployee.cuil}</span>
        </p>
        <div className="pt-1">
          <Badge variant={STATUS_VARIANTS[preEmployee.status]}>{STATUS_LABELS[preEmployee.status]}</Badge>
        </div>
      </div>
    </div>
  );
}
