import { getAllKpisMetadata } from './actions/actions.server';
import { KpiChart } from './components/KpiChart';

const KPI_CODES = ['KPI-0001', 'KPI-0002', 'KPI-0003', 'KPI-0004', 'KPI-0005', 'KPI-0006'] as const;

export default async function GraficosTabContent() {
  // 1 sola query Prisma para los 6 KPIs (elimina 18 server calls del cliente)
  const kpisMetadata = await getAllKpisMetadata();

  // Crear lookup por code para acceso O(1)
  const metadataByCode = new Map(kpisMetadata.map((kpi) => [kpi.code, kpi]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,28rem),1fr))] gap-6">
        {KPI_CODES.map((code) => {
          const meta = metadataByCode.get(code);
          return (
            <KpiChart
              key={code}
              kpiCode={code}
              kpiName={meta?.name ?? code}
              kpiDescription={meta?.description ?? 'Evolución del indicador'}
              expectedPercentage={meta?.number ?? 0}
            />
          );
        })}
      </div>
    </div>
  );
}
