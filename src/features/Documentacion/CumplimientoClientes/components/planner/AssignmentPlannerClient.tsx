'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CalendarX2, Loader2, Repeat, UserPlus } from 'lucide-react';
import moment from 'moment';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { simulateCustomerAssignment, type SimulationOutput } from '../../actions/customer-compliance';
import type { PlannerOptions } from '../../lib/customer-compliance.server';
import type { FitResourceKind } from '../../lib/customer-fit';
import { conditionText, formatIsoDay, issueText } from '../../utils/issue-text';
import { FitStatusBadge } from '../FitStatusBadge';

const logger = new Logger('AssignmentPlannerClient');

const MAX_DAYS = 92;

const plannerFormSchema = z
  .object({
    customerId: z.string().min(1, 'Elegí un cliente'),
    from: z.string().min(1, 'Indicá la fecha de inicio'),
    to: z.string().min(1, 'Indicá la fecha de fin'),
    employeeIds: z.array(z.string()),
    equipmentIds: z.array(z.string()),
  })
  .refine((v) => !v.from || !v.to || v.to >= v.from, {
    path: ['to'],
    message: 'Tiene que ser igual o posterior al inicio',
  })
  .refine((v) => !v.from || !v.to || moment(v.to).diff(moment(v.from), 'days') <= MAX_DAYS, {
    path: ['to'],
    message: `El período no puede superar ${MAX_DAYS} días`,
  })
  .refine((v) => v.employeeIds.length + v.equipmentIds.length > 0, {
    path: ['employeeIds'],
    message: 'Elegí al menos una persona o un equipo',
  });

type PlannerFormValues = z.infer<typeof plannerFormSchema>;

const toDate = (value: string) => (value ? moment(value, 'YYYY-MM-DD').toDate() : undefined);
const toText = (date: Date | undefined) => (date ? moment(date).format('YYYY-MM-DD') : '');

interface Props {
  options: PlannerOptions;
  kinds: FitResourceKind[];
  today: string;
  initialCustomerId: string | null;
}

/** Simulador: elige cliente, período y recursos; el servidor evalúa y devuelve el resultado. No guarda nada. */
export function AssignmentPlannerClient({ options, kinds, today, initialCustomerId }: Props) {
  const form = useForm<PlannerFormValues>({
    resolver: zodResolver(plannerFormSchema),
    defaultValues: { customerId: initialCustomerId ?? '', from: today, to: today, employeeIds: [], equipmentIds: [] },
  });

  const simulation = useMutation({
    mutationFn: (values: PlannerFormValues) => simulateCustomerAssignment(values),
    onError: (error) => logger.error('Error al simular la asignación', { data: { error } }),
  });
  const result = simulation.data;

  const customerId = form.watch('customerId');
  const customerName = options.customers.find((c) => c.id === customerId)?.name ?? '';
  const showPeople = kinds.includes('Persona');
  const showEquipment = kinds.includes('Equipos');

  /** Suma a la selección todo lo que ya está afectado al cliente elegido. */
  const addAssigned = () => {
    if (!customerId) return;
    const merge = (field: 'employeeIds' | 'equipmentIds', list: PlannerOptions['employees']) => {
      const current = new Set(form.getValues(field));
      for (const o of list) if (o.customerIds.includes(customerId)) current.add(o.value);
      form.setValue(field, [...current], { shouldValidate: form.formState.isSubmitted });
    };
    merge('employeeIds', options.employees);
    merge('equipmentIds', options.equipment);
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => simulation.mutate(values))} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Elegí un cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {options.customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
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
              name="from"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Desde</FormLabel>
                  <FormControl>
                    <EnhancedDatePicker
                      date={toDate(field.value)}
                      setDate={(d) => field.onChange(toText(d))}
                      placeholder="DD/MM/AAAA"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hasta</FormLabel>
                  <FormControl>
                    <EnhancedDatePicker
                      date={toDate(field.value)}
                      setDate={(d) => field.onChange(toText(d))}
                      placeholder="DD/MM/AAAA"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {showPeople && (
              <FormField
                control={form.control}
                name="employeeIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personas</FormLabel>
                    <FormControl>
                      <MultiSelectCombobox
                        options={options.employees}
                        selectedValues={field.value}
                        onChange={field.onChange}
                        placeholder="Elegí personas"
                        searchPlaceholder="Buscar por legajo o nombre"
                        emptyMessage="No se encontraron personas"
                        aria-label="Personas"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {showEquipment && (
              <FormField
                control={form.control}
                name="equipmentIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipos</FormLabel>
                    <FormControl>
                      <MultiSelectCombobox
                        options={options.equipment}
                        selectedValues={field.value}
                        onChange={field.onChange}
                        placeholder="Elegí equipos"
                        searchPlaceholder="Buscar por interno o dominio"
                        emptyMessage="No se encontraron equipos"
                        aria-label="Equipos"
                      />
                    </FormControl>
                    {!showPeople && <FormMessage />}
                  </FormItem>
                )}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={simulation.isPending}>
              {simulation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Simular
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={addAssigned}
              disabled={!customerId}
              className="h-auto max-w-full py-2 text-left whitespace-normal"
            >
              <UserPlus aria-hidden="true" />
              Sumar los afectados a {customerName || 'el cliente'}
            </Button>
            <FormDescription className="basis-full">
              Es una simulación: no asigna ni cambia nada. Los documentos mensuales se evalúan con el período del día de
              inicio.
            </FormDescription>
          </div>
        </form>
      </Form>

      {(simulation.isError || result?.ok === false) && (
        <StateBlock
          variant="error"
          title="No se pudo simular la asignación"
          description={result?.ok === false ? result.error : 'Intentá de nuevo en unos segundos.'}
        />
      )}
      {result?.ok && <PlannerResults output={result.output} />}
    </div>
  );
}

/** Muestra el resultado con el cliente que se SIMULÓ (no el que quedó elegido en el formulario después). */
function PlannerResults({ output }: { output: SimulationOutput }) {
  const { results, typeNames, window } = output;
  const customerName = output.customerName ?? 'el cliente';
  const counts = {
    ok: results.filter((r) => r.fit.s === 'ok' && r.unavailability.length === 0).length,
    risk: results.filter((r) => r.fit.s === 'expiring' || (r.fit.s === 'ok' && r.unavailability.length > 0)).length,
    blocked: results.filter((r) => r.fit.s === 'blocked').length,
  };

  return (
    <section aria-labelledby="planner-results" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="planner-results" className="text-base font-semibold">
          Resultado para {customerName} del {formatIsoDay(window.from)} al {formatIsoDay(window.to)}
        </h3>
        <p role="status" className="text-muted-foreground text-sm tabular-nums">
          {counts.ok} listos · {counts.risk} con riesgo · {counts.blocked} no cumplen
        </p>
      </div>

      {results.length === 0 ? (
        <StateBlock
          variant="empty"
          title="No hay recursos para evaluar"
          description="Los elegidos ya no están activos."
        />
      ) : (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id} className="bg-card space-y-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {r.kind === 'Persona' ? 'Persona' : 'Equipo'}
                    {r.role ? ` · ${r.role}` : ''}
                    {r.assigned ? '' : ` · No está afectado a ${customerName}`}
                  </p>
                </div>
                <FitStatusBadge status={r.fit.s} hasWindow={window.to > window.from} />
              </div>

              {(r.fit.o || r.fit.b.length > 0 || r.fit.e.length > 0 || r.unavailability.length > 0) && (
                <ul className="space-y-0.5 text-sm">
                  {r.fit.o && <li className="text-danger-subtle-foreground">{conditionText(r.fit.o)}</li>}
                  {r.fit.b.map((i) => (
                    <li key={`b-${i.t}`} className="text-danger-subtle-foreground">
                      {issueText(i, typeNames, 'blocking')}
                    </li>
                  ))}
                  {r.fit.e.map((i) => (
                    <li key={`e-${i.t}`} className="text-warn-subtle-foreground">
                      {issueText(i, typeNames, 'expiring')}
                    </li>
                  ))}
                  {r.unavailability.map((text) => (
                    <li key={text} className="text-warn-subtle-foreground flex items-center gap-1.5">
                      <CalendarX2 className="size-3.5 shrink-0" aria-hidden="true" />
                      {text}
                    </li>
                  ))}
                </ul>
              )}

              {(r.fit.s !== 'ok' || r.unavailability.length > 0) && (
                <div className="border-t pt-2 text-sm">
                  <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                    <Repeat className="size-3.5" aria-hidden="true" />
                    Reemplazos con la documentación al día todo el período (
                    {r.kind === 'Persona' ? 'mismo puesto' : 'mismo tipo, operativos'})
                  </p>
                  {r.replacements.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No hay otro {r.kind === 'Persona' ? 'del mismo puesto' : 'del mismo tipo'} que cumpla.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {r.replacements.map((c) => (
                        <li key={c.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1">
                          <span>{c.label}</span>
                          {c.offDays > 0 && (
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {c.offDays} {c.offDays === 1 ? 'día' : 'días'} no laborales
                            </span>
                          )}
                          <Badge variant={c.assigned ? 'success' : 'secondary'}>
                            {c.assigned ? 'Afectado' : 'Sin afectar al cliente'}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
