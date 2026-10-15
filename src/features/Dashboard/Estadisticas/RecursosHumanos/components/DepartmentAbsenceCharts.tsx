import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig } from '@/components/ui/chart';
import { categoricalColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { DepartmentAbsenceReasonEntry, getDepartmentAbsenceReasons } from '../actions.server';
import { DepartmentAbsenceChartsComponent } from './charts/department-absence-charts';

const sanitizeKey = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export async function DepartmentAbsenceCharts() {
  const data = await getDepartmentAbsenceReasons();

  // Filtrar solo departamentos que tengan algún ausente (algún motivo con valor > 0)
  const filteredData: DepartmentAbsenceReasonEntry[] = Array.isArray(data)
    ? data.filter((dept) => Array.isArray(dept?.data) && dept.data.some((r) => (Number(r?.value) || 0) > 0))
    : [];

  // Razones presentes solo en los departamentos visibles (con ausentes)
  const reasonNames = Array.from(
    new Set(filteredData.flatMap((d) => (d?.data || []).filter((r) => (Number(r?.value) || 0) > 0).map((r) => r.name)))
  );

  const chartConfig: ChartConfig = {
    value: { label: 'Ausentes' },
  };

  reasonNames.forEach((name, idx) => {
    const key = sanitizeKey(name);
    chartConfig[key] = {
      label: name,
      color: categoricalColorVar(idx),
    };
  });

  return (
    <Card>
      <CardHeader className=" pb-0">
        <CardTitle className="text-lg font-semibold">Motivos de Ausencia por Departamento</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Solo se muestran los departamentos con ausentes. Los que no registran ausencias no aparecen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {filteredData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No se registran ausentes en los departamentos para hoy.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" aria-hidden="true">
              {filteredData.map((dept, index) => {
                const deptChartData = dept.data.map((r) => {
                  const key = sanitizeKey(r.name);
                  return {
                    reason: key,
                    value: r.value,
                    fill: `var(--color-${key})`,
                    label: r.name,
                  };
                });

                return (
                  <div key={index} className="text-center">
                    <h3 className="font-medium text-sm mb-3 text-muted-foreground">{dept.department}</h3>
                    <DepartmentAbsenceChartsComponent chartConfig={chartConfig} deptChartData={deptChartData} />
                  </div>
                );
              })}
            </div>
            <ChartSummary
              title="Motivos de ausencia por departamento"
              summary={`Hoy hay ausentes en ${filteredData.length} departamento(s): ${filteredData
                .map((dept) => `${dept.department} (${dept.data.reduce((sum, r) => sum + (Number(r.value) || 0), 0)})`)
                .join(', ')}.`}
              columns={[
                { key: 'department', header: 'Departamento' },
                { key: 'reason', header: 'Motivo' },
                { key: 'value', header: 'Ausentes', numeric: true },
              ]}
              rows={filteredData.flatMap((dept) =>
                dept.data
                  .filter((r) => (Number(r?.value) || 0) > 0)
                  .map((r) => ({ department: dept.department, reason: r.name, value: r.value }))
              )}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
