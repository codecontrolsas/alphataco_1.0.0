import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import ClothingBrandsTabContent from './ClothingBrands/ClothingBrandsTabContent';
import ClothingItemsTabContent from './ClothingItems/ClothingItemsTabContent';
import ClothingReportsTabContent from './ClothingReports/ClothingReportsTabContent';
import ClothingSizesTabContent from './ClothingSizes/ClothingSizesTabContent';

interface Props {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}

export default async function ClothingCatalogTabContent({ searchParams, permissions }: Props) {
  return (
    <ViewManagerServer
      paramName="clothing-tab"
      searchParams={searchParams}
      defaultView="articulos"
      permissions={permissions}
      preserveParams={['tab', 'subtab']}
      layout="tabs"
      tabsLevel="secondary"
      ariaLabel="Indumentaria y EPP"
      views={[
        {
          value: 'articulos',
          label: 'Artículos',
          description: 'Artículos de indumentaria y EPP del catálogo',
          moduleSlug: 'configuracion',
          tabSlug: 'articulos_indumentaria',
          content: <ClothingItemsTabContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'marcas',
          label: 'Marcas',
          description: 'Marcas de los artículos de indumentaria',
          moduleSlug: 'configuracion',
          tabSlug: 'marcas_indumentaria',
          content: <ClothingBrandsTabContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'talles',
          label: 'Talles',
          description: 'Talles disponibles para los artículos',
          moduleSlug: 'configuracion',
          tabSlug: 'talles_indumentaria',
          content: <ClothingSizesTabContent searchParams={searchParams} permissions={permissions} />,
        },
        {
          value: 'reportes',
          label: 'Reportes',
          description: 'Reportes de entregas y stock de indumentaria',
          moduleSlug: 'configuracion',
          tabSlug: 'reportes_indumentaria',
          content: <ClothingReportsTabContent searchParams={searchParams} />,
        },
      ]}
    />
  );
}
