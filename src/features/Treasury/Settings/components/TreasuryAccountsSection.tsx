'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { DateFormField, InputFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Pencil, Plus, Power, RotateCcw, Scale, Trash2, Wallet, WalletCards } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { OpeningBalanceDialog } from '../../Movements/components/OpeningBalanceDialog';
import {
  createTreasuryAccount,
  deleteTreasuryAccount,
  setTreasuryAccountActive,
  updateTreasuryAccount,
  type TreasuryAccountRow,
} from '../../actions/accounts.server';
import { formatDay } from '../../lib/dates';
import { invalidateTreasury } from '../../lib/invalidate';
import {
  TREASURY_ACCOUNT_KIND_LABELS,
  treasuryAccountFormSchema,
  type TreasuryAccountFormValues,
} from '../../schemas/accounts';

const logger = new Logger('Treasury/TreasuryAccountsSection');

const EMPTY: TreasuryAccountFormValues = {
  kind: 'BANK',
  name: '',
  bankName: '',
  accountNumber: '',
  cbu: '',
  openingDate: '',
  openingAmount: '',
};

type Opening = { id: string; date: string; amount: string };

/**
 * Cuentas bancarias y cajas (spec Tesorería etapa 1 §4): alta con saldo inicial opcional, edición,
 * saldo inicial, desactivar (confirma si el saldo no es 0) y borrar (solo sin movimientos ni pagos).
 */
export function TreasuryAccountsSection({
  accounts,
  openings,
  canCreate,
  canUpdate,
  canDelete,
}: {
  accounts: TreasuryAccountRow[];
  openings: Record<string, Opening>;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TreasuryAccountRow | 'new' | null>(null);
  const [openingFor, setOpeningFor] = useState<TreasuryAccountRow | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<TreasuryAccountRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TreasuryAccountRow | null>(null);

  const form = useForm<TreasuryAccountFormValues>({
    resolver: zodResolver(treasuryAccountFormSchema),
    defaultValues: EMPTY,
  });
  const kind = useWatch({ control: form.control, name: 'kind' });

  const openForm = (target: TreasuryAccountRow | 'new') => {
    form.reset(
      target === 'new'
        ? EMPTY
        : {
            ...EMPTY,
            kind: target.kind,
            name: target.name,
            bankName: target.bank_name ?? '',
            accountNumber: target.account_number ?? '',
            cbu: target.cbu ?? '',
          }
    );
    setEditing(target);
  };

  const refresh = () => {
    invalidateTreasury(queryClient);
    router.refresh();
  };

  const save = useMutation({
    mutationFn: async (values: TreasuryAccountFormValues) =>
      unwrapAction(
        editing && editing !== 'new'
          ? await updateTreasuryAccount(editing.id, values)
          : await createTreasuryAccount(values)
      ),
    onSuccess: (_data, values) => {
      toast.success(editing === 'new' ? `${values.name} creada` : `${values.name} actualizada`);
      setEditing(null);
      refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar la cuenta', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la cuenta');
    },
  });

  const toggle = useMutation({
    mutationFn: async (account: TreasuryAccountRow) =>
      unwrapAction(await setTreasuryAccountActive(account.id, !account.is_active)),
    onSuccess: (_data, account) => {
      toast.success(account.is_active ? `${account.name} desactivada` : `${account.name} reactivada`);
      setConfirmDeactivate(null);
      refresh();
    },
    onError: (error) => {
      logger.error('Error al cambiar la cuenta', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar la cuenta');
    },
  });

  const remove = useMutation({
    mutationFn: async (account: TreasuryAccountRow) => unwrapAction(await deleteTreasuryAccount(account.id)),
    onSuccess: (_data, account) => {
      toast.success(`${account.name} borrada`);
      setConfirmDelete(null);
      refresh();
    },
    onError: (error) => {
      setConfirmDelete(null);
      toast.error(error instanceof Error ? error.message : 'No se pudo borrar la cuenta');
    },
  });

  // Desactivar una cuenta con saldo pide confirmación mostrando el saldo.
  const onToggle = (account: TreasuryAccountRow) => {
    if (account.is_active && (account.balance !== '0.00' || account.projected !== '0.00')) {
      setConfirmDeactivate(account);
      return;
    }
    toggle.mutate(account);
  };

  return (
    <SectionCard
      title="Cuentas y cajas"
      description="Cuentas bancarias y cajas de efectivo, con su saldo inicial. Compras paga desde acá."
      action={
        canCreate && (
          <Button type="button" size="sm" variant="outline" onClick={() => openForm('new')}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar
          </Button>
        )
      }
    >
      {accounts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Todavía no hay cuentas. Hacen falta para registrar movimientos y pagos.
        </p>
      ) : (
        <ul className="divide-y">
          {accounts.map((a) => {
            const Icon = a.kind === 'BANK' ? Landmark : a.kind === 'CHECK_PORTFOLIO' ? WalletCards : Wallet;
            const opening = openings[a.id];
            return (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={a.is_active ? 'truncate' : 'truncate text-muted-foreground'}>{a.name}</span>
                    {!a.is_active && <Badge variant="outline">Inactiva</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {TREASURY_ACCOUNT_KIND_LABELS[a.kind]}
                    {a.bank_name ? ` · ${a.bank_name}` : ''}
                    {a.account_number ? ` · ${a.account_number}` : ''}
                    {a.cbu ? ` · CBU ${a.cbu}` : ''}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.kind === 'CHECK_PORTFOLIO'
                      ? 'Cheques en cartera'
                      : opening
                        ? `Saldo inicial ${formatMoney(opening.amount)} al ${formatDay(opening.date)}`
                        : 'Sin saldo inicial'}
                    {' · '}Saldo hoy <span className="tabular-nums">{formatMoney(a.balance)}</span>
                  </p>
                </div>
                {(canUpdate || canDelete) && (
                  <div className="flex shrink-0 items-center">
                    {canUpdate && a.is_active && a.kind !== 'CHECK_PORTFOLIO' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Saldo inicial de ${a.name}`}
                        title="Saldo inicial"
                        onClick={() => setOpeningFor(a)}
                      >
                        <Scale className="h-4 w-4" />
                      </Button>
                    )}
                    {canUpdate && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Editar ${a.name}`}
                          onClick={() => openForm(a)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={a.is_active ? `Desactivar ${a.name}` : `Reactivar ${a.name}`}
                          onClick={() => onToggle(a)}
                          disabled={toggle.isPending}
                        >
                          {a.is_active ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Borrar ${a.name}`}
                        onClick={() => setConfirmDelete(a)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Nueva cuenta o caja' : 'Editar cuenta o caja'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BANK">{TREASURY_ACCOUNT_KIND_LABELS.BANK}</SelectItem>
                        <SelectItem value="CASH">{TREASURY_ACCOUNT_KIND_LABELS.CASH}</SelectItem>
                        <SelectItem value="CHECK_PORTFOLIO">{TREASURY_ACCOUNT_KIND_LABELS.CHECK_PORTFOLIO}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <InputFormField
                control={form.control}
                name="name"
                label="Nombre"
                autoFocus
                placeholder={
                  kind === 'BANK'
                    ? 'Banco Galicia CC $'
                    : kind === 'CHECK_PORTFOLIO'
                      ? 'Cartera de cheques'
                      : 'Caja administración'
                }
              />
              {kind === 'BANK' && (
                <>
                  <InputFormField control={form.control} name="bankName" label="Banco (opcional)" />
                  <InputFormField control={form.control} name="accountNumber" label="Número de cuenta (opcional)" />
                  <InputFormField
                    control={form.control}
                    name="cbu"
                    label="CBU (opcional)"
                    inputMode="numeric"
                    maxLength={22}
                  />
                </>
              )}
              {editing === 'new' && kind === 'CHECK_PORTFOLIO' && (
                <p className="text-sm text-muted-foreground">
                  Una cartera guarda los cheques recibidos de clientes. No lleva saldo inicial: los cheques que ya estén
                  en mano se cargan desde Tesorería → Cheques → Carga inicial.
                </p>
              )}
              {editing === 'new' && kind !== 'CHECK_PORTFOLIO' && (
                <>
                  <Separator />
                  <p className="text-sm font-medium">Saldo inicial (opcional)</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DateFormField control={form.control} name="openingDate" label="Fecha" />
                    <InputFormField
                      control={form.control}
                      name="openingAmount"
                      label="Importe"
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  </div>
                  <FormDescription>
                    Lo que había el día que se empieza a usar Tesorería. Negativo si arranca en descubierto.
                  </FormDescription>
                </>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {openingFor && (
        <OpeningBalanceDialog
          open
          onOpenChange={(open) => !open && setOpeningFor(null)}
          account={{ id: openingFor.id, name: openingFor.name }}
          current={openings[openingFor.id] ?? null}
        />
      )}

      <AlertDialog open={confirmDeactivate !== null} onOpenChange={(open) => !open && setConfirmDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar {confirmDeactivate?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tiene saldo {formatMoney(confirmDeactivate?.balance)}
              {confirmDeactivate && confirmDeactivate.projected !== confirmDeactivate.balance
                ? ` (proyectado ${formatMoney(confirmDeactivate.projected)})`
                : ''}
              . No va a aceptar movimientos nuevos ni pagos; su saldo y sus movimientos se siguen viendo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggle.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={toggle.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDeactivate) toggle.mutate(confirmDeactivate);
              }}
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo se puede borrar una cuenta sin movimientos ni pagos. Si los tiene, desactivala.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) remove.mutate(confirmDelete);
              }}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
