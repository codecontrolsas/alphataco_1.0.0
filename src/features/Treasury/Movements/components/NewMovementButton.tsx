'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../actions/concepts.server';
import { MovementFormDialog } from './MovementFormDialog';

/** Botón "Nuevo movimiento" con su formulario (en la tab Movimientos y en el extracto). */
export function NewMovementButton({
  accounts,
  concepts,
  defaultAccountId,
}: {
  accounts: TreasuryAccountRow[];
  concepts: TreasuryConceptRow[];
  defaultAccountId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="brand" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        Nuevo movimiento
      </Button>
      {open && (
        <MovementFormDialog open={open} onOpenChange={setOpen} accounts={accounts} concepts={concepts} defaultAccountId={defaultAccountId} />
      )}
    </>
  );
}
