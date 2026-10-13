'use client';

import { useState } from 'react';
import type { EmployeeDetailData } from '../actions.server';
import { EmployeeFormView } from './form/EmployeeFormView';
import { EmployeeReadView } from './view/EmployeeReadView';

interface EmployeeDetailClientProps {
  employee: EmployeeDetailData | null;
  employeeId: string;
  initialMode: 'view' | 'edit' | 'new';
  /** Identidad pre-renderizada en el servidor. */
  header: React.ReactNode;
  /** Slot de documentos (Server Component pre-renderizado) */
  documentsSlot: React.ReactNode;
  /** Slot de diagramas envuelto en Suspense (Server Component pre-renderizado) */
  diagramsSlot: React.ReactNode;
  /** Slot de indumentaria/EPP envuelto en Suspense (Server Component pre-renderizado) */
  clothingSlot: React.ReactNode;
}

/**
 * Legajo del empleado: alterna entre la lectura y el formulario sin navegar (el `?action=` de la
 * URL se actualiza con `replaceState` para que el enlace siga siendo compartible).
 */
export function EmployeeDetailClient({
  employee,
  employeeId,
  initialMode,
  header,
  documentsSlot,
  diagramsSlot,
  clothingSlot,
}: EmployeeDetailClientProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>(initialMode);

  const showMode = (next: 'view' | 'edit') => {
    setMode(next);
    window.history.replaceState(null, '', `?action=${next}&employee_id=${employeeId}`);
  };

  if (mode === 'new') {
    return <EmployeeFormView employee={null} mode="new" onClose={() => history.back()} />;
  }

  if (!employee) return null;

  if (mode === 'edit') {
    return <EmployeeFormView employee={employee} mode="edit" onClose={() => showMode('view')} />;
  }

  return (
    <EmployeeReadView
      employee={employee}
      employeeId={employeeId}
      header={header}
      documentsSlot={documentsSlot}
      diagramsSlot={diagramsSlot}
      clothingSlot={clothingSlot}
      onEdit={() => showMode('edit')}
    />
  );
}
