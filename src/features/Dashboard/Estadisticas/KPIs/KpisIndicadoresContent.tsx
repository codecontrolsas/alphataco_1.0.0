import { Card } from '@/components/ui/card';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { Suspense } from 'react';
import KpisIndicadoresList from './Indicadores/KpisIndicadoresList';
import { KpisIndicadoresSkeleton } from './Indicadores/fallback/KpisIndicadoresSkeleton';
import { KpiForm } from './components/KpiForm';

// ============================================================================
// TYPES
// ============================================================================

interface KpisIndicadoresContentProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// Takes care of: permissions fetch + layout (form + table)
// ============================================================================

export default async function KpisIndicadoresContent({ searchParams }: KpisIndicadoresContentProps) {
  const permissionsMap = await getUserPermissionsMapServer();

  const canCreateOrUpdate =
    permissionsMap['configuracion:kpis:create'] === true || permissionsMap['configuracion:kpis:update'] === true;

  return (
    <Card className="w-full">
      <ResizablePanelGroup className="min-h-[400px]" direction="horizontal">
        {canCreateOrUpdate && (
          <>
            <ResizablePanel defaultSize={30}>
              <KpiForm />
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        <ResizablePanel defaultSize={canCreateOrUpdate ? 70 : 100}>
          <Suspense fallback={<KpisIndicadoresSkeleton />}>
            <KpisIndicadoresList searchParams={searchParams} permissionsMap={permissionsMap} />
          </Suspense>
        </ResizablePanel>
      </ResizablePanelGroup>
    </Card>
  );
}
