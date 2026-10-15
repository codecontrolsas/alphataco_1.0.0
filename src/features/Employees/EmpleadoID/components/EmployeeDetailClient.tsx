'use client';

import { createContext, useContext, useState } from 'react';
import type { EmployeeDetailData } from '../actions.server';
import { EmployeeFormView } from './form/EmployeeFormView';

/** Abre el formulario de edición del legajo desde cualquier botón de la ficha (renderizada en el servidor). */
const EmployeeEditContext = createContext<(() => void) | null>(null);

export function useStartEmployeeEdit() {
  return useContext(EmployeeEditContext);
}

interface EmployeeDetailClientProps {
  employee: EmployeeDetailData | null;
  employeeId: string;
  initialMode: 'view' | 'edit' | 'new';
  /** Ficha en lectura, ya armada en el servidor (cabecera + secciones). */
  readView: React.ReactNode;
}

/**
 * Legajo del empleado: alterna entre la ficha y el formulario sin navegar (el `?action=` de la
 * URL se actualiza con `replaceState` para que el enlace siga siendo compartible).
 */
export function EmployeeDetailClient({ employee, employeeId, initialMode, readView }: EmployeeDetailClientProps) {
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

  return <EmployeeEditContext.Provider value={() => showMode('edit')}>{readView}</EmployeeEditContext.Provider>;
}
