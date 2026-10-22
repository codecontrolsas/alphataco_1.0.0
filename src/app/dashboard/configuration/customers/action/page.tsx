import { Skeleton } from '@/components/ui/skeleton';
import { getCustomerById } from '@/features/Empresa/Clientes/actions/customers.server';
import CustomerComponent from '@/features/Empresa/Clientes/components/CustomerComponent';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { cn } from '@/lib/utils';
import BackButton from '@/shared/components/common/BackButton';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

interface PageProps {
  searchParams: Promise<{ id?: string; action?: string }>;
}

function readCookieJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default async function CustomerFormAction({ searchParams }: PageProps) {
  const { id, action } = await searchParams;
  const cookiesStore = await cookies();

  // La ficha pide sus propios datos (áreas, sectores, contratos, empleados, equipos) al abrir cada pestaña.
  const [customer, permissionsMap] = await Promise.all([
    id ? getCustomerById(id) : Promise.resolve(null),
    getUserPermissionsMapServer(),
  ]);

  return (
    <section className="grid grid-cols-2 xl:grid-cols-2 gap-2 py-4 justify-start">
      <div className="flex gap-2 col-start-2 justify-end mr-6">
        <BackButton />
      </div>

      <div className={cn('col-span-6 flex flex-col justify-between overflow-hidden', action === 'new' && 'col-span-8')}>
        <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
          <CustomerComponent
            customer={customer}
            permissionsMap={permissionsMap}
            contractsPreferences={{
              servicesFilters: readCookieJson(cookiesStore.get('services-table-filters')?.value, []),
              servicesVisibility: readCookieJson(cookiesStore.get('services-table')?.value, {}),
              serviceItemsFilters: readCookieJson(cookiesStore.get('service-items-table-filters')?.value, []),
              serviceItemsVisibility: readCookieJson(cookiesStore.get('service-items-table')?.value, {}),
            }}
          />
        </Suspense>
      </div>
    </section>
  );
}
