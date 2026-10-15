import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { Suspense } from 'react';
import GraficosTabContent from './Graficos/GraficosTabContent';
import { GraficosGridSkeleton } from './Graficos/fallback/KpiChartSkeleton';
import { KpisIndicadoresSkeleton } from './Indicadores/fallback/KpisIndicadoresSkeleton';
import KpisIndicadoresContent from './KpisIndicadoresContent';

export default async function KpisTabContent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  return (
    <ViewManagerServer
      layout="menu"
      paramName="kpiview"
      defaultView="indicadores"
      ariaLabel="Indicadores"
      preserveParams={['tab', 'subtab']}
      searchParams={searchParams}
      permissions={permissions}
      views={[
        {
          value: 'indicadores',
          label: 'Indicadores',
          description: 'Alta y seguimiento de indicadores con su umbral y fórmula de cálculo',
          moduleSlug: 'configuracion',
          tabSlug: 'indicadores',
          content: (
            <Suspense fallback={<KpisIndicadoresSkeleton />}>
              <KpisIndicadoresContent searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'graficos',
          label: 'Gráficos',
          description: 'Evolución de cada indicador en el tiempo',
          moduleSlug: 'configuracion',
          tabSlug: 'graficos',
          content: (
            <Suspense fallback={<GraficosGridSkeleton />}>
              <GraficosTabContent />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
