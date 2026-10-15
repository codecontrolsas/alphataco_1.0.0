'use client';

import { Button } from '@/components/ui/button';
import { RecordSectionNav } from '@/features/TabsManager/components/RecordSectionNav';
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
  /** Sección activa de la ficha (`?section=`); cualquier otro valor cae en los datos. */
  section?: string;
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
  section,
}: PreEmployeeReadViewProps) {
  const router = useRouter();
  const activeSection = section === 'documents' ? 'documents' : 'data';
  const buildHref = (value: string) => `?action=view&pre_employee_id=${preEmployee.id}&section=${value}`;

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

      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <RecordSectionNav
          ariaLabel="Secciones del candidato"
          activeValue={activeSection}
          items={[
            {
              value: 'data',
              label: 'Datos del candidato',
              icon: <User />,
              href: buildHref('data'),
            },
            {
              value: 'documents',
              label: 'Documentos',
              icon: <FileText />,
              href: buildHref('documents'),
            },
          ]}
        />
        <div className="min-w-0">
          {activeSection === 'documents' ? (
            <SectionCard
              title="Documentos del candidato"
              description="Los que aplican a la función asignada se incorporan al legajo al aprobarlo."
            >
              <PreEmployeeDocumentChecklist preEmployeeId={preEmployee.id} readOnly={documentsReadOnly} />
            </SectionCard>
          ) : (
            <PreEmployeeDataView preEmployee={preEmployee} />
          )}
        </div>
      </div>
    </div>
  );
}
