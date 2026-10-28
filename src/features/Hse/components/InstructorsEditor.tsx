'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  addHseRecordInstructor,
  addHseTrainingInstructor,
  fetchHseRecordFormOptions,
  removeHseRecordInstructor,
  removeHseTrainingInstructor,
} from '../actions/records.server';
import { HSE_QUERY_KEYS } from '../lib/constants';
import { HSE_INSTRUCTOR_KIND_LABELS } from '../lib/pdf-content';
import { hseInstructorSchema, type HseInstructorValues } from '../schemas/records';
import { EmployeePicker } from './EmployeePicker';

const logger = new Logger('Hse/InstructorsEditor');

/** Formulario plano (un solo objeto) que se valida con el schema discriminado al enviar. */
const formSchema = z
  .object({
    kind: z.enum(['internal', 'external']),
    employeeId: z.string(),
    fullName: z.string(),
    roleTitle: z.string().trim().max(120, 'Máximo 120 caracteres'),
    license: z.string().trim().max(60, 'Máximo 60 caracteres'),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'internal' && !v.employeeId)
      ctx.addIssue({ code: 'custom', path: ['employeeId'], message: 'Elegí el empleado' });
    if (v.kind === 'external' && v.fullName.trim().length < 3)
      ctx.addIssue({ code: 'custom', path: ['fullName'], message: 'Escribí el nombre' });
  });
type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = { kind: 'external', employeeId: '', fullName: '', roleTitle: '', license: '' };

export type InstructorItem = {
  id: string;
  kind: 'internal' | 'external';
  fullName: string;
  license: string | null;
  roleTitle: string | null;
};

/**
 * Capacitadores de una capacitación (los habituales) o de un acta en borrador. Interno: un legajo de la empresa (el
 * nombre sale del legajo); externo: nombre y, si tiene, matrícula. Alta y baja de a uno (nunca se reemplaza la lista).
 */
export function InstructorsEditor({
  target,
  instructors,
  editable,
  emptyText,
}: {
  target: { kind: 'training' | 'record'; id: string };
  instructors: InstructorItem[];
  editable: boolean;
  emptyText: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const options = useQuery({
    queryKey: [...HSE_QUERY_KEYS.all, 'record-form-options'],
    queryFn: () => fetchHseRecordFormOptions(),
    enabled: adding,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const kind = form.watch('kind');

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
    toast.success(message);
    router.refresh();
  };

  const add = useMutation({
    mutationFn: async (values: HseInstructorValues) =>
      unwrapAction(
        target.kind === 'training'
          ? await addHseTrainingInstructor(target.id, values)
          : await addHseRecordInstructor(target.id, values)
      ),
    onSuccess: () => {
      form.reset(EMPTY);
      setAdding(false);
      done('Capacitador agregado');
    },
    onError: (error) => {
      logger.error('Error al agregar el capacitador', { data: { error } });
      form.setError('root', { message: error instanceof Error ? error.message : 'No se pudo agregar' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrapAction(
        target.kind === 'training' ? await removeHseTrainingInstructor(id) : await removeHseRecordInstructor(id)
      ),
    onSuccess: () => done('Capacitador quitado'),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo quitar el capacitador'),
  });

  const onSubmit = (values: FormValues) => {
    const parsed = hseInstructorSchema.safeParse(
      values.kind === 'internal'
        ? { kind: 'internal', employeeId: values.employeeId, roleTitle: values.roleTitle, license: values.license }
        : { kind: 'external', fullName: values.fullName, roleTitle: values.roleTitle, license: values.license }
    );
    if (!parsed.success) {
      form.setError('root', { message: parsed.error.issues[0]?.message ?? 'Revisá los datos' });
      return;
    }
    add.mutate(parsed.data);
  };

  return (
    <div className="space-y-3">
      {instructors.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {instructors.map((i) => (
            <li key={i.id} className="flex items-center gap-3 p-3">
              <UserRound aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{i.fullName}</p>
                <p className="text-muted-foreground text-sm break-words">
                  {[HSE_INSTRUCTOR_KIND_LABELS[i.kind], i.roleTitle, i.license ? `Mat. ${i.license}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {editable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 sm:size-9"
                  aria-label={`Quitar a ${i.fullName}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(i.id)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && !adding && (
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" className="mr-1 size-4" /> Agregar capacitador
        </Button>
      )}

      {editable && adding && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3 rounded-lg border p-3">
            {form.formState.errors.root?.message && (
              <p role="alert" className="text-destructive text-sm">
                {form.formState.errors.root.message}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="min-h-11 sm:min-h-9">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="external">Externo (consultora, ART, bomberos…)</SelectItem>
                        <SelectItem value="internal">Interno (empleado de la empresa)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {kind === 'internal' ? (
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Empleado</FormLabel>
                      {options.isLoading ? (
                        <Skeleton className="h-11 w-full sm:h-9" aria-label="Cargando empleados" />
                      ) : options.isError || !options.data ? (
                        <StateBlock
                          variant="error"
                          title="No se pudieron cargar los empleados"
                          action={
                            <Button type="button" variant="outline" onClick={() => void options.refetch()}>
                              Reintentar
                            </Button>
                          }
                        />
                      ) : (
                        <EmployeePicker
                          options={options.data.employees}
                          value={field.value}
                          onChange={field.onChange}
                          label="Elegir el empleado capacitador"
                          invalid={Boolean(fieldState.error)}
                        />
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apellido y nombre</FormLabel>
                      <FormControl>
                        <Input {...field} className="min-h-11 sm:min-h-9" autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="roleTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo o título (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} className="min-h-11 sm:min-h-9" placeholder="Lic. en Higiene y Seguridad" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="license"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matrícula (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} className="min-h-11 sm:min-h-9" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-11 sm:min-h-9" disabled={add.isPending} aria-busy={add.isPending}>
                {add.isPending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                {add.isPending ? 'Agregando…' : 'Agregar'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 sm:min-h-9"
                disabled={add.isPending}
                onClick={() => {
                  form.reset(EMPTY);
                  setAdding(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}
