import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { _WorkshopSectorTasksDataTable } from './_WorkshopSectorTasksDataTable';
import { getWorkshopSectorWorkOrdersPaginated } from './actions.server';

// ============================================================================
// PROPS
// ============================================================================

interface WorkshopSectorTasksListProps {
  /** ID del sector de taller — filtro base obligatorio. */
  sectorId: string;
  /** Todos los searchParams de la URL. Se aplica stripPrefix con el namespace de la tabla. */
  searchParams: DataTableSearchParams;
  /** Título de la tarjeta (el sector elegido). */
  title: string;
  /** Línea de apoyo: cupos ocupados y tareas sin OT del sector. */
  description?: string;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

/**
 * WorkshopSectorTasksList — Server Component.
 *
 * Se instancia UNA vez: para el sector que eligió el usuario en la grilla de tarjetas de la Vista Taller.
 * Lista las ÓRDENES DE TRABAJO abiertas del sector (ticket 678).
 *
 * El namespace de los parámetros de URL es único por sector, así las tablas de sectores distintos no se pisan
 * entre sí al cambiar de tarjeta. El tableId (preferencias de columnas y filtros) lleva el sufijo `-v2` porque
 * las columnas cambiaron con el rediseño; el namespace NO cambia, así los links y bookmarks siguen funcionando.
 */
export async function WorkshopSectorTasksList({
  sectorId,
  searchParams,
  title,
  description,
}: WorkshopSectorTasksListProps) {
  const paramNamespace = `workshop-sector-work-orders-${sectorId}`;
  const tableId = `${paramNamespace}-v2`;

  // Strip del namespace antes de parsear los searchParams de esta tabla
  const tableParams = stripPrefixFromSearchParams(searchParams, paramNamespace);

  const [{ data, total }, preferences] = await Promise.all([
    getWorkshopSectorWorkOrdersPaginated(sectorId, tableParams),
    getTablePreferences(tableId),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <_WorkshopSectorTasksDataTable
          sectorId={sectorId}
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={tableId}
          paramNamespace={paramNamespace}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
