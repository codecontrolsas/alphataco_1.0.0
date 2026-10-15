import { fetchDiagramsTypes } from '@/features/Employees/Diagrams/actions/queries.server';
import DiagramFormUpdated from './DiagramFormUpdated';

export default async function DiagramFormUpdatedWrapper({ defaultId }: { defaultId?: string }) {
  const diagrams_types = await fetchDiagramsTypes();

  return (
    <div>
      <DiagramFormUpdated diagrams_types={diagrams_types} defaultId={defaultId} />
    </div>
  );
}
