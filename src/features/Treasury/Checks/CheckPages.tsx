import { Button } from '@/components/ui/button';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getCheckDetail } from '../actions/checks.server';
import { NoPermission } from '../fallback/NoPermission';
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
  if (permissions['tesoreria:cheques:view'] !== true) return <NoPermission />;
  if (!detail) notFound();
  const can = {
    reject: permissions['tesoreria:cheques:update'] === true,
    cancel: permissions['tesoreria:cheques:delete'] === true,
    collect: permissions['tesoreria:cobranzas:create'] === true,
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/treasury?tab=cheques">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Cheques
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">
          Cheque Nº {detail.number} · {detail.bank}
        </h1>
      </div>
      <CheckDetailView detail={detail} can={can} />
    </div>
  );
}
