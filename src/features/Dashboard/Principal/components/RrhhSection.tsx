import { formatDateAr } from '@/shared/lib/argentina-time';
import { cookies } from 'next/headers';
import { getAllPositions, getDiagramIndicators, getEmployeeIndicators } from '../actions/rrhh.server';
import { getOperationToday } from '../lib/dashboard-dates';
import { RrhhSectionClient } from './RrhhSectionClient';

export async function RrhhSection() {
  const cookiesStore = await cookies();
  const positionFilter = cookiesStore.get('position-filter')?.value;
  const positionIds = positionFilter ? positionFilter.split(',').filter(Boolean) : undefined;
  const initialFilterValues = positionIds ?? [];

  // async-parallel — only fetch indicator data for SSR; detail data loads lazily in dialog
  const [employeeIndicator, diagramData, positions] = await Promise.all([
    getEmployeeIndicators(positionIds),
    getDiagramIndicators(positionIds),
    getAllPositions(),
  ]);

  const date = formatDateAr(getOperationToday());

  // server-serialization — pre-compute values, minimize props to client
  const operativos = employeeIndicator.employees_operativos;
  const enOperacion = employeeIndicator.employees_used;
  // Resta simple: con diagrama − cargados en el parte. Cuenta como "en operación" a todo activo que
  // figura en el parte, tenga o no diagrama de trabajo, así que puede diferir del listado del diálogo.
  const disponibles = operativos - enOperacion;
  const indicatorPercent = employeeIndicator.indicator;

  return (
    <RrhhSectionClient
      date={date}
      diagramData={diagramData}
      operativos={operativos}
      enOperacion={enOperacion}
      disponibles={disponibles}
      indicatorPercent={indicatorPercent}
      positionIds={positionIds}
      positions={positions.map((p) => ({ label: p.name ?? '', value: p.id }))}
      initialFilterValues={initialFilterValues}
    />
  );
}
