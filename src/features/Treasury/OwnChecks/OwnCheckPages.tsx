import { Button } from '@/components/ui/button';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getOwnCheckDetail } from '../actions/own-checks.server';
import { NoPermission } from '../fallback/NoPermission';
import { OWN_CHECK_KIND_LABELS } from '../lib/own-check-transitions';
import { OwnCheckDetailView } from './components/OwnCheckDetailView';

/** Un cheque por request, aunque lo pidan `generateMetadata` y la página. */
const loadOwnCheckDetail = cache((id: string) => getOwnCheckDetail(id));

export async function ownCheckPageTitle(id: string): Promise<string> {
  const detail = await loadOwnCheckDetail(id);
  return detail ? `${OWN_CHECK_KIND_LABELS[detail.kind]} propio Nº ${detail.number} | Tesorería` : 'Cheque propio | Tesorería';
}

/** `/dashboard/treasury/own-checks/[id]`: datos, historial, deuda y acciones del cheque propio (spec Tesorería etapa 3b §4.3). */
export async function OwnCheckPage({ id }: { id: string }) {
  const [detail, permissions] = await Promise.all([loadOwnCheckDetail(id), getUserPermissionsMapServer()]);
  if (permissions['tesoreria:cheques-propios:view'] !== true) return <NoPermission />;
  if (!detail) notFound();
  const can = {
    update: permissions['tesoreria:cheques-propios:update'] === true,
    delete: permissions['tesoreria:cheques-propios:delete'] === true,
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/treasury?tab=cheques-propios">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Cheques propios
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">
          {OWN_CHECK_KIND_LABELS[detail.kind]} propio Nº {detail.number} · {detail.account.name}
        </h1>
      </div>
      <OwnCheckDetailView detail={detail} can={can} />
    </div>
  );
}
