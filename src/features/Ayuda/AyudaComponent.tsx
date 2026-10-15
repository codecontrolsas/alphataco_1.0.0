import { getUserPermissionsMapServer } from '@/features/Permissions';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { SectionManagerServer } from '@/features/TabsManager';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { BookOpen, LifeBuoy } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ManualTabContent } from './Manual/ManualTabContent';
import { ManualSkeleton } from './Manual/fallback/ManualSkeleton';
import { TicketsTabContent } from './Tickets/TicketsTabContent';
import { MyTicketsListSkeleton } from './fallback/MyTicketsListSkeleton';

type SearchParams = { [key: string]: string | string[] | undefined };

/**
 * Módulo Ayuda: "Tickets" (soporte con TaskApp) y "Manual de uso". Cada sección es un
 * sub-item del sidebar (`?tab=`) y se filtra por su propio permiso.
 */
export default async function AyudaComponent({ searchParams }: { searchParams: SearchParams }) {
  const permissions = await getUserPermissionsMapServer();

  // Antes la página exigía el permiso de tickets; ahora alcanza con cualquiera de las dos
  // secciones. Sin ninguna, se vuelve al dashboard como antes.
  const isTabVisible = createTabVisibilityChecker(permissions);
  if (!isTabVisible('ayuda', 'tickets') && !isTabVisible('ayuda', 'manual')) redirect('/dashboard');

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="tickets"
      permissions={permissions}
      sectionNav
      tabs={[
        {
          value: 'tickets',
          label: (
            <span className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4" />
              Tickets
            </span>
          ),
          moduleSlug: 'ayuda',
          tabSlug: 'tickets',
          // El Centro de Ayuda trae su propio título.
          hideTitle: true,
          content: (
            <SectionErrorBoundary title="No se pudieron mostrar los tickets">
              <Suspense fallback={<MyTicketsListSkeleton />}>
                <TicketsTabContent searchParams={searchParams} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
        {
          value: 'manual',
          label: (
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Manual de uso
            </span>
          ),
          moduleSlug: 'ayuda',
          tabSlug: 'manual',
          content: (
            <SectionErrorBoundary title="No se pudo mostrar el manual">
              <Suspense fallback={<ManualSkeleton />}>
                <ManualTabContent searchParams={searchParams} permissions={permissions} />
              </Suspense>
            </SectionErrorBoundary>
          ),
        },
      ]}
    />
  );
}
