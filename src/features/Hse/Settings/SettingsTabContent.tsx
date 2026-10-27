import { StateBlock } from '@/shared/components/common/StateBlock';
import { getHseDocumentTypes } from '../actions/queries.server';
import { DocumentTypesSection } from './components/DocumentTypesSection';

/** Configuración de HSE: tipos de documento (norma, procedimiento, instructivo…). */
export default async function SettingsTabContent({ permissions }: { permissions: Record<string, boolean> }) {
  if (permissions['hse:configuracion-hse:view'] !== true)
    return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const types = await getHseDocumentTypes();
  return (
    <div className="max-w-2xl space-y-6">
      <DocumentTypesSection
        types={types}
        canCreate={permissions['hse:configuracion-hse:create'] === true}
        canUpdate={permissions['hse:configuracion-hse:update'] === true}
        canDelete={permissions['hse:configuracion-hse:delete'] === true}
      />
    </div>
  );
}
