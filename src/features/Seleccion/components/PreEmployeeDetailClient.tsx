'use client';

import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PreEmployeeDetailData } from '../actions/pre-employee-actions.server';
import { getAvailableTransitions, isEditableStatus } from '../lib/state-machine';
import { ApprovePreEmployeeSheet } from './ApprovePreEmployeeSheet';
import { RejectPreEmployeeDialog } from './RejectPreEmployeeDialog';
import { PreEmployeeFormView } from './form/PreEmployeeFormView';
import { PreEmployeeReadView } from './view/PreEmployeeReadView';

interface PreEmployeeDetailClientProps {
  preEmployee: PreEmployeeDetailData | null;
  mode: 'new' | 'view' | 'edit';
}

/**
 * Ficha del candidato: alterna entre lectura y formulario sin navegar (el `?action=` de la URL
 * se actualiza con `replaceState`) y aloja los diálogos de rechazo y aprobación de gerencia.
 */
export function PreEmployeeDetailClient({ preEmployee, mode: initialMode }: PreEmployeeDetailClientProps) {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [mode, setMode] = useState(initialMode);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showApproveSheet, setShowApproveSheet] = useState(false);

  const canCreate = hasPermission('seleccion', 'candidatos', 'create');
  const canUpdate = hasPermission('seleccion', 'candidatos', 'update');
  const canApprove = hasPermission('seleccion', 'candidatos', 'approve');

  const showMode = (next: 'view' | 'edit') => {
    setMode(next);
    window.history.replaceState(null, '', `?action=${next}&pre_employee_id=${preEmployee?.id ?? ''}`);
  };

  if (!preEmployee) {
    // Alta: sin permiso de creación no hay formulario que ofrecer.
    if (!canCreate) return null;
    return <PreEmployeeFormView preEmployee={null} onClose={() => router.push('/dashboard/recruitment')} />;
  }

  // Los datos sólo se editan mientras el candidato está en proceso o en pre ingreso.
  const canEditData = canUpdate && isEditableStatus(preEmployee.status);

  if (mode === 'edit' && canEditData) {
    return <PreEmployeeFormView preEmployee={preEmployee} onClose={() => showMode('view')} />;
  }

  const transitions = getAvailableTransitions(preEmployee.status).filter((transition) =>
    hasPermission('seleccion', 'candidatos', transition.requiredPermissionAction)
  );

  return (
    <>
      <PreEmployeeReadView
        preEmployee={preEmployee}
        transitions={transitions}
        canApprove={canApprove}
        canEditData={canEditData}
        documentsReadOnly={!canEditData}
        onEdit={() => showMode('edit')}
        onReject={() => setShowRejectDialog(true)}
        onApprove={() => setShowApproveSheet(true)}
      />

      {/* Acciones de gerencia */}
      {canApprove && (
        <>
          <RejectPreEmployeeDialog
            preEmployeeId={preEmployee.id}
            open={showRejectDialog}
            onOpenChange={setShowRejectDialog}
            onRejected={() => router.refresh()}
          />

          <ApprovePreEmployeeSheet
            preEmployeeId={preEmployee.id}
            proposedHierarchicalPosition={preEmployee.proposed_hierarchical_position}
            proposedCompanyPosition={preEmployee.proposed_company_position}
            open={showApproveSheet}
            onOpenChange={setShowApproveSheet}
            onApproved={(employeeId) => router.push(`/dashboard/employee/action?action=view&employee_id=${employeeId}`)}
          />
        </>
      )}
    </>
  );
}
