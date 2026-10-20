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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createOrgChartCargo,
  deleteOrgChartCargo,
  getOrgChartPositionOptions,
  getOrgChartTitularOptions,
  updateOrgChartCargo,
  type OrgChartCargo,
  type OrgChartData,
} from '../actions.server';
import { ORG_CHART_ISSUE_LABELS, descendantsOf } from '../lib/org-chart-rules';
import { cargoLabel, employeeLabel } from '../lib/org-chart-tree';
import { orgChartCargoSchema, type OrgChartCargoInput } from '../schemas/org-chart';
import { OptionCombobox } from './OptionCombobox';

export const ORG_CHART_QUERY_KEY = ['org-chart'] as const;

interface CargoFormProps {
  data: OrgChartData;
  /** Cargo a editar; `null` en un alta. */
  cargo: OrgChartCargo | null;
  /** Sector desde el que se pidió el alta. */
  defaultSectorId: string | null;
  canDelete: boolean;
}

export function CargoForm({ data, cargo, defaultSectorId, canDelete }: CargoFormProps) {
  const queryClient = useQueryClient();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEditing = cargo !== null;

  const form = useForm<OrgChartCargoInput>({
    resolver: zodResolver(orgChartCargoSchema),
    defaultValues: {
      sector_id: cargo?.sector_id ?? defaultSectorId ?? '',
      position_id: cargo?.position_id ?? '',
      reports_to_id: cargo?.reports_to_id ?? null,
      employee_id: cargo?.employee?.id ?? null,
    },
  });

  const sectorId = form.watch('sector_id');
  const positionId = form.watch('position_id');

  const sectorName = useMemo(() => new Map(data.sectors.map((sector) => [sector.id, sector.name])), [data.sectors]);

  // Solo sectores activos: no se cuelgan cargos de un sector dado de baja. El sector actual del cargo
  // se sigue mostrando aunque esté inactivo, para poder corregir el resto sin moverlo.
  const sectorOptions = useMemo(
    () =>
      data.sectors
        .filter((sector) => sector.is_active !== false || sector.id === cargo?.sector_id)
        .map((sector) => ({
          value: sector.id,
          label: sector.is_active === false ? `${sector.name} (inactivo)` : sector.name,
        })),
    [data.sectors, cargo?.sector_id]
  );

  // "Reporta a": cualquier cargo menos este y los que le reportan (directa o indirectamente).
  const reportsToOptions = useMemo(() => {
    const excluded = cargo
      ? descendantsOf(new Map(data.cargos.map((item) => [item.id, item.reports_to_id])), cargo.id)
      : new Set<string>();
    return data.cargos
      .filter((item) => !excluded.has(item.id))
      .map((item) => ({ value: item.id, label: cargoLabel(item, sectorName.get(item.sector_id) ?? 'Sector') }));
  }, [cargo, data.cargos, sectorName]);

  const positionsQuery = useQuery({
    queryKey: ['org-chart-positions', sectorId],
    queryFn: () => getOrgChartPositionOptions(sectorId),
    enabled: !!sectorId,
    staleTime: 5 * 60 * 1000,
  });

  const titularsQuery = useQuery({
    queryKey: ['org-chart-titulars', sectorId, positionId, cargo?.id ?? null],
    queryFn: () => getOrgChartTitularOptions(sectorId, positionId, cargo?.id),
    enabled: !!sectorId && !!positionId,
    staleTime: 60 * 1000,
  });

  const positionOptions = useMemo(() => {
    const options = (positionsQuery.data ?? []).map((position) => ({ value: position.id, label: position.name }));
    // El puesto actual puede haber salido del sector o estar inactivo: se sigue mostrando para no perderlo de vista.
    if (cargo && cargo.position_id === positionId && !options.some((option) => option.value === cargo.position_id)) {
      options.unshift({ value: cargo.position_id, label: `${cargo.position.name} (ya no aplica)` });
    }
    return options;
  }, [positionsQuery.data, cargo, positionId]);

  const titularOptions = useMemo(() => {
    const options = (titularsQuery.data ?? []).map((employee) => ({ value: employee.id, label: employeeLabel(employee) }));
    if (cargo?.employee && !options.some((option) => option.value === cargo.employee?.id)) {
      options.unshift({ value: cargo.employee.id, label: `${employeeLabel(cargo.employee)} (ya no coincide)` });
    }
    return options;
  }, [titularsQuery.data, cargo]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ORG_CHART_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['org-chart-titulars'] });
  };

  async function onSubmit(values: OrgChartCargoInput) {
    setBusy(true);
    try {
      const result = cargo ? await updateOrgChartCargo({ ...values, id: cargo.id }) : await createOrgChartCargo(values);
      if (!result.ok) {
        setBusy(false);
        toast.error(result.error);
        return;
      }
    } catch {
      // Falla de red o del servidor: el panel no debe quedar bloqueado.
      setBusy(false);
      toast.error('No se pudo guardar el cargo. Intentá nuevamente.');
      return;
    }
    invalidate();
    toast.success(cargo ? 'Cargo actualizado' : 'Cargo creado');
    closeSheet();
  }

  async function onDelete() {
    if (!cargo) return;
    setBusy(true);
    let result;
    try {
      result = await deleteOrgChartCargo(cargo.id);
    } catch {
      setBusy(false);
      toast.error('No se pudo eliminar el cargo. Intentá nuevamente.');
      return;
    }
    if (!result.ok) {
      setBusy(false);
      toast.error(result.error);
      return;
    }
    invalidate();
    const reports = data.cargos.filter((item) => item.reports_to_id === cargo.id).length;
    toast.success(
      reports > 0
        ? `Cargo eliminado. ${reports === 1 ? 'El cargo que le reportaba pasa' : `Los ${reports} cargos que le reportaban pasan`} a su superior.`
        : 'Cargo eliminado'
    );
    closeSheet();
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {cargo && cargo.issues.length > 0 ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertTitle>Este cargo quedó desfasado</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {cargo.issues.map((issue) => (
                  <li key={issue}>{ORG_CHART_ISSUE_LABELS[issue]}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="sector_id"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Sector</FormLabel>
              <FormControl>
                <OptionCombobox
                  value={field.value || null}
                  onChange={(next) => {
                    field.onChange(next ?? '');
                    // Cambiar de sector invalida el puesto y el titular elegidos.
                    form.setValue('position_id', '');
                    form.setValue('employee_id', null);
                  }}
                  options={sectorOptions}
                  placeholder="Elegí el sector"
                  searchPlaceholder="Buscar sector…"
                  emptyText="No hay sectores activos."
                  aria-invalid={!!fieldState.error}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="position_id"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Puesto</FormLabel>
              <FormControl>
                <OptionCombobox
                  value={field.value || null}
                  onChange={(next) => {
                    field.onChange(next ?? '');
                    form.setValue('employee_id', null);
                  }}
                  options={positionOptions}
                  placeholder={sectorId ? 'Elegí el puesto' : 'Elegí primero el sector'}
                  searchPlaceholder="Buscar puesto…"
                  emptyText="Este sector no tiene puestos activos. Se asignan en Configuración › Personal › Puestos."
                  loading={positionsQuery.isLoading && !!sectorId}
                  disabled={!sectorId}
                  aria-invalid={!!fieldState.error}
                />
              </FormControl>
              <FormDescription>Solo los puestos que pertenecen al sector.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reports_to_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reporta a</FormLabel>
              <FormControl>
                <OptionCombobox
                  value={field.value}
                  onChange={field.onChange}
                  options={reportsToOptions}
                  noneLabel="Nadie (cargo superior)"
                  placeholder="Nadie (cargo superior)"
                  searchPlaceholder="Buscar por sector, puesto o legajo…"
                  emptyText="No hay otros cargos."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="employee_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titular</FormLabel>
              <FormControl>
                <OptionCombobox
                  value={field.value}
                  onChange={field.onChange}
                  options={titularOptions}
                  noneLabel="Vacante"
                  placeholder="Vacante"
                  searchPlaceholder="Buscar por legajo o nombre…"
                  emptyText="Ningún legajo activo tiene este sector y este puesto en su ficha."
                  loading={titularsQuery.isLoading && !!positionId}
                  disabled={!positionId}
                />
              </FormControl>
              <FormDescription>
                Legajos activos con este sector y este puesto en su ficha, que no sean titulares de otro cargo.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button type="submit" variant="brand" disabled={isSubmitting} className="min-h-10">
            {isSubmitting ? 'Guardando…' : isEditing ? 'Guardar' : 'Crear cargo'}
          </Button>
          <Button type="button" variant="outline" onClick={closeSheet} className="min-h-10">
            Cancelar
          </Button>
          {isEditing && canDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive ml-auto min-h-10"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Eliminar
            </Button>
          ) : null}
        </div>
      </form>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este cargo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quita del organigrama. Los cargos que le reportan pasan a reportarle a su superior. El legajo del
              titular no se modifica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}
