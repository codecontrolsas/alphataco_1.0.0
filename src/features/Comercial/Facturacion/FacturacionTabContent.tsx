import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Card } from '@/components/ui/card';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { InvoicingNotices } from './components/InvoicingNotices';
import { NewInvoiceMenu } from './components/NewInvoiceMenu';

import { InvoicesList } from './list/InvoicesList';

/**
 * Comercial → Facturación. El encabezado es estático; los avisos y el listado cargan cada uno
 * detrás de su propio Suspense, así el listado no espera a la lectura fiscal ni al revés.
 */
export default function FacturacionTabContent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  /** Mapa `módulo:tab:acción` que ya cargó el módulo Comercial: no se vuelve a consultar. */
  permissions: Record<string, boolean>;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-balance">Facturación</h3>
            <p className="text-muted-foreground text-sm text-pretty">
              Facturas y notas de crédito y débito electrónicas ante ARCA.
            </p>
          </div>
          <NewInvoiceMenu canCreate={permissions['comercial:facturacion:create'] === true} />
        </div>

        <Suspense fallback={null}>
          <InvoicingNotices />
        </Suspense>

        <Suspense fallback={<TableSkeleton inCard columnCount={7} rowCount={10} />}>
          <InvoicesList searchParams={searchParams as DataTableSearchParams} />
        </Suspense>
      </div>
    </Card>
  );
}
