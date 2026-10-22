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
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, WalletCards } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { getCheckOperationFormData } from '../../actions/check-reads.server';
import { createOpeningChecks } from '../../actions/checks.server';
import { searchCollectionCustomers } from '../../actions/customer-statement.server';
import { CHECK_KIND_LABELS } from '../../lib/check-transitions';
import type { CheckOperationFormData } from '../../lib/check-types';
import { invalidateTreasury } from '../../lib/invalidate';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';
import { openingChecksSchema, type CheckDataValues, type OpeningChecksValues } from '../../schemas/checks';

const logger = new Logger('Treasury/OpeningChecksButton');

const toDate = (value: string) => (value ? moment(value, 'YYYY-MM-DD').toDate() : undefined);
const fromDate = (value: Date | undefined) => (value ? moment(value).format('YYYY-MM-DD') : '');

/** Carga inicial de cheques que ya estaban en mano al empezar a usar el sistema (spec Tesorería etapa 3a). */
export function OpeningChecksButton() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.checkOperationForm, 'opening'],
    queryFn: () => getCheckOperationFormData([]),
    enabled: open,
  });
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <WalletCards className="mr-1 h-4 w-4" />
        Carga inicial
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Carga inicial de cheques</DialogTitle>
            <DialogDescription>
              Cheques de clientes que ya estaban en la empresa. Cada uno entra a la cartera con la fecha de la carga.
            </DialogDescription>
          </DialogHeader>
          {isLoading || !data ? (
            <Skeleton className="h-40 w-full" />
          ) : data.portfolios.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Primero creá una cartera de cheques en Tesorería → Configuración.
            </p>
          ) : (
            <OpeningForm data={data} onClose={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const emptyCheck = (drawer: { name: string; cuit: string } | null, today: string): CheckDataValues => ({
  kind: 'PHYSICAL',
  number: '',
  bank: '',
  drawerName: drawer?.name ?? '',
  drawerCuit: drawer?.cuit ?? '',
  issueDate: today,
  paymentDate: today,
  amount: '',
});

function OpeningForm({ data, onClose }: { data: CheckOperationFormData; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<OpeningChecksValues>({
    resolver: zodResolver(openingChecksSchema),
    defaultValues: {
      portfolioId: data.portfolios.length === 1 ? data.portfolios[0]!.id : '',
      date: data.today,
      customerId: '',
      checks: [emptyCheck(null, data.today)],
    },
  });
  const checks = useFieldArray({ control: form.control, name: 'checks' });
  // El cliente elegido (nombre y CUIT) sale del resultado de la búsqueda, no de un catálogo cargado de antemano.
  const [customer, setCustomer] = useState<{ id: string; label: string; name: string; cuit: string } | null>(null);

  const save = useMutation({
    mutationFn: async (values: OpeningChecksValues) => unwrapAction(await createOpeningChecks(values)),
    onSuccess: (result) => {
      toast.success(`${result.count} ${result.count === 1 ? 'cheque cargado' : 'cheques cargados'} en la cartera`);
      invalidateTreasury(queryClient);
      router.refresh();
      onClose();
    },
    onError: (error) => {
      logger.error('Error en la carga inicial de cheques', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los cheques');
    },
  });

  /** El librador se precarga con el cliente (editable): solo en los cheques que todavía no lo tienen. */
  const changeCustomer = (option: { id: string; label: string; name: string; cuit: string } | null) => {
    setCustomer(option);
    form.setValue('customerId', option?.id ?? '', { shouldValidate: form.formState.isSubmitted });
    if (!option) return;
    form.getValues('checks').forEach((c, i) => {
      if (!c.drawerName) form.setValue(`checks.${i}.drawerName`, option.name);
      if (!c.drawerCuit) form.setValue(`checks.${i}.drawerCuit`, option.cuit);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="portfolioId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cartera</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí la cartera" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {data.portfolios.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de la carga</FormLabel>
                <FormControl>
                  <EnhancedDatePicker
                    date={toDate(field.value)}
                    setDate={(d) => field.onChange(fromDate(d))}
                    placeholder="DD/MM/AAAA"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cliente de origen</FormLabel>
                <FormControl>
                  <SearchCombobox
                    queryKey={['treasury-opening-customers']}
                    search={(query) => searchCollectionCustomers(query, true)}
                    value={field.value}
                    selectedLabel={customer?.label ?? null}
                    onSelect={changeCustomer}
                    placeholder="Elegí el cliente"
                    searchPlaceholder="Razón social o CUIT…"
                    noun="clientes"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />
        <div className="space-y-4">
          {checks.fields.map((field, i) => (
            <CheckRow
              key={field.id}
              form={form}
              index={i}
              onRemove={checks.fields.length > 1 ? () => checks.remove(i) : undefined}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              checks.append(emptyCheck(customer ? { name: customer.name, cuit: customer.cuit } : null, data.today));
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Agregar cheque
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Cargando…' : 'Cargar cheques'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function CheckRow({
  form,
  index,
  onRemove,
}: {
  form: UseFormReturn<OpeningChecksValues>;
  index: number;
  onRemove?: () => void;
}) {
  const text = (
    name: 'number' | 'bank' | 'drawerName' | 'drawerCuit' | 'amount',
    label: string,
    props: { inputMode?: 'decimal' | 'numeric'; className?: string } = {}
  ) => (
    <FormField
      control={form.control}
      name={`checks.${index}.${name}`}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs">{label}</FormLabel>
          <FormControl>
            <Input inputMode={props.inputMode} className={props.className} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
  const date = (name: 'issueDate' | 'paymentDate', label: string) => (
    <FormField
      control={form.control}
      name={`checks.${index}.${name}`}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs">{label}</FormLabel>
          <FormControl>
            <EnhancedDatePicker
              date={toDate(field.value)}
              setDate={(d) => field.onChange(fromDate(d))}
              placeholder="DD/MM/AAAA"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-medium">Cheque {index + 1}</legend>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Quitar el cheque ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <FormField
          control={form.control}
          name={`checks.${index}.kind`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Tipo</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(['PHYSICAL', 'ECHECK'] as const).map((k) => (
                    <SelectItem key={k} value={k}>
                      {CHECK_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {text('number', 'Número')}
        {text('bank', 'Banco')}
        {text('amount', 'Importe', { inputMode: 'decimal', className: 'text-right tabular-nums' })}
        {text('drawerName', 'Librador')}
        {text('drawerCuit', 'CUIT del librador', { inputMode: 'numeric' })}
        {date('issueDate', 'Emisión')}
        {date('paymentDate', 'Fecha de pago')}
      </div>
    </fieldset>
  );
}
