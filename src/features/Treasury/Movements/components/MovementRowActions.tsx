'use client';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Logger } from '@/lib/logger';
import type { treasury_movement_kind } from '@/generated/prisma/enums';
import { useMutation } from '@tanstack/react-query';
import { Ban, MoreHorizontal, Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../actions/concepts.server';
import { cancelManualMovement, getMovementDetail, type MovementDetail } from '../../actions/movements.server';
import { CancelReasonDialog } from '../../components/CancelReasonDialog';
import { MovementFormDialog } from './MovementFormDialog';
import { OpeningBalanceDialog } from './OpeningBalanceDialog';

const logger = new Logger('Treasury/MovementRowActions');

const RECONCILED_LOCK_TITLE = 'Conciliado con el extracto: desconcilialo primero';

export interface MovementRowActionsProps {
  movement: { id: string; kind: treasury_movement_kind; cancelled: boolean; reconciled: boolean; accountName: string };
  accounts: TreasuryAccountRow[];
  concepts: TreasuryConceptRow[];
}

/**
 * Editar y anular un movimiento manual o un saldo inicial vigente. Los automáticos (transferencias
 * y pagos) no tienen acciones: se revierten desde su documento. La fila decide si se muestra según
 * el permiso `tesoreria:movimientos:update`.
 */
export function MovementRowActions({ movement, accounts, concepts }: MovementRowActionsProps) {
  const [editing, setEditing] = useState<MovementDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useMutation({
    mutationFn: async () => {
      const detail = await getMovementDetail(movement.id);
      if (!detail) throw new Error('El movimiento no existe');
      return detail;
    },
    onSuccess: setEditing,
    onError: (error) => {
      logger.error('Error al cargar el movimiento', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el movimiento');
    },
  });

  if (movement.cancelled || (movement.kind !== 'MANUAL' && movement.kind !== 'OPENING')) return null;
  const isOpening = movement.kind === 'OPENING';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones del movimiento">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={load.isPending || movement.reconciled}
            title={movement.reconciled ? RECONCILED_LOCK_TITLE : undefined}
            onSelect={() => load.mutate()}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {isOpening ? 'Editar saldo inicial' : 'Editar'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={movement.reconciled}
            title={movement.reconciled ? RECONCILED_LOCK_TITLE : undefined}
            onSelect={() => setCancelling(true)}
          >
            <Ban className="mr-2 h-4 w-4" />
            Anular
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editing && !isOpening && (
        <MovementFormDialog open onOpenChange={(open) => !open && setEditing(null)} accounts={accounts} concepts={concepts} editing={editing} />
      )}
      {editing && isOpening && (
        <OpeningBalanceDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          account={{ id: editing.accountId, name: movement.accountName }}
          current={{ id: editing.id, date: editing.date, amount: editing.amount }}
        />
      )}
      <CancelReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={isOpening ? 'Anular el saldo inicial' : 'Anular el movimiento'}
        description={`Deja de sumar en el saldo de «${movement.accountName}». Queda en el extracto tachado, con el motivo.`}
        successMessage={isOpening ? 'Saldo inicial anulado' : 'Movimiento anulado'}
        run={(reason) => cancelManualMovement(movement.id, reason)}
      />
    </>
  );
}
