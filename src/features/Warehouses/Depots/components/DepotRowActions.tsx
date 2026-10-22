'use client';

import { getDepotForEdit, reactivateWarehouse, removeWarehouse } from '../../actions/catalog.server';
import { CatalogRowActions } from '../../components/CatalogRowActions';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { DepotFormDialog } from './DepotFormDialog';

export interface DepotRowActionsProps {
  warehouseId: string;
  isActive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/** Acciones por fila de la tabla de depositos (editar, dar de baja, reactivar). */
export function DepotRowActions({ warehouseId, isActive, canUpdate, canDelete }: DepotRowActionsProps) {
  return (
    <CatalogRowActions
      noun="depósito"
      loggerName="Warehouses/DepotRowActions"
      canUpdate={canUpdate}
      canDelete={canDelete}
      isActive={isActive}
      editQueryKey={['warehouse-depot-edit', warehouseId]}
      loadEditData={async () => {
        const found = await getDepotForEdit(warehouseId);
        if (!found) throw new Error('El depósito no existe');
        return found;
      }}
      invalidateKeys={[WAREHOUSE_QUERY_KEYS.depots, WAREHOUSE_QUERY_KEYS.stock]}
      removeRecord={() => removeWarehouse(warehouseId)}
      reactivateRecord={() => reactivateWarehouse(warehouseId)}
      removalDescription="Tiene que estar sin stock. Si tuvo movimientos se desactiva (su historial se conserva); si nunca se usó, se elimina."
      recordId={(depot) => depot.id}
      renderEditDialog={({ data, dialogKey, open, onOpenChange }) => (
        <DepotFormDialog key={dialogKey} depot={data} open={open} onOpenChange={onOpenChange} />
      )}
    />
  );
}
