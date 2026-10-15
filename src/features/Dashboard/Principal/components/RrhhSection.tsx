import { formatDateAr } from '@/shared/lib/argentina-time';
import { getAllPositions, getDiagramIndicators, getEmployeeIndicators } from '../actions/rrhh.server';
import { getOperationToday } from '../lib/dashboard-dates';
import { POSITIONS_PARAM, parseUrlIdList } from '../lib/url-list';
import { RrhhSectionClient } from './RrhhSectionClient';

export async function RrhhSection({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // Filtro de puestos en la URL (`?puestos=`): se comparte con el link y no vence.
  const positionIds = parseUrlIdList(searchParams[POSITIONS_PARAM]);
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
  // Con diagrama de trabajo hoy y fuera del parte: el mismo conjunto que lista el diálogo.
  const disponibles = employeeIndicator.employees_available;
  const indicatorPercent = employeeIndicator.indicator;

  return (
    <RrhhSectionClient
      date={date}
      diagramData={diagramData}
      operativos={operativos}
      enOperacion={enOperacion}
      enCancelados={employeeIndicator.employees_cancelled}
      disponibles={disponibles}
      indicatorPercent={indicatorPercent}
      positionIds={positionIds}
      positions={positions.map((p) => ({ label: p.name ?? '', value: p.id }))}
      initialFilterValues={initialFilterValues}
    />
  );
}
