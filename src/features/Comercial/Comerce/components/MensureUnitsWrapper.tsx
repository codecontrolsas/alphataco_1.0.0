import { Card } from '@/components/ui/card';
import { getMeasureUnits } from '@/features/Empresa/Clientes/actions/measure-units.server';
import MensureUnitsTab from '@/features/Empresa/Clientes/components/meansure_units/MensureUnitsTab';
import { readCookieJson } from '@/shared/lib/cookie-json';
import { cookies } from 'next/headers';

async function MensureUnitsWrapper() {
  const unitMeasurements = await getMeasureUnits();
  const cookieStore = await cookies();
  const savedFilters = cookieStore.get('meanureUnitsTable-filters')?.value;
  const savedVisibility = cookieStore.get('meanureUnitsTable')?.value;
  return (
    <Card className="p-6">
      <MensureUnitsTab
        units={unitMeasurements}
        savedVisibility={readCookieJson(savedVisibility, {})}
        savedFilters={readCookieJson(savedFilters, [])}
      />
    </Card>
  );
}

export default MensureUnitsWrapper;
