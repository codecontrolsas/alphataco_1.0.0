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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Pencil, Plus, Power, RotateCcw, Scale, Trash2, Wallet } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createTreasuryAccount,
  deleteTreasuryAccount,
  setTreasuryAccountActive,
  updateTreasuryAccount,
  type TreasuryAccountRow,
} from '../../actions/accounts.server';
import { OpeningBalanceDialog } from '../../Movements/components/OpeningBalanceDialog';
import { invalidateTreasury } from '../../lib/invalidate';
import { TREASURY_ACCOUNT_KIND_LABELS, treasuryAccountFormSchema, type TreasuryAccountFormValues } from '../../schemas/accounts';

const logger = new Logger('Treasury/TreasuryAccountsSection');

const EMPTY: TreasuryAccountFormValues = { kind: 'BANK', name: '', bankName: '', accountNumber: '', cbu: '', openingDate: '', openingAmount: '' };

type Opening = { id: string; date: string; amount: string };

/**
 * Cuentas bancarias y cajas (spec Tesorería etapa 1 §4): alta con saldo inicial opcional, edición,
 * saldo inicial, desactivar (confirma si el saldo no es 0) y borrar (solo sin movimientos ni pagos).
 */
export function TreasuryAccountsSection({
  accounts,
  openings,
  canUpdate,
}: {
  accounts: TreasuryAccountRow[];
  openings: Record<string, Opening>;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TreasuryAccountRow | 'new' | null>(null);
  const [openingFor, setOpeningFor] = useState<TreasuryAccountRow | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<TreasuryAccountRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TreasuryAccountRow | null>(null);

  const form = useForm<TreasuryAccountFormValues>({ resolver: zodResolver(treasuryAccountFormSchema), defaultValues: EMPTY });
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
      unwrapAction(editing && editing !== 'new' ? await updateTreasuryAccount(editing.id, values) : await createTreasuryAccount(values)),
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
    mutationFn: async (account: TreasuryAccountRow) => unwrapAction(await setTreasuryAccountActive(account.id, !account.is_active)),
    onSuccess: (_data, account) => {
      toast.success(account.is_active ? `${account.name} desactivada` : `${account.name} reactivada`);
      setConfirmDeactivate(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo cambiar la cuenta'),
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Cuentas y cajas</CardTitle>
          <CardDescription>Cuentas bancarias y cajas de efectivo, con su saldo inicial. Compras paga desde acá.</CardDescription>
        </div>
        {canUpdate && (
          <Button type="button" size="sm" variant="outline" onClick={() => openForm('new')}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay cuentas. Hacen falta para registrar movimientos y pagos.</p>
        ) : (
          <ul className="divide-y">
            {accounts.map((a) => {
              const Icon = a.kind === 'BANK' ? Landmark : Wallet;
              const opening = openings[a.id];
              return (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                      {opening
                        ? `Saldo inicial ${formatMoney(opening.amount)} al ${moment(opening.date, 'YYYY-MM-DD').format('DD/MM/YYYY')}`
                        : 'Sin saldo inicial'}
                      {' · '}Saldo hoy <span className="tabular-nums">{formatMoney(a.balance)}</span>
                    </p>
                  </div>
                  {canUpdate && (
                    <div className="flex shrink-0 items-center">
                      {a.is_active && (
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
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${a.name}`} onClick={() => openForm(a)}>
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

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
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input autoFocus placeholder={kind === 'BANK' ? 'Banco Galicia CC $' : 'Caja administración'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {kind === 'BANK' && (
                <>
                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Banco (opcional)</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accountNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de cuenta (opcional)</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cbu"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CBU (opcional)</FormLabel>
                        <FormControl>
                          <Input inputMode="numeric" maxLength={22} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              {editing === 'new' && (
                <>
                  <Separator />
                  <p className="text-sm font-medium">Saldo inicial (opcional)</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="openingDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha</FormLabel>
                          <FormControl>
                            <EnhancedDatePicker
                              date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
                              setDate={(d) => field.onChange(d ? moment(d).format('YYYY-MM-DD') : '')}
                              placeholder="DD/MM/AAAA"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="openingAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Importe</FormLabel>
                          <FormControl>
                            <Input inputMode="decimal" placeholder="0,00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormDescription>Lo que había el día que se empieza a usar Tesorería. Negativo si arranca en descubierto.</FormDescription>
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
            <AlertDialogDescription>Solo se puede borrar una cuenta sin movimientos ni pagos. Si los tiene, desactivala.</AlertDialogDescription>
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
    </Card>
  );
}
