import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentAbsentEmployees } from '../actions.server';
import { _EmployeeAbsenceDataTable } from './EmployeeAbsenceTable/_EmployeeAbsenceDataTable';

export async function EmployeeAbsenceTable() {
  const result = await getCurrentAbsentEmployees();

  return (
    <Card className="@container min-w-0">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Detalle de Ausencias por Empleado</CardTitle>
        <CardDescription>
          Esta tabla lista a los empleados actualmente ausentes e informa su período de ausencia, así como el motivo y
          área/turno involucrados.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <_EmployeeAbsenceDataTable data={result?.data ?? []} />
      </CardContent>
    </Card>
  );
}
