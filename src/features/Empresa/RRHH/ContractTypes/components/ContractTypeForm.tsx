'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import DependencyValidationModal, { DependencyConfig } from '@/shared/components/modal/DependencyValidationModal';
import {
  fetchDependenciesForValue,
  fetchReplacementOptions,
  reassignDependencies,
} from '@/shared/components/modal/dependency-utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createContractTypePrisma, updateContractTypePrisma } from '../actions.server';
import { useContractTypeStore } from '../store/contractType.store';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('ContractTypeForm');

// ============================================================================
// SCHEMA
// ============================================================================

const ContractTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: 'Debe ingresar el nombre del tipo de contrato' }),
  description: z.string().nullable().default(null),
  is_active: z.string().optional(),
});

type ContractTypeFormValues = z.infer<typeof ContractTypeSchema>;

// ============================================================================
// COMPONENT
// ============================================================================

export default function ContractTypeForm() {
  const editingContractType = useContractTypeStore((state) => state.contractType);
  const setContractType = useContractTypeStore((state) => state.setContractType);
  const queryClient = useQueryClient();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const isEditing = !!editingContractType;
  const [showDependencyModal, setShowDependencyModal] = useState(false);

  const form = useForm<ContractTypeFormValues>({
    resolver: zodResolver(ContractTypeSchema),
    defaultValues: {
      name: '',
      description: null,
      is_active: '',
    },
  });

  // Sincronizar form cuando cambia el item a editar
  // useEffect aquí es válido: sincronización con store externo (Zustand)
  // que puede cambiar desde fuera (click en botón "Editar" de la tabla)
  useEffect(() => {
    if (editingContractType) {
      form.reset({
        id: editingContractType.id,
        name: editingContractType.name,
        description: editingContractType.description ?? null,
        is_active:
          editingContractType.is_active === true ? 'true' : editingContractType.is_active === false ? 'false' : '',
      });
    } else {
      form.reset({
        id: undefined,
        name: '',
        description: null,
        is_active: '',
      });
    }
  }, [editingContractType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dependency config ────────────────────────────────────────────────────
  const dependencyConfigs = useMemo<DependencyConfig[]>(
    () => [
      {
        sourceTable: 'types_of_contract',
        sourceColumn: 'name',
        targetTable: 'employees',
        targetColumn: 'type_of_contract',
        displayColumns: ['lastname', 'firstname', 'cuil', 'file'],
        displayLabels: ['Apellido', 'Nombre', 'Documento', 'Legajo'],
        relationName: 'Empleados',
      },
    ],
    []
  );

  const fetchDependencies = async (config: DependencyConfig, recordKeyValue: string) => {
    const select = config.displayColumns.join(',') as '*';
    const data = await fetchDependenciesForValue<'employees', 'type_of_contract'>({
      targetTable: 'employees',
      targetColumn: 'type_of_contract',
      value: recordKeyValue,
      select,
      limit: 10,
    });
    return data;
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const resetForm = () => {
    setContractType(null);
    form.reset({ id: undefined, name: '', description: null, is_active: '' });
    closeSheet();
  };

  const invalidateTable = () => {
    queryClient.invalidateQueries({ queryKey: ['contract-types'] });
  };

  // ── Submit handlers ──────────────────────────────────────────────────────

  const handleCreate = async (values: ContractTypeFormValues) => {
    setBusy(true);
    toast.promise(
      createContractTypePrisma({
        name: values.name,
        description: values.description,
      }),
      {
        loading: 'Creando tipo de contrato...',
        success: () => {
          invalidateTable();
          resetForm();
          return 'Tipo de contrato creado correctamente';
        },
        error: () => {
          setBusy(false);
          return 'Error al crear el tipo de contrato';
        },
      }
    );
  };

  const handleUpdate = async (values: ContractTypeFormValues) => {
    if (!values.id) return;
    setBusy(true);
    toast.promise(
      updateContractTypePrisma({
        id: values.id,
        name: values.name,
        description: values.description,
        is_active: values.is_active === 'true',
      }),
      {
        loading: 'Actualizando tipo de contrato...',
        success: () => {
          invalidateTable();
          resetForm();
          return 'Tipo de contrato actualizado correctamente';
        },
        error: () => {
          setBusy(false);
          return 'Error al actualizar el tipo de contrato';
        },
      }
    );
  };

  const handleSubmit = async (values: ContractTypeFormValues) => {
    if (isEditing && editingContractType) {
      const prevActive = !!editingContractType.is_active;
      const nextActive = values.is_active === 'true';

      // Si se intenta desactivar, verificar dependencias primero
      if (prevActive && !nextActive) {
        setBusy(true);
        try {
          const data = await fetchDependencies(dependencyConfigs[0], editingContractType.id);
          if (data.data.length) {
            setBusy(false);
            setShowDependencyModal(true);
            return;
          }
        } catch (err) {
          logger.error('Error al verificar dependencias del tipo de contrato', { data: { err } });
          setBusy(false);
          toast.error('No se pudo verificar si el tipo de contrato está en uso');
          return;
        }
      }
      await handleUpdate(values);
    } else {
      await handleCreate(values);
    }
  };

  const handleDependencyConfirm = (action: 'force' | 'replace', replacementValue?: string): void => {
    void handleDependencyConfirmAsync(action, replacementValue);
  };

  const handleDependencyConfirmAsync = async (action: 'force' | 'replace', replacementValue?: string) => {
    setShowDependencyModal(false);

    if (!editingContractType) return;

    if (action === 'force') {
      const values = form.getValues();
      await handleUpdate(values);
      return;
    }

    if (action === 'replace') {
      setBusy(true);
      try {
        await reassignDependencies({
          targetTable: 'employees',
          targetColumn: dependencyConfigs[0].targetColumn,
          sourceTable: 'types_of_contract',
          fromValue: editingContractType.id,
          toValue: replacementValue && replacementValue !== '__NULL__' ? replacementValue : null,
        });

        const values = form.getValues();
        await handleUpdate(values);
      } catch (err) {
        logger.error('Error al reemplazar referencias', { data: { err } });
        setBusy(false);
        toast.error('No se pudieron reemplazar las referencias');
      }
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del Tipo de Contrato</FormLabel>
              <FormControl>
                <Input type="text" {...field} className="input w-full" placeholder="Nombre del tipo de contrato" />
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
                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  className="w-full"
                  placeholder="Descripción del tipo de contrato"
                  rows={4}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Activo</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} value={field.value ?? ''} className="flex space-x-1">
                  <FormItem className="flex items-center space-x-3 space-y-0">
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

        <div className="flex gap-2 mt-6">
          <Button type="submit" variant="brand" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? isEditing
                ? 'Actualizando...'
                : 'Creando...'
              : isEditing
                ? 'Actualizar'
                : 'Crear'}
          </Button>
          <Button type="button" onClick={resetForm} variant="outline">
            Cancelar
          </Button>
        </div>
      </form>

      {isEditing && editingContractType && (
        <DependencyValidationModal
          isOpen={showDependencyModal}
          onClose={() => setShowDependencyModal(false)}
          onConfirm={handleDependencyConfirm}
          recordId={editingContractType.id}
          recordName={editingContractType.name}
          dependencies={dependencyConfigs}
          title="Confirmar desactivación"
          description="Este tipo de contrato está siendo utilizado por otros registros. Debe resolver estas referencias antes de desactivarlo."
          fetchDependencies={fetchDependencies}
          fetchReplacementOptions={fetchReplacementOptions}
        />
      )}
    </Form>
  );
}
