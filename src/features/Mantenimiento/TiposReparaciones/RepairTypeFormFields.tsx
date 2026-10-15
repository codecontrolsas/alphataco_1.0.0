'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createTypeOfRepair,
  fetchAllWorkshopSectorsForConfig,
  fetchSectorsForRepairType,
  updateRepairTypeSectors,
  updateTypeOfRepair,
} from './actions/actions';
import type { RepairTypeRow } from './repair-type-columns';
import { repairTypeFormSchema, type RepairTypeFormValues } from './schemas/repair-types';

const EMPTY_VALUES: Partial<RepairTypeFormValues> = {
  name: '',
  description: '',
  autorizable: false,
};

/** Altas y bajas de sectores respecto de lo que el servidor devolvió al abrir el tipo. */
function diffIds(baseline: string[], current: string[]) {
  return {
    add: current.filter((id) => !baseline.includes(id)),
    remove: baseline.filter((id) => !current.includes(id)),
  };
}

interface RepairTypeFormFieldsProps {
  /** Tipo a editar; `null` para un alta. */
  repair: RepairTypeRow | null;
}

function getFormValues(repair: RepairTypeRow | null): Partial<RepairTypeFormValues> {
  if (!repair) return EMPTY_VALUES;
  return {
    name: repair.name,
    description: repair.description,
    criticity: (repair.criticity as RepairTypeFormValues['criticity'] | null) ?? undefined,
    type_of_maintenance: repair.type_of_maintenance ?? undefined,
    autorizable: repair.autorizable ?? false,
  };
}

/** Formulario del Sheet de tipos de reparación (alta y edición). El Sheet lo monta con `key` por registro. */
export function RepairTypeFormFields({ repair: selectedRepair }: RepairTypeFormFieldsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const canCreate = hasPermission('configuracion', 'type_of_repair', 'create');
  const canUpdate = hasPermission('configuracion', 'type_of_repair', 'update');

  const form = useForm<RepairTypeFormValues>({
    resolver: zodResolver(repairTypeFormSchema),
    defaultValues: getFormValues(selectedRepair),
  });

  // `null` = el usuario todavía no tocó los sectores: se muestra el baseline del servidor.
  const [sectorSelection, setSectorSelection] = useState<string[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: workshopSectors = [] } = useQuery({
    queryKey: ['workshop-sectors-config'],
    queryFn: () => fetchAllWorkshopSectorsForConfig(),
    staleTime: 5 * 60 * 1000,
  });

  // Baseline de sectores: se lee de la base al abrir el tipo (nunca del estado de la pantalla).
  // Sin baseline cargado no se puede guardar, para no calcular las bajas contra un dato ausente.
  const baselineQuery = useQuery({
    queryKey: ['repair-type-sectors', selectedRepair?.id],
    queryFn: () => fetchSectorsForRepairType(selectedRepair!.id),
    enabled: !!selectedRepair,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const baseline = selectedRepair ? baselineQuery.data ?? null : [];
  const currentSectors = sectorSelection ?? baseline ?? [];
  const sectorDelta = baseline ? diffIds(baseline, currentSectors) : { add: [], remove: [] };
  const baselineReady = baseline !== null;

  const afterMutation = useCallback(() => {
    invalidateAllMaintenanceQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ['repair-type-sectors'] });
    queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    router.refresh();
  }, [queryClient, router]);

  const toggleSector = (sectorId: string, checked: boolean) => {
    setSectorSelection(checked ? [...currentSectors, sectorId] : currentSectors.filter((id) => id !== sectorId));
  };

  /** Aplica el delta de sectores; `null` si falló (resultado `ok: false` o excepción de red). */
  const applySectors = async (repairTypeId: string, delta: { add: string[]; remove: string[] }) => {
    try {
      const result = await updateRepairTypeSectors(repairTypeId, delta);
      return result.ok ? result : null;
    } catch {
      return null;
    }
  };

  const onSubmit = async (values: RepairTypeFormValues) => {
    if (isSaving) return;
    setIsSaving(true);
    setBusy(true);
    try {
      if (selectedRepair) {
        if (!baselineReady) return;
        const updated = await updateTypeOfRepair(values, selectedRepair.id);
        if (!updated.ok) throw new Error(updated.error);
        let sectorsSummary = '';
        if (sectorDelta.add.length > 0 || sectorDelta.remove.length > 0) {
          const sectors = await applySectors(selectedRepair.id, sectorDelta);
          if (!sectors) {
            // El tipo ya se guardó: se refresca la tabla y se cierra el Sheet para no dejar datos viejos en pantalla.
            toast.warning('Se guardó el tipo, pero no se pudieron actualizar los sectores; editalo para reintentar');
            closeSheet();
            afterMutation();
            return;
          }
          sectorsSummary = ` (sectores: ${sectors.added} agregados, ${sectors.removed} quitados)`;
        }
        toast.success(`Tipo de reparación actualizado con éxito${sectorsSummary}`);
      } else {
        const created = await createTypeOfRepair(values);
        if (!created.ok) throw new Error(created.error);
        if (currentSectors.length > 0) {
          const sectors = await applySectors(created.data[0].id, { add: currentSectors, remove: [] });
          if (!sectors) {
            // El tipo ya existe: reintentar el alta daría "ya existe", así que se cierra el alta y se avisa.
            toast.warning('Se creó el tipo, pero no se pudieron asignar los sectores; editalo para reintentar');
            closeSheet();
            afterMutation();
            return;
          }
        }
        toast.success('Tipo de reparación creado con éxito');
      }
      closeSheet();
      afterMutation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Hubo un error al guardar el tipo de reparación');
    } finally {
      setBusy(false);
      setIsSaving(false);
    }
  };

  const sectorNames = new Map(workshopSectors.map((sector) => [sector.id, sector.name]));
  const removedNames = sectorDelta.remove.map((id) => sectorNames.get(id) ?? 'Sector').join(', ');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del tipo de reparación</FormLabel>
              <FormControl>
                <Input placeholder="Ingresar nombre" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción</FormLabel>
              <FormControl>
                <Textarea placeholder="Ingresa una descripción" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="criticity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nivel de criticidad</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Elije el nivel de criticidad" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Baja">Baja</SelectItem>
                  <SelectItem value="Media">Media</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type_of_maintenance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de mantenimiento</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegir tipo de mantenimiento" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Preventivo">Preventivo</SelectItem>
                  <SelectItem value="Correctivo">Correctivo</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="autorizable"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Autorizable</FormLabel>
                <FormDescription>
                  Requiere aprobacion del Jefe de Taller al ser agregada por un operario
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        {/* Sectores que realizan esta reparación */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Sectores de taller</Label>
            <p className="text-xs text-muted-foreground">Selecciona los sectores que pueden realizar esta reparación</p>
          </div>
          {selectedRepair && baselineQuery.isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p className="text-destructive">No se pudieron cargar los sectores actuales del tipo.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => baselineQuery.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : selectedRepair && !baselineReady ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : workshopSectors.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
              {workshopSectors.map((sector) => (
                <div key={sector.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`sector-${sector.id}`}
                    checked={currentSectors.includes(sector.id)}
                    onCheckedChange={(checked) => toggleSector(sector.id, checked === true)}
                  />
                  <label htmlFor={`sector-${sector.id}`} className="text-sm leading-none">
                    {sector.workshops?.name ? `${sector.name} - ${sector.workshops.name}` : sector.name}
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay sectores disponibles</p>
          )}
          {selectedRepair && baselineReady && (sectorDelta.add.length > 0 || sectorDelta.remove.length > 0) && (
            <div className="space-y-0.5 text-xs" aria-live="polite">
              {sectorDelta.add.length > 0 && (
                <p className="text-muted-foreground">Se agregan {sectorDelta.add.length}</p>
              )}
              {sectorDelta.remove.length > 0 && (
                <p className="font-medium text-destructive">
                  Se quitan {sectorDelta.remove.length}: {removedNames}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="brand"
            disabled={isSaving || (selectedRepair ? !baselineReady || !canUpdate : !canCreate)}
          >
            {isSaving ? 'Guardando...' : selectedRepair ? 'Actualizar tipo de reparación' : 'Crear tipo de reparación'}
          </Button>
          <Button type="button" variant="outline" onClick={closeSheet} disabled={isSaving}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
