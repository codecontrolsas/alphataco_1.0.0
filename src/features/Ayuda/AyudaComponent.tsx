import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { LifeBuoy } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { manualHref } from './Manual/lib/manual-urls';
import { TicketsTabContent } from './Tickets/TicketsTabContent';
import { MyTicketsListSkeleton } from './fallback/MyTicketsListSkeleton';

type SearchParams = { [key: string]: string | string[] | undefined };

/**
 * Módulo Ayuda: "Tickets" (soporte con TaskApp). El "Manual de uso" pasó a su página propia
 * (`/manual`, ticket 809): los enlaces viejos `?tab=manual[&guide=…]` redirigen ahí, y quien solo
 * puede ver el manual también cae ahí al entrar a Ayuda.
 */
export default async function AyudaComponent({ searchParams }: { searchParams: SearchParams }) {
  const permissions = await getUserPermissionsMapServer();

  const isTabVisible = createTabVisibilityChecker(permissions);
  const canSeeTickets = isTabVisible('ayuda', 'tickets');
  const canSeeManual = isTabVisible('ayuda', 'manual');
  if (!canSeeTickets && !canSeeManual) redirect('/dashboard');

  const tab = typeof searchParams.tab === 'string' ? searchParams.tab : null;
  if (canSeeManual && (tab === 'manual' || !canSeeTickets)) {
    const guide = typeof searchParams.guide === 'string' && searchParams.guide ? searchParams.guide : undefined;
    redirect(manualHref(guide));
  }

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="tickets"
      permissions={permissions}
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
      ]}
    />
  );
}
