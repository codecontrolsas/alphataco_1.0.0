'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import { TransferFormDialog } from './TransferFormDialog';

/** Botón "Nueva transferencia" con su formulario. */
export function NewTransferButton({ accounts }: { accounts: TreasuryAccountRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="brand" size="sm" onClick={() => setOpen(true)} disabled={accounts.length < 2}>
        <Plus className="mr-1 h-4 w-4" />
        Nueva transferencia
      </Button>
      {open && <TransferFormDialog open={open} onOpenChange={setOpen} accounts={accounts} />}
    </>
  );
}
