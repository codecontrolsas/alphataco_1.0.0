import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { Suspense } from 'react';
import CatalogoTabContent from './Catalogo/CatalogoTabContent';
import { CatalogoSkeleton } from './Catalogo/fallback/CatalogoSkeleton';
import MarcasTabContent from './Marcas/MarcasTabContent';
import { MarcasSkeleton } from './Marcas/fallback/MarcasSkeleton';
import OrdenesTabContent from './Ordenes/OrdenesTabContent';
import { OrdenesSkeleton } from './Ordenes/fallback/OrdenesSkeleton';
import PlantillasTabContent from './Plantillas/PlantillasTabContent';
import { PlantillasSkeleton } from './Plantillas/fallback/PlantillasSkeleton';
import TiposTabContent from './Tipos/TiposTabContent';
import { TiposSkeleton } from './Tipos/fallback/TiposSkeleton';

interface Props {
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
}

export default async function GomeriaTabContent({ searchParams, permissions }: Props) {
  return (
    <ViewManagerServer
      paramName="gomeria_tab"
      ariaLabel="Secciones de gomería"
      searchParams={searchParams}
      defaultView="catalogo_cubiertas"
      permissions={permissions}
      views={[
        {
          value: 'catalogo_cubiertas',
          label: 'Catálogo',
          moduleSlug: 'mantenimiento',
          tabSlug: 'catalogo_cubiertas',
          content: (
            <Suspense fallback={<CatalogoSkeleton />}>
              <CatalogoTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'plantillas_cubiertas',
          label: 'Plantillas',
          moduleSlug: 'mantenimiento',
          tabSlug: 'plantillas_cubiertas',
          content: (
            <Suspense fallback={<PlantillasSkeleton />}>
              <PlantillasTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'ordenes_gomeria',
          label: 'Órdenes',
          moduleSlug: 'mantenimiento',
          tabSlug: 'ordenes_gomeria',
          content: (
            <Suspense fallback={<OrdenesSkeleton />}>
              <OrdenesTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'marcas_cubiertas',
          label: 'Marcas',
          moduleSlug: 'mantenimiento',
          tabSlug: 'marcas_cubiertas',
          content: (
            <Suspense fallback={<MarcasSkeleton />}>
              <MarcasTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'tipos_cubiertas',
          label: 'Tipos',
          moduleSlug: 'mantenimiento',
          tabSlug: 'tipos_cubiertas',
          content: (
            <Suspense fallback={<TiposSkeleton />}>
              <TiposTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
