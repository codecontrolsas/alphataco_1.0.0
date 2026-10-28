import { Card } from '@/components/ui/card';
import { CustomersPanel } from '@/features/Empresa/Clientes/components/CustomersPanel';
import { CustomersTableSkeleton } from '@/features/Empresa/Clientes/fallback/CustomersTableSkeleton';
import { CustomersList } from '@/features/Empresa/Clientes/list/CustomersList';
import { isModuleEnabled } from '@/features/Modules/server/modules.server';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

function readCookieJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface DataCustomersWrapperProps {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}

/**
 * Pestaña "Clientes": solo el listado paginado viaja desde el servidor. La ficha de un cliente pide sus
 * propios datos (áreas, sectores, contratos, empleados, equipos) al abrir cada pestaña.
 */
export default async function DataCustomersWrapper({ searchParams, permissions }: DataCustomersWrapperProps) {
  const [cookiesStore, showDocumentStatus] = await Promise.all([cookies(), isModuleEnabled('documentacion')]);

  return (
    <Card className="p-6">
      <CustomersPanel
        permissionsMap={permissions}
        showDocumentStatus={showDocumentStatus}
        contractsPreferences={{
          servicesFilters: readCookieJson(cookiesStore.get('services-table-filters')?.value, []),
          servicesVisibility: readCookieJson(cookiesStore.get('services-table')?.value, {}),
          serviceItemsFilters: readCookieJson(cookiesStore.get('service-items-table-filters')?.value, []),
          serviceItemsVisibility: readCookieJson(cookiesStore.get('service-items-table')?.value, {}),
        }}
      >
        <Suspense fallback={<CustomersTableSkeleton />}>
          <CustomersList searchParams={searchParams} permissionsMap={permissions} />
        </Suspense>
      </CustomersPanel>
    </Card>
  );
}
