import { getWarehouseSettings } from '../actions/catalog.server';
import { getDirectExitSettings } from '../actions/settings.server';
import { getTireInventoryWarehouses, getTiresWithoutStockAction } from '../actions/tire-inventory.server';
import { NoPermission } from '../fallback/NoPermission';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { DirectExitSection } from './components/DirectExitSection';
import { SettingsPanel } from './components/SettingsPanel';
import { TireInventorySection } from './components/TireInventorySection';

export default async function SettingsTabContent({ permissions }: { permissions: PermissionsMap }) {
  if (!canWarehouse(permissions, 'config-almacen', 'view')) return <NoPermission />;
  // El inventario inicial de cubiertas es un ajuste de stock: solo con `movimientos:adjust`.
  const canAdjust = canWarehouse(permissions, 'movimientos', 'adjust');
  const [settings, directExit, tireGroups, tireWarehouses] = await Promise.all([
    getWarehouseSettings(),
    getDirectExitSettings(),
    canAdjust ? getTiresWithoutStockAction() : Promise.resolve([]),
    canAdjust ? getTireInventoryWarehouses() : Promise.resolve([]),
  ]);
  const canUpdate = canWarehouse(permissions, 'config-almacen', 'update');

  return (
    <div className="space-y-4">
      <SettingsPanel
        initialData={settings}
        canCreate={canWarehouse(permissions, 'config-almacen', 'create')}
        canUpdate={canUpdate}
        canDelete={canWarehouse(permissions, 'config-almacen', 'delete')}
      />
      <DirectExitSection amount={directExit?.directExitMaxAmount ?? null} canUpdate={canUpdate} />
      {/* Visible mientras haya cubiertas de Gomeria sin stock (spec etapa 6 §4). */}
      {tireGroups.length > 0 && <TireInventorySection groups={tireGroups} warehouses={tireWarehouses} />}
    </div>
  );
}
