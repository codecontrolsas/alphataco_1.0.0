import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { Suspense } from 'react';
import KpisIndicadoresList from './Indicadores/KpisIndicadoresList';
import { KpisIndicadoresSkeleton } from './Indicadores/fallback/KpisIndicadoresSkeleton';

// ============================================================================
// TYPES
// ============================================================================

interface KpisIndicadoresContentProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// Carga los permisos y monta la tabla a ancho completo; el alta y la edición
// viven en un Sheet dentro de `_KpisIndicadoresDataTable`.
// ============================================================================

export default async function KpisIndicadoresContent({ searchParams }: KpisIndicadoresContentProps) {
  const permissionsMap = await getUserPermissionsMapServer();

  return (
    <Suspense fallback={<KpisIndicadoresSkeleton />}>
      <KpisIndicadoresList searchParams={searchParams} permissionsMap={permissionsMap} />
    </Suspense>
  );
}
