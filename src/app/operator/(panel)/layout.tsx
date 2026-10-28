import { requireCompanyRoute } from '@/features/Modules/server/public-routes.server';
import { getOperatorContext } from '@/features/OperatorPanel/actions/session.server';
import { OperatorHeader } from '@/features/OperatorPanel/components/OperatorHeader';
import { OperatorLayoutProvider } from '@/features/OperatorPanel/components/operator-layout-provider';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Panel de Operario - Taller',
};

export default async function OperatorPanelLayout({ children }: { children: React.ReactNode }) {
  const context = await getOperatorContext();

  if (!context) {
    redirect('/operator/login');
  }

  // La empresa del operario es la que decide (F3.3): sin `mantenimiento` en su empresa el panel no existe.
  await requireCompanyRoute('/operator', context.companyId);

  return (
    <OperatorLayoutProvider context={context}>
      <div className="min-h-dvh bg-background flex flex-col">
        <OperatorHeader />
        <main className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">{children}</main>
      </div>
    </OperatorLayoutProvider>
  );
}
