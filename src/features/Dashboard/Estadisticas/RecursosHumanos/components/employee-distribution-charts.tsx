import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEmployeesByContractType, getEmployeesByGenderAndPosition } from '../actions.server';
import { EmployeeContractTypeChartComponent } from './charts/employee-contract-type-chart';
import { EmployeeGenderPositionChartComponent } from './charts/employee-gender-position-chart';

export default async function EmployeeDistributionCharts() {
  // Si una consulta falla, el SectionErrorBoundary del tablero lo muestra: un gráfico vacío con
  // «sin datos» afirmaría que no hay empleados cuando en realidad no se pudieron leer.
  const [genderPositionData, contractTypeData] = await Promise.all([
    getEmployeesByGenderAndPosition(),
    getEmployeesByContractType(),
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Distribución de Empleados</CardTitle>
          <CardDescription>Visualización de empleados por género y posición en la empresa</CardDescription>
        </CardHeader>
        <CardContent className="h-full">
          <EmployeeGenderPositionChartComponent data={genderPositionData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipos de Contrato</CardTitle>
          <CardDescription>Distribución de empleados según su tipo de contrato</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeContractTypeChartComponent data={contractTypeData} />
        </CardContent>
      </Card>
    </div>
  );
}
