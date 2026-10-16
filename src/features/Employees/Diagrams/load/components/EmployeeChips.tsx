'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import type { EmployeeOption } from '../schemas';
import { EmployeePickerSheet, type WorkflowFilterOption } from './EmployeePickerSheet';

interface EmployeeChipsProps {
  value: EmployeeOption[];
  onChange: (employees: EmployeeOption[]) => void;
  max: number;
  /** Empleado fijo (detalle del empleado): se muestra sin poder quitarlo ni cambiarlo. */
  fixed?: boolean;
  invalid?: boolean;
  withFilters?: boolean;
  workflowOptions?: WorkflowFilterOption[];
  defaultWorkflowId?: string;
  /** Descripción para lectores de pantalla del grupo de chips. */
  ariaLabel: string;
}

/** Empleados elegidos como chips (`[legajo] Apellido, Nombre`) y el botón que abre el buscador. */
export function EmployeeChips({
  value,
  onChange,
  max,
  fixed = false,
  invalid = false,
  withFilters,
  workflowOptions,
  defaultWorkflowId,
  ariaLabel,
}: EmployeeChipsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isSingle = max === 1;

  const remove = (id: string) => onChange(value.filter((employee) => employee.id !== id));

  return (
    <div className="flex flex-col gap-2">
      <ul
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-2 rounded-md border p-2',
          value.length > 8 && 'max-h-44 overflow-y-auto',
          invalid && 'border-destructive'
        )}
      >
        {value.length === 0 ? (
          <li className="text-muted-foreground px-1 text-sm">
            {isSingle ? 'Ningún empleado elegido' : 'Ningún empleado elegido todavía'}
          </li>
        ) : (
          value.map((employee) => (
            <li
              key={employee.id}
              className="bg-secondary text-secondary-foreground flex max-w-full items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs"
            >
              <span className="max-w-56 truncate" title={employee.label}>
                {employee.label}
              </span>
              {fixed ? (
                <span className="size-2" aria-hidden="true" />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="rounded-full"
                  onClick={() => remove(employee.id)}
                  aria-label={`Quitar ${employee.label}`}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </li>
          ))
        )}
      </ul>

      {fixed ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <UserPlus aria-hidden="true" />
            {isSingle ? (value.length > 0 ? 'Cambiar empleado' : 'Elegir empleado') : 'Agregar empleados'}
          </Button>
          {!isSingle ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {value.length} de {max}
            </span>
          ) : null}
        </div>
      )}

      {fixed ? null : (
        <EmployeePickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          selected={value}
          onApply={onChange}
          max={max}
          withFilters={withFilters}
          workflowOptions={workflowOptions}
          defaultWorkflowId={defaultWorkflowId}
        />
      )}
    </div>
  );
}
