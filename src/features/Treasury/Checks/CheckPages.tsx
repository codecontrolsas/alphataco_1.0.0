import { Button } from '@/components/ui/button';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getCheckDetail } from '../actions/check-reads.server';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { CheckDetailView } from './components/CheckDetailView';

/** Un cheque por request, aunque lo pidan `generateMetadata` y la página. */
const loadCheckDetail = cache((id: string) => getCheckDetail(id));

export async function checkPageTitle(id: string): Promise<string> {
  const detail = await loadCheckDetail(id);
  return detail ? `Cheque Nº ${detail.number} · ${detail.bank} | Tesorería` : 'Cheque | Tesorería';
}

/** `/dashboard/treasury/checks/[id]`: datos, historial, deudas y acciones del cheque (spec Tesorería etapa 3a §4.3). */
export async function CheckPage({ id }: { id: string }) {
  const [detail, permissions] = await Promise.all([loadCheckDetail(id), getUserPermissionsMapServer()]);
  if (permissions['tesoreria:cheques:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  if (!detail) notFound();
  const can = {
    reject: permissions['tesoreria:cheques:update'] === true,
    cancel: permissions['tesoreria:cheques:delete'] === true,
    collect: permissions['tesoreria:cobranzas:create'] === true,
  };
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/treasury?tab=cheques">
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          Cheques
        </Link>
      </Button>
      <CheckDetailView detail={detail} can={can} />
    </div>
  );
}
