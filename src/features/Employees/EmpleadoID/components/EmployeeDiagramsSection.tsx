// Server Component async — se envuelve en <Suspense> desde el padre
import { DiagramDetailEmployeeView } from '@/features/Employees/Diagrams/DiagramDetailEmployeeView';
import type { DiagramHistoryRow } from '@/features/Employees/Diagrams/table/DiagramDetailTable';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import moment from 'moment';
import type { EmployeeDetailData } from '../actions.server';
import { getDiagramTypes, getEmployeeDiagramHistory, getEmployeeDiagrams } from '../actions.server';

interface Props {
  employeeId: string;
  /** Ya no se usa: la empresa sale de la sesión en el servidor. Se acepta para no romper al llamador. */
  companyId?: string;
  employee: NonNullable<EmployeeDetailData>;
  searchParams: Record<string, string | undefined>;
}

export async function EmployeeDiagramsSection({ employeeId, employee, searchParams }: Props) {
  const [rawHistory, rawDiagrams, diagramTypes] = await Promise.all([
    getEmployeeDiagramHistory(employeeId),
    getEmployeeDiagrams(employeeId),
    getDiagramTypes(),
  ]);

  // Formatear historyData (movido de page.tsx lineas 88-98)
  const historyData: DiagramHistoryRow[] = rawHistory.map((item) => ({
    date: moment.utc(item.prev_date).format('DD/MM/YYYY'),
    description: item.description,
    status: item.state,
    previousStatus: item.prev_state,
    modifiedBy: item.profile?.fullname
      ?.split(' ')
      .map((name: string) => name.charAt(0).toUpperCase() + name.slice(1))
      .join(' '),
    modifiedAt: formatArgentinaDateTime(item.created_at),
    type: item.prev_state ? ('modified' as const) : ('created' as const),
  }));

  // Prisma retorna la relacion con nombre largo generado automaticamente.
  // DiagramDetailEmployeeView espera la forma { diagram_type: { id, name, color, ... } }
  // y los campos created_at como string (no Date).
  const diagrams = rawDiagrams.map((d) => {
    const dt = d.diagram_type_employees_diagram_diagram_typeTodiagram_type;
    return {
      id: d.id,
      created_at: d.created_at instanceof Date ? d.created_at.toISOString() : String(d.created_at),
      employee_id: d.employee_id ?? '',
      day: Number(d.day),
      month: Number(d.month),
      year: Number(d.year),
      comments: d.comments,
      diagram_type: {
        id: dt?.id ?? '',
        name: dt?.name ?? '',
        color: dt?.color ?? '',
        company_id: dt?.company_id ?? '',
        created_at: dt?.created_at instanceof Date ? dt.created_at.toISOString() : String(dt?.created_at ?? ''),
        short_description: dt?.short_description ?? '',
      },
    };
  });

  return (
    <DiagramDetailEmployeeView
      historyData={historyData}
      diagrams={diagrams}
      diagrams_types={diagramTypes}
      activeEmploees={[employee]}
      searchParams={searchParams}
    />
  );
}
