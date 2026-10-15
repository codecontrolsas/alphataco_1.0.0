'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { bulkUpdateVehicleAxleSizes, getVehicleAxleSizeOverrides } from './actions/positions.server';

const logger = new Logger('VehicleAxleSizesForm');

// ─── Schema ────────────────────────────────────────────────────────────────

const formSchema = z.object({
  axles: z.array(
    z.object({
      axle_number: z.number(),
      tire_size: z.string(),
    })
  ),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Props ─────────────────────────────────────────────────────────────────

interface VehicleAxleSizesFormProps {
  vehicleId: string;
  axles: Array<{
    axle_number: number;
    tire_size: string | null;
    is_drive_axle: boolean;
    is_spare: boolean;
  }>;
  hasGeometricOverride: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildInitialValues(
  axles: VehicleAxleSizesFormProps['axles'],
  overrides: Array<{ axle_number: number; tire_size: string }>
): FormValues {
  const overrideMap = new Map(overrides.map((o) => [o.axle_number, o.tire_size]));
  return {
    axles: axles.map((a) => ({
      axle_number: a.axle_number,
      tire_size: overrideMap.get(a.axle_number) ?? '',
    })),
  };
}

/** Referencia estable mientras carga: un `[]` nuevo por render invalidaría el `useMemo`. */
const NO_OVERRIDES: Array<{ axle_number: number; tire_size: string }> = [];

// ─── Component ─────────────────────────────────────────────────────────────

export function VehicleAxleSizesForm({ vehicleId, axles, hasGeometricOverride }: VehicleAxleSizesFormProps) {
  const queryClient = useQueryClient();

  const { data: overrides = NO_OVERRIDES, isLoading } = useQuery({
    queryKey: ['vehicle-axle-size-overrides', vehicleId],
    queryFn: () => getVehicleAxleSizeOverrides(vehicleId),
    staleTime: 30 * 1000,
  });

  const initialValues = useMemo(() => buildInitialValues(axles, overrides), [axles, overrides]);

  // `values` resincroniza el formulario cuando cambian los datos del servidor (por ejemplo, tras
  // invalidar la query) sin un efecto aparte.
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
    values: initialValues,
  });

  const watchedAxles = form.watch('axles');

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const updates = values.axles.map((entry) => ({
        axle_number: entry.axle_number,
        tire_size: entry.tire_size.trim() ? entry.tire_size.trim() : null,
      }));
      return bulkUpdateVehicleAxleSizes(vehicleId, updates);
    },
    onSuccess: (result) => {
      // La action devuelve el error (no lo lanza) para que el mensaje llegue al toast en producción.
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Medidas actualizadas correctamente');
      queryClient.invalidateQueries({ queryKey: ['vehicle-axle-size-overrides', vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-tire-positions-details', vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-template-info', vehicleId] });
    },
    onError: (error) => {
      logger.error('Error updating vehicle axle sizes', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al actualizar las medidas');
    },
  });

  function onSubmit(values: FormValues) {
    mutation.mutate(values);
  }

  function getEffectiveSize(axleNumber: number, templateSize: string | null): string | null {
    const override = watchedAxles?.find((a) => a.axle_number === axleNumber)?.tire_size?.trim();
    if (override) return override;
    return templateSize ?? null;
  }

  const missingCount = axles.filter((a) => !getEffectiveSize(a.axle_number, a.tire_size)).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Medidas de cubierta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted/30 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (axles.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Medidas de cubierta</CardTitle>
            <CardDescription>
              Configurá la medida específica para cada eje. Si dejás un eje vacío, hereda de la plantilla.
            </CardDescription>
          </div>
          {hasGeometricOverride && (
            <Badge variant="outline" className="shrink-0">
              Plantilla personalizada del equipo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {missingCount > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-500">
              {missingCount === 1 ? 'Falta 1 medida (opcional).' : `Faltan ${missingCount} medidas (opcional).`}{' '}
              Cargarlas acá las deja precargadas; si no, se define la medida al cargar la cubierta dentro de la orden.
            </p>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-3">
              {axles.map((axle, index) => {
                const effectiveSize = getEffectiveSize(axle.axle_number, axle.tire_size);
                const isPending = !effectiveSize;
                const watchedValue = watchedAxles?.[index]?.tire_size ?? '';
                const hasOverride = watchedValue.trim() !== '';

                return (
                  <div
                    key={axle.axle_number}
                    className="grid grid-cols-[3rem_1fr] gap-3 items-start py-2 border-b last:border-b-0"
                  >
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <span className="font-mono text-sm font-semibold">{axle.axle_number}</span>
                      {axle.is_drive_axle && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          Tractor
                        </Badge>
                      )}
                      {axle.is_spare && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          Auxilio
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FormLabel className="text-xs font-normal">Plantilla:</FormLabel>
                        <span className="font-mono">{axle.tire_size ?? '—'}</span>
                      </div>
                      <FormField
                        control={form.control}
                        name={`axles.${index}.tire_size`}
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  placeholder={
                                    axle.tire_size ? `Override (heredando: ${axle.tire_size})` : 'Ej: 295/80R22.5'
                                  }
                                  className="h-8 text-sm"
                                  {...field}
                                />
                              </FormControl>
                              {hasOverride && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  onClick={() => field.onChange('')}
                                  title="Limpiar override (volver a heredar)"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {isPending && (
                                <Badge variant="destructive" className="text-[10px] shrink-0">
                                  Sin configurar
                                </Badge>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={!form.formState.isDirty || form.formState.isSubmitting || mutation.isPending}
              >
                {form.formState.isSubmitting || mutation.isPending ? 'Guardando...' : 'Guardar medidas'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
