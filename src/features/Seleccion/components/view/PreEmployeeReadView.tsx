'use client';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { ArrowLeft, ExternalLink, FileText, Pencil, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PreEmployeeDetailData } from '../../actions/pre-employee-actions.server';
import type { PreEmployeeTransition } from '../../lib/state-machine';
import { PreEmployeeDocumentChecklist } from '../PreEmployeeDocumentChecklist';
import { PreEmployeeStatusBanner } from '../PreEmployeeStatusBanner';
import { PreEmployeeStepper } from '../PreEmployeeStepper';
import { PreEmployeeTransitionButtons } from '../PreEmployeeTransitionButtons';
import { PreEmployeeDataView } from './PreEmployeeDataView';
import { PreEmployeeIdentity } from './PreEmployeeIdentity';

interface PreEmployeeReadViewProps {
  preEmployee: PreEmployeeDetailData;
  /** Transiciones que el usuario puede ejecutar desde el estado actual (ya filtradas por permiso). */
  transitions: PreEmployeeTransition[];
  canApprove: boolean;
  canEditData: boolean;
  /** Los documentos se cargan y eliminan sólo mientras el candidato está en proceso o en pre ingreso. */
  documentsReadOnly: boolean;
  onEdit: () => void;
  onReject: () => void;
  onApprove: () => void;
}

/** Ficha del candidato en modo lectura: cabecera con las acciones de la etapa, circuito y pestañas. */
export function PreEmployeeReadView({
  preEmployee,
  transitions,
  canApprove,
  canEditData,
  documentsReadOnly,
  onEdit,
  onReject,
  onApprove,
}: PreEmployeeReadViewProps) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2">
        <ArrowLeft />
        Candidatos
      </Button>

      <RecordHeader
        identity={<PreEmployeeIdentity preEmployee={preEmployee} />}
        actions={
          <>
            {canEditData && (
              <Button variant="outline" onClick={onEdit}>
                <Pencil />
                Editar datos
              </Button>
            )}
            <PreEmployeeTransitionButtons
              preEmployeeId={preEmployee.id}
              transitions={transitions}
              onReject={onReject}
              onApprove={onApprove}
            />
            {preEmployee.employee_id && (
              <Button asChild>
                <Link href={`/dashboard/employee/action?action=view&employee_id=${preEmployee.employee_id}`}>
                  <ExternalLink />
                  Ver legajo{preEmployee.employees?.file ? ` N° ${preEmployee.employees.file}` : ''}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <PreEmployeeStatusBanner preEmployee={preEmployee} canApprove={canApprove} />
      <PreEmployeeStepper status={preEmployee.status} />

      <Tabs defaultValue="data" className="gap-6">
        <TabsList variant="line" className="h-11 w-full justify-start overflow-x-auto">
          <TabsTrigger value="data" className="flex-none px-4">
            <User />
            Datos del candidato
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex-none px-4">
            <FileText />
            Documentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data">
          <PreEmployeeDataView preEmployee={preEmployee} />
        </TabsContent>
        <TabsContent value="documents">
          <SectionCard
            title="Documentos del candidato"
            description="Los que aplican a la función asignada se incorporan al legajo al aprobarlo."
          >
            <PreEmployeeDocumentChecklist preEmployeeId={preEmployee.id} readOnly={documentsReadOnly} />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
