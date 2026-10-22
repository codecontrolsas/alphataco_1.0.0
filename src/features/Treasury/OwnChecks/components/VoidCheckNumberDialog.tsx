'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Logger } from '@/lib/logger';
import { InputFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { voidOwnCheckNumber, type CheckbookRow } from '../../actions/own-checks.server';
import { invalidateTreasury } from '../../lib/invalidate';
import { voidCheckNumberSchema, type VoidCheckNumberValues } from '../../schemas/own-checks';

const logger = new Logger('Treasury/VoidCheckNumberDialog');

interface VoidCheckNumberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkbook: CheckbookRow;
}

/** Inutilizar un número libre de la chequera (roto, perdido, mal llenado): no se vuelve a ofrecer. */
export function VoidCheckNumberDialog({ open, onOpenChange, checkbook }: VoidCheckNumberDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<VoidCheckNumberValues>({
    resolver: zodResolver(voidCheckNumberSchema),
    values: { checkbookId: checkbook.id, number: checkbook.nextNumber ?? '', reason: '' },
  });

  const save = useMutation({
    mutationFn: async (values: VoidCheckNumberValues) => unwrapAction(await voidOwnCheckNumber(values)),
    onSuccess: (result) => {
      toast.success(`Nº ${result.number} inutilizado`);
      invalidateTreasury(queryClient);
      router.refresh();
      onOpenChange(false);
    },
    onError: (error) => {
      logger.error('Error al inutilizar el número', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo inutilizar el número');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inutilizar un número</DialogTitle>
          <DialogDescription>
            Chequera {checkbook.account.name}, del {checkbook.firstNumber} al {checkbook.lastNumber}. El número queda
            anulado y no se vuelve a ofrecer.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <InputFormField
              control={form.control}
              name="number"
              label="Número"
              itemClassName="max-w-[12rem]"
              inputMode="numeric"
              className="tabular-nums"
            />
            <TextareaFormField
              control={form.control}
              name="reason"
              label="Motivo"
              rows={3}
              placeholder="Se rompió, se perdió, se llenó mal…"
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={save.isPending}>
                {save.isPending ? 'Inutilizando…' : 'Inutilizar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
