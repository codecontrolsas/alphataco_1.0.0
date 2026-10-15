import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDepartmentAbsenceSummary } from '../actions.server';
import { _DepartmentSummaryDataTable } from './DepartmentSummaryTable/_DepartmentSummaryDataTable';

export async function DepartmentSummaryTable() {
  const data = await getDepartmentAbsenceSummary();

  return (
    <Card className="@container min-w-0">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Resumen por Sector</CardTitle>
        <CardDescription>
          Esta tabla resume el ausentismo actual por sector para comparar rápidamente el impacto en cada área.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <_DepartmentSummaryDataTable data={data} />
      </CardContent>
    </Card>
  );
}
