'use client';

import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { TabsManagerClientSide } from '@/features/TabsManager/TabsManagerClientSide';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { ArrowLeft, BarChart3, Briefcase, FileText, Pencil, Shirt, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { EmployeeDetailData } from '../../actions.server';
import { PersonalDataView, WorkDataView } from '../EmployeeViewDisplay';
import { EmployeeQuickActions } from '../employee-quick-actions';

interface EmployeeReadViewProps {
  employee: NonNullable<EmployeeDetailData>;
  employeeId: string;
  /** Identidad pre-renderizada en el servidor (`EmployeeHeaderContent`). */
  header: React.ReactNode;
  documentsSlot: React.ReactNode;
  diagramsSlot: React.ReactNode;
  clothingSlot: React.ReactNode;
  onEdit: () => void;
}

const TabLabel = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <span className="flex items-center gap-2">
    {icon}
    <span className="sr-only sm:not-sr-only">{text}</span>
  </span>
);

/** Legajo en modo lectura: cabecera con acciones y pestañas por tema. */
export function EmployeeReadView({
  employee,
  employeeId,
  header,
  documentsSlot,
  diagramsSlot,
  clothingSlot,
  onEdit,
}: EmployeeReadViewProps) {
  const router = useRouter();
  const { canView } = usePermissions();

  const showContact = canView('empleados', 'datos-contacto');
  const hasDiagramAccess = canView('empleados', 'diagramas-empleado') || canView('empleados', 'new');
  const hasClothingAccess = canView('empleados', 'indumentaria_empleado');

  const tabs = [
    {
      value: 'personalData',
      label: <TabLabel icon={<User className="size-4" />} text="Datos personales" />,
      moduleSlug: 'empleados' as const,
      tabSlug: 'datos-personales' as const,
      content: <PersonalDataView employee={employee} showContact={showContact} />,
    },
    {
      value: 'workData',
      label: <TabLabel icon={<Briefcase className="size-4" />} text="Datos laborales" />,
      moduleSlug: 'empleados' as const,
      tabSlug: 'datos-laborales' as const,
      content: <WorkDataView employee={employee} />,
    },
    {
      value: 'documents',
      label: <TabLabel icon={<FileText className="size-4" />} text="Documentación" />,
      moduleSlug: 'documentacion' as const,
      tabSlug: 'documentos-de-empleados' as const,
      content: documentsSlot,
    },
    // Sin moduleSlug/tabSlug: la visibilidad de los diagramas la controlan sus subtabs internas.
    ...(hasDiagramAccess
      ? [
          {
            value: 'diagrams',
            label: <TabLabel icon={<BarChart3 className="size-4" />} text="Diagramas" />,
            content: diagramsSlot,
          },
        ]
      : []),
    ...(hasClothingAccess
      ? [
          {
            value: 'clothing',
            label: <TabLabel icon={<Shirt className="size-4" />} text="Indumentaria" />,
            moduleSlug: 'empleados' as const,
            tabSlug: 'indumentaria_empleado' as const,
            content: clothingSlot,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2">
        <ArrowLeft />
        Volver
      </Button>

      <RecordHeader
        identity={header}
        actions={
          <>
            <EmployeeQuickActions
              employeeId={employeeId}
              isActive={employee.is_active ?? true}
              email={employee.email ?? undefined}
            />
            <PermissionGuard module="empleados" tab="employees" action="update">
              <Button variant="outline" onClick={onEdit}>
                <Pencil />
                Editar
              </Button>
            </PermissionGuard>
          </>
        }
      />

      <TabsManagerClientSide<'empleados' | 'documentacion'>
        paramName="tab"
        defaultTab="personalData"
        variant="line"
        tabs={tabs}
        listClassName="h-11 w-full justify-start overflow-x-auto"
        triggerClassName="text-foreground/60 hover:text-foreground data-[state=active]:text-foreground flex-none px-4 font-medium transition-colors data-[state=active]:font-semibold data-[state=active]:shadow-none"
      />
    </div>
  );
}
