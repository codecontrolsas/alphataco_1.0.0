import { TALLER_VIEW_TABS } from '@/features/Mantenimiento/lib/taller-visibility';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Suspense } from 'react';
import { InboxList } from './components/InboxList';
import { InboxSkeleton } from './fallback/InboxSkeleton';
import { getInboxForUser, isInboxEnabled } from './lib/registry.server';

async function InboxBody({ type, canSeeTaller }: { type?: string; canSeeTaller: boolean }) {
  const initialData = await getInboxForUser(type);
  return <InboxList initialData={initialData} type={type} canSeeTaller={canSeeTaller} />;
}

/**
 * Página Mi bandeja: lo que el usuario tiene para decidir, de todos los módulos. Sin tab de permisos propia: se ve si
 * algún proveedor está habilitado para el usuario (cada uno mira SUS permisos) y su módulo está encendido (los permisos
 * de un módulo apagado no llegan al mapa).
 */
export async function InboxPageContent({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const permissions = await getUserPermissionsMapServer();

  if (!isInboxEnabled(permissions)) {
    return (
      <StateBlock
        variant="noperm"
        title="Sin acceso a Mi bandeja"
        description="No tenés permisos para ver decisiones pendientes."
      />
    );
  }

  const rawType = searchParams.type;
  const type = typeof rawType === 'string' && rawType.length > 0 ? rawType : undefined;

  const canSeeTaller = TALLER_VIEW_TABS.some((tab) => permissions[`mantenimiento:${tab}:view`] === true);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Mi bandeja" description="Lo que necesita tu decisión, en un solo lugar." />
      <Suspense fallback={<InboxSkeleton />}>
        <InboxBody type={type} canSeeTaller={canSeeTaller} />
      </Suspense>
    </div>
  );
}
