'use client';

import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { useStartEmployeeEdit } from '../EmployeeDetailClient';

/** "Editar legajo" de la cabecera. El permiso (`employees:update`) lo verifica quien lo renderiza. */
export function EmployeeEditButton() {
  const startEdit = useStartEmployeeEdit();
  if (!startEdit) return null;

  return (
    <Button type="button" variant="outline" className="min-h-10" onClick={startEdit}>
      <Pencil aria-hidden="true" />
      Editar legajo
    </Button>
  );
}
