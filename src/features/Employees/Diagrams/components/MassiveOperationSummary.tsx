import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  employeeCount: number;
  days: number;
  totalRecords: number;
  estimatedTime: string;
}

/** Resumen de cuántos registros va a generar la carga masiva. */
export function MassiveOperationSummary({ employeeCount, days, totalRecords, estimatedTime }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resumen de la operación</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
          <div>
            <div className="text-2xl font-bold text-blue-600">{employeeCount}</div>
            <div className="text-sm text-muted-foreground">Empleados</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{days}</div>
            <div className="text-sm text-muted-foreground">Días</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600">{totalRecords}</div>
            <div className="text-sm text-muted-foreground">Registros</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600">{estimatedTime}</div>
            <div className="text-sm text-muted-foreground">Tiempo Est.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
