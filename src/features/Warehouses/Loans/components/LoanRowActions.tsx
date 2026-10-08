'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { ReturnLoanDialog } from './ReturnLoanDialog';
import { WriteOffLoanDialog } from './WriteOffLoanDialog';

export interface LoanRowActionsProps {
  unitId: string;
  /** Salida cuyo prestamo se devuelve (`Loan.exitMovementId`). */
  exitMovementId: string;
  serialNumber: string;
  materialName: string;
  /** Quien la tiene, ya formateado (`Loan.holder`). */
  holder: string | null;
  canReturn: boolean;
  canWriteOff: boolean;
}

/** Acciones por fila de la tabla de prestamos (devolver, dar de baja). */
export function LoanRowActions({
  unitId,
  exitMovementId,
  serialNumber,
  materialName,
  holder,
  canReturn,
  canWriteOff,
}: LoanRowActionsProps) {
  const [returning, setReturning] = useState(false);
  const [writingOff, setWritingOff] = useState(false);

  if (!canReturn && !canWriteOff) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones de ${serialNumber}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canReturn && (
            <DropdownMenuItem onSelect={() => setReturning(true)}>
              <Undo2 className="mr-2 h-4 w-4" />
              Devolver
            </DropdownMenuItem>
          )}
          {canWriteOff && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setWritingOff(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Dar de baja
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Montados solo al abrir: cada apertura arranca con el form limpio. */}
      {returning && (
        <ReturnLoanDialog
          open
          onOpenChange={setReturning}
          unitId={unitId}
          exitMovementId={exitMovementId}
          serialNumber={serialNumber}
          materialName={materialName}
          holder={holder}
        />
      )}
      {writingOff && (
        <WriteOffLoanDialog
          open
          onOpenChange={setWritingOff}
          unitId={unitId}
          serialNumber={serialNumber}
          materialName={materialName}
          holder={holder}
        />
      )}
    </>
  );
}
