'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/use-toast';
import { Logger } from '@/lib/logger';
import { useCatalogSheetBusy } from '@/shared/components/common/CatalogFormSheet';
import DependencyValidationModal, { type DependencyConfig } from '@/shared/components/modal/DependencyValidationModal';
import { fetchDependenciesForValue, fetchReplacementOptions } from '@/shared/components/modal/dependency-utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { computeIdDelta } from '../EquipmentTypes/lib/id-delta';
import type { EquipmentOwnerListItem } from './lib/owners-types';
import {
  createEquipmentOwnerPrisma,
  reassignAndDeactivateEquipmentOwner,
  updateEquipmentOwnerPrisma,
} from './owners.server';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('EquipmentOwnerForm');

// ============================================================================
// SCHEMA
// ============================================================================

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'El nombre es requerido'),
  is_active: z.boolean().default(true),
  cuit: z.string({ required_error: 'El CUIT es requerido' }).min(6, 'Debe tener mínimo 6 caracteres'),
  contract_types: z
    .array(z.enum(['Leasing', 'Alquiler', 'Prendado']))
    .min(1, 'Debe seleccionar al menos un tipo de contrato'),
});

type FormData = z.infer<typeof formSchema>;
type ContractType = FormData['contract_types'][number];

// ============================================================================
// PROPS
// ============================================================================

interface EquipmentOwnerFormProps {
  initialData?: EquipmentOwnerListItem | null;
  onReset: () => void;
  isEditing?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function EquipmentOwnerForm({ initialData = null, onReset, isEditing = false }: EquipmentOwnerFormProps) {
  const [showDependencyModal, setShowDependencyModal] = useState(false);
  const queryClient = useQueryClient();
  const setBusy = useCatalogSheetBusy();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: initialData?.id,
      name: initialData?.name ?? '',
      is_active: initialData?.is_active ?? true,
      cuit: initialData?.cuit ?? '',
      contract_types: (initialData?.equipment_owner_contract_types?.map((ct) => ct.contract_type) ?? []) as (
        | 'Leasing'
        | 'Alquiler'
        | 'Prendado'
      )[],
    },
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  // Base leída al abrir el formulario: contra ella se calcula el delta {add, remove} que se envía.
  const initialContractTypes = useMemo(
    () => (initialData?.equipment_owner_contract_types ?? []).map((ct) => ct.contract_type as ContractType),
    [initialData]
  );

  /** Delta de tipos de contrato contra la base cargada al abrir. */
  const contractTypesDelta = (selected: ContractType[]) => {
    const delta = computeIdDelta(initialContractTypes, selected);
    return { add: delta.add as ContractType[], remove: delta.remove as ContractType[] };
  };

  // ── Dependency modal config ────────────────────────────────────────────────
  const dependencyConfigs = useMemo<DependencyConfig[]>(
    () => [
      {
        sourceTable: 'equipment_owners',
        sourceColumn: 'name',
        targetTable: 'vehicles',
        targetColumn: 'owner_id',
        displayColumns: ['domain', 'chassis'],
        displayLabels: ['Dominio', 'Chassis'],
        relationName: 'Equipos',
      },
    ],
    []
  );

  const fetchDependencies = async (config: DependencyConfig, recordKeyValue: string) => {
    const select = config.displayColumns.join(',') as '*';
    return fetchDependenciesForValue<'vehicles', 'owner_id'>({
      targetTable: 'vehicles',
      targetColumn: 'owner_id',
      value: recordKeyValue,
      select,
      limit: 10,
    });
  };

  // ── Submit handler ─────────────────────────────────────────────────────────
  const onSubmit = async (data: FormData) => {
    setBusy(true);
    try {
      if (isEditing && data.id) {
        const prevActive = !!initialData?.is_active;
        const nextActive = data.is_active;

        // Si se intenta desactivar con equipos dependientes, mostrar modal
        if (prevActive && !nextActive) {
          const deps = await fetchDependencies(dependencyConfigs[0], initialData!.id);
          if (deps.data.length > 0) {
            setBusy(false);
            setShowDependencyModal(true);
            return;
          }
        }

        await updateEquipmentOwnerPrisma({
          id: data.id,
          name: data.name,
          is_active: data.is_active,
          cuit: data.cuit,
          contract_types: contractTypesDelta(data.contract_types),
        });
      } else {
        await createEquipmentOwnerPrisma({
          name: data.name,
          is_active: data.is_active,
          cuit: data.cuit,
          contract_types: data.contract_types,
        });
      }

      toast({
        title: 'Titular guardado correctamente',
        description: 'Los cambios se han guardado exitosamente.',
        variant: 'default',
      });

      // Invalidar queries del DataTable para reflejar cambios
      await queryClient.invalidateQueries({ queryKey: ['equipment-owners-list'] });
      onReset();
    } catch (error: unknown) {
      logger.error('Error al guardar el titular', { data: { error } });
      setBusy(false);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el titular. Por favor, inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  // ── Dependency modal confirm ───────────────────────────────────────────────
  const handleDependencyConfirm = async (action: 'force' | 'replace', replacementValue?: string) => {
    setShowDependencyModal(false);

    if (!initialData?.id) return;

    if (action === 'force') {
      // Desactivar sin reemplazar dependencias
      const values = form.getValues();
      await onSubmit(values);
      return;
    }

    if (action === 'replace') {
      setBusy(true);
      try {
        // Reasignación + update en UNA transacción del servidor: si algo falla, los equipos no se mueven.
        const toOwnerId = replacementValue !== '__NULL__' && replacementValue ? replacementValue : null;
        const values = form.getValues();
        const result = await reassignAndDeactivateEquipmentOwner(initialData.id, toOwnerId, {
          id: initialData.id,
          name: values.name,
          is_active: values.is_active,
          cuit: values.cuit,
          contract_types: contractTypesDelta(values.contract_types),
        });

        toast({
          title: 'Titular actualizado correctamente',
          description: `Se reasignaron ${result.reassigned} ${result.reassigned === 1 ? 'equipo' : 'equipos'} y se actualizó el titular.`,
          variant: 'default',
        });

        await queryClient.invalidateQueries({ queryKey: ['equipment-owners-list'] });
        onReset();
      } catch (err: unknown) {
        logger.error('Error al reasignar equipos y actualizar titular', { data: { err } });
        setBusy(false);
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'No se pudieron reasignar los equipos.',
          variant: 'destructive',
        });
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Nombre */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input placeholder="Ingrese el nombre del titular" {...field} className="w-full" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* CUIT */}
          <FormField
            control={form.control}
            name="cuit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CUIT</FormLabel>
                <FormControl>
                  <Input placeholder="Ingrese el CUIT" {...field} className="w-full" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Tipos de Contrato */}
          <FormField
            name="contract_types"
            render={() => (
              <FormItem>
                <FormLabel>Tipos de Contrato</FormLabel>
                <div className="space-y-2">
                  {(['Leasing', 'Alquiler', 'Prendado'] as const).map((type) => (
                    <FormField
                      key={type}
                      control={form.control}
                      name="contract_types"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(type)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...field.value, type])
                                  : field.onChange(field.value?.filter((v) => v !== type));
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">{type}</FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Estado activo/inactivo */}
          <FormField
            control={form.control}
            name="is_active"
            render={() => (
              <FormItem className="space-y-3">
                <FormLabel>Activo</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => form.setValue('is_active', value === 'true')}
                    value={form.watch('is_active') ? 'true' : 'false'}
                    className="flex space-x-1"
                  >
                    <FormItem className="flex items-center space-x-6 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="true" />
                      </FormControl>
                      <FormLabel className="font-normal">Activo</FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="false" />
                      </FormControl>
                      <FormLabel className="font-normal">Inactivo</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Botones */}
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting} className="min-w-[100px]">
              {isEditing ? (isSubmitting ? 'Guardando...' : 'Guardar') : isSubmitting ? 'Creando...' : 'Crear'}
            </Button>
            <Button type="button" variant="outline" onClick={onReset} disabled={isSubmitting} className="min-w-[100px]">
              Cancelar
            </Button>
          </div>
        </form>

        {/* Modal de validación de dependencias */}
        {isEditing && initialData && (
          <DependencyValidationModal
            isOpen={showDependencyModal}
            onClose={() => setShowDependencyModal(false)}
            onConfirm={handleDependencyConfirm}
            recordId={initialData.id}
            recordName={initialData.name}
            dependencies={dependencyConfigs}
            title="Confirmar desactivación"
            description="Este titular tiene equipos asignados. Debe resolver estas referencias antes de desactivarlo."
            fetchDependencies={fetchDependencies}
            fetchReplacementOptions={fetchReplacementOptions}
          />
        )}
      </Form>
    </div>
  );
}
