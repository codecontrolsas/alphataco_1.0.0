import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getDailyAbsenceTimeseries } from '../actions.server';
import { _DailyAbsenceDataTable } from './DailyAbsenceTable/_DailyAbsenceDataTable';

/** «Octubre 2026» del mes en curso en hora argentina (no del servidor, que corre en UTC). */
function getCurrentMonthYearLabel() {
  const [year, month] = argentinaDate().split('-');
  const monthName = new Date(`${year}-${month}-15T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    month: 'long',
  });
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
}

export async function DetailedAbsenceTable() {
  // `companyId` sólo discrimina la caché de React Query del detalle por día.
  const [data, companyId] = await Promise.all([getDailyAbsenceTimeseries(), getActiveCompanyId()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Ausentismo Diario - {getCurrentMonthYearLabel()}</CardTitle>
        <CardDescription>
          Esta tabla muestra la serie diaria de ausentismo del período seleccionado para analizar su evolución día a
          día.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <_DailyAbsenceDataTable data={data} companyId={companyId} />
      </CardContent>
    </Card>
  );
}
