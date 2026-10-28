import { ClothingLayoutProvider } from '@/app/clothing/clothing-layout-provider';
import { Skeleton } from '@/components/ui/skeleton';
import { clothingLogout, getClothingOperatorContext } from '@/features/Clothing/actions/session.server';
import { requireCompanyRoute } from '@/features/Modules/server/public-routes.server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ClothingPanelHeader } from './ClothingPanelHeader';

export const metadata = {
  title: 'Entrega de Indumentaria',
};

function ClothingPanelSkeleton() {
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b bg-background px-4 py-3 flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-24" />
      </header>
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-48 lg:col-span-1" />
            <Skeleton className="h-96 lg:col-span-2" />
          </div>
        </div>
      </main>
    </div>
  );
}

async function ClothingPanelContent({ children }: { children: React.ReactNode }) {
  const context = await getClothingOperatorContext();

  if (!context) {
    redirect('/clothing/login');
  }

  // La empresa del operario decide (F3.3): sin `indumentaria` en su empresa el panel no existe.
  await requireCompanyRoute('/clothing', context.companyId);

  return (
    <ClothingLayoutProvider context={context}>
      <div className="min-h-dvh bg-background flex flex-col">
        <ClothingPanelHeader employeeName={context.employeeName} logoutAction={clothingLogout} />
        <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">{children}</main>
      </div>
    </ClothingLayoutProvider>
  );
}

export default function ClothingPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ClothingPanelSkeleton />}>
      <ClothingPanelContent>{children}</ClothingPanelContent>
    </Suspense>
  );
}
