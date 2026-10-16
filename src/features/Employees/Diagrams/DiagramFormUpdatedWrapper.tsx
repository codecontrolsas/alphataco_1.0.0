import { fetchDiagramsTypes } from '@/features/Employees/Diagrams/actions/queries.server';
import { CatalogTableSurface } from '@/shared/components/common/CatalogFormSheet';
import DiagramFormUpdated from './DiagramFormUpdated';

/** Vista «Carga individual»: los tipos de novedad llegan desde el servidor (una consulta) y el empleado se busca al elegirlo. */
export default async function DiagramFormUpdatedWrapper({ defaultId }: { defaultId?: string }) {
  const diagrams_types = await fetchDiagramsTypes();

  return (
    <CatalogTableSurface>
      <DiagramFormUpdated diagrams_types={diagrams_types} defaultId={defaultId} />
    </CatalogTableSurface>
  );
}
