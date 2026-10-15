import { Card } from '@/components/ui/card';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { CertificationsTableSkeleton } from './fallback/CertificationsTableSkeleton';
import { CertificationsList } from './list/CertificationsList';

/**
 * Comercial → Certificaciones. El encabezado es estático y el listado carga detrás de su Suspense. El
 * detalle se pide bajo demanda (`getCertificationById`) al abrir el panel: una certificación de un mes
 * puede tener cientos de líneas y casi siempre se mira una sola.
 */
export default function CertificacionesTabContent({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-balance">Certificaciones</h3>
          <p className="text-muted-foreground text-sm text-pretty">
            Lo trabajado para un cliente, bajo un contrato, en un período.
          </p>
        </div>

        <Suspense fallback={<CertificationsTableSkeleton />}>
          <CertificationsList searchParams={searchParams as DataTableSearchParams} />
        </Suspense>
      </div>
    </Card>
  );
}
