import { Button } from '@/components/ui/button';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionManagerServer } from '@/features/TabsManager';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Plus, UserSearch } from 'lucide-react';
import Link from 'next/link';
import CandidatosTabContent from './CandidatosTabContent';

/**
 * Módulo Selección.
 *
 * Era la tab "Candidatos" de Empleados. Salió a módulo propio porque no es otra vista del
 * legajo: es el circuito de incorporación, con su máquina de estados (`lib/state-machine.ts`),
 * su checklist de documentación y la aprobación de gerencia que recién al final crea el legajo.
 */
export default async function SeleccionComponent({ searchParams }: { searchParams: DataTableSearchParams }) {
  const permissions = await getUserPermissionsMapServer();

  // Ojo: la clave se arma a mano y TypeScript no la verifica. Si el módulo o la tab se
  // renombran, esto pasa a ser `undefined` y el botón desaparece sin que nada falle.
  const canCreate = permissions['seleccion:candidatos:create'] === true;

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="candidatos"
      permissions={permissions}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/dashboard/recruitment/detail?action=new">
              <Plus />
              Nuevo candidato
            </Link>
          </Button>
        )
      }
      tabs={[
        {
          value: 'candidatos',
          label: (
            <span className="flex items-center gap-2">
              <UserSearch className="h-4 w-4" />
              Candidatos
            </span>
          ),
          moduleSlug: 'seleccion',
          tabSlug: 'candidatos',
          content: <CandidatosTabContent searchParams={searchParams} />,
        },
      ]}
    />
  );
}
