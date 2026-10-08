'use client';

import { useQuery } from '@tanstack/react-query';
import { getWarehouseSettings, type WarehouseSettings } from '../../actions/catalog.server';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { CategoriesSection } from './CategoriesSection';
import { UnitsSection } from './UnitsSection';

interface SettingsPanelProps {
  initialData: WarehouseSettings;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/** Configuracion de Almacenes: categorias de materiales y unidades de medida. */
export function SettingsPanel({ initialData, ...permissions }: SettingsPanelProps) {
  const { data } = useQuery({
    queryKey: WAREHOUSE_QUERY_KEYS.settings,
    queryFn: () => getWarehouseSettings(),
    initialData,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CategoriesSection categories={data.categories} {...permissions} />
      <UnitsSection units={data.units} {...permissions} />
    </div>
  );
}
