'use client';

import { getMaterialFormLookups } from '../../actions/catalog-settings.server';
import { getMaterialForEdit, reactivateMaterial, removeMaterial } from '../../actions/materials.server';
import { CatalogRowActions } from '../../components/CatalogRowActions';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { MaterialFormDialog } from './MaterialFormDialog';

export interface MaterialRowActionsProps {
  materialId: string;
  isActive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/** Acciones por fila de la tabla de materiales (editar, dar de baja, reactivar). */
export function MaterialRowActions({ materialId, isActive, canUpdate, canDelete }: MaterialRowActionsProps) {
  return (
    <CatalogRowActions
      noun="material"
      loggerName="Warehouses/MaterialRowActions"
      canUpdate={canUpdate}
      canDelete={canDelete}
      isActive={isActive}
      editQueryKey={['warehouse-material-edit', materialId]}
      loadEditData={async () => {
        const [material, lookups] = await Promise.all([getMaterialForEdit(materialId), getMaterialFormLookups()]);
        if (!material) throw new Error('El material no existe');
        return { material, lookups };
      }}
      invalidateKeys={[WAREHOUSE_QUERY_KEYS.materials, WAREHOUSE_QUERY_KEYS.stock]}
      removeRecord={() => removeMaterial(materialId)}
      reactivateRecord={() => reactivateMaterial(materialId)}
      removalDescription="Si ya tiene movimientos se desactiva (su historial se conserva y deja de ofrecerse en los formularios). Si nunca se usó, se elimina."
      recordId={(data) => data.material.id}
      renderEditDialog={({ data, dialogKey, open, onOpenChange }) => (
        <MaterialFormDialog
          key={dialogKey}
          lookups={data.lookups}
          material={data.material}
          open={open}
          onOpenChange={onOpenChange}
        />
      )}
    />
  );
}
