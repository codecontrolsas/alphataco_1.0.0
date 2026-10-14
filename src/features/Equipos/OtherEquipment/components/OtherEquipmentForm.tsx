'use client';

import { Form } from '@/components/ui/form';
import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { fetchAllContractorForVehicles } from '@/features/Equipos/EquipoID/actions/customer-catalog-actions';
import {
  getModelsByBrand,
  getSubTypesByType,
  getVehicleBrands,
  getVehicleOwners,
  getVehicleTypes,
} from '@/features/Equipos/EquipoID/lib/actions/vehicle-catalog-actions';
import {
  checkOtherEquipmentDuplicates,
  createOtherEquipment,
  updateOtherEquipment,
  type OtherEquipmentDetail,
} from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  buildOtherEquipmentPayload,
  diffContractors,
  otherEquipmentFormSchema,
  type OtherEquipmentFormData,
} from '../schemas/other-equipment-form';
import { OtherEquipmentTabs } from './OtherEquipmentTabs';
import { OtherEquipmentEditLayout } from './form/OtherEquipmentEditLayout';

const logger = new Logger('OtherEquipmentForm');

// ─── Schema de validación ─────────────────────────────────────────────────────

function createOtherEquipmentSchema(excludeId?: string) {
  return otherEquipmentFormSchema.superRefine(async (data, ctx) => {
    // Si el equipamiento posee certificacion, sus dos datos son obligatorios
    if (data.has_certification) {
      if (!data.certification_expiration_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La fecha de vencimiento de la certificación es requerida',
          path: ['certification_expiration_date'],
        });
      }
      if (!data.certification_number?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El número de certificación es requerido',
          path: ['certification_number'],
        });
      }
    }

    if (!data.serial_number && !data.intern_number) return;

    const duplicates = await checkOtherEquipmentDuplicates(data.serial_number, data.intern_number, excludeId);

    if (duplicates.serial_number) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: duplicates.serial_number,
        path: ['serial_number'],
      });
    }

    if (duplicates.intern_number) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: duplicates.intern_number,
        path: ['intern_number'],
      });
    }
  });
}

export type { OtherEquipmentFormData };

// ─── Props ────────────────────────────────────────────────────────────────────

interface OtherEquipmentFormProps {
  equipment?: OtherEquipmentDetail | null;
  mode: 'view' | 'edit' | 'new';
  equipmentId?: string;
  brandsPromise: ReturnType<typeof getVehicleBrands>;
  modelsPromise: ReturnType<typeof getModelsByBrand>;
  typesPromise: ReturnType<typeof getVehicleTypes>;
  subTypesPromise: ReturnType<typeof getSubTypesByType>;
  ownersPromise: ReturnType<typeof getVehicleOwners>;
  contractorsPromise: ReturnType<typeof fetchAllContractorForVehicles>;
  costCentersPromise: ReturnType<typeof getCostCenterOptions>;
  hierarchicalPositionsPromise: Promise<Array<{ id: string; name: string }>>;
  vehiclesPromise: Promise<Array<{ id: string; domain: string | null }>>;
  certificationsComponent?: React.ReactNode;
  qrComponent?: React.ReactNode;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function OtherEquipmentForm({ equipment, mode, equipmentId, ...otherProps }: OtherEquipmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Candado sincrono contra doble submit. El estado de React no alcanza: la validacion
  // del resolver es async (consulta duplicados en el servidor), asi que dos clicks
  // seguidos pueden llegar a onSubmit antes de cualquier re-render.
  const submitLockRef = useRef(false);
  const readOnly = mode === 'view';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  // Baseline de afectaciones: lo que el servidor devolvió al cargar la ficha (vacío en el alta)
  const baselineContractors = equipment?.contractors ?? [];

  const form = useForm<OtherEquipmentFormData>({
    resolver: zodResolver(createOtherEquipmentSchema(mode === 'edit' ? equipmentId : undefined)),
    defaultValues: {
      type_id: equipment?.type?.id ?? '',
      sub_type_id: equipment?.sub_type?.id ?? null,
      brand_id: equipment?.brand_vehicles?.id?.toString() ?? null,
      model_id: equipment?.model_vehicles?.id?.toString() ?? null,
      serial_number: equipment?.serial_number ?? null,
      intern_number: equipment?.intern_number ?? null,
      year: equipment?.year ?? null,
      horometer: equipment?.horometer ?? null,
      manufacturer_plate: equipment?.manufacturer_plate ?? null,
      composition: equipment?.composition ?? null,
      invoice_number: equipment?.invoice_number ?? null,
      initial_value: equipment?.initial_value ?? null,
      currency: (equipment?.currency as OtherEquipmentFormData['currency']) ?? 'ARS',
      purchase_date: equipment?.purchase_date ? moment(equipment.purchase_date).toDate() : null,
      owner_id: equipment?.equipment_owners?.id?.toString() ?? null,
      type_of_contract: (equipment?.type_of_contract as OtherEquipmentFormData['type_of_contract']) ?? null,
      contract_start_date: equipment?.contract_start_date ? moment(equipment.contract_start_date).toDate() : null,
      contract_expiration_date: equipment?.contract_expiration_date
        ? moment(equipment.contract_expiration_date).toDate()
        : null,
      contract_number: equipment?.contract_number ?? null,
      has_certification: equipment?.has_certification ?? false,
      certification_expiration_date: equipment?.certification_expiration_date
        ? moment(equipment.certification_expiration_date).toDate()
        : null,
      certification_number: equipment?.certification_number ?? null,
      linked_vehicle_id: equipment?.vehicles?.id ?? null,
      cost_center_id: equipment?.cost_center?.id ?? null,
      cost_type: (equipment?.cost_type as OtherEquipmentFormData['cost_type']) ?? null,
      sector: equipment?.hierarchy?.id ?? null,
      contractors: baselineContractors,
    },
  });

  const onSubmit = async (data: OtherEquipmentFormData) => {
    if (submitLockRef.current) {
      logger.warn('Submit descartado: ya hay un guardado en curso');
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    let createdId: string | undefined;

    try {
      // Altas y bajas explícitas contra el baseline del servidor (las afectaciones con las que
      // se cargó la ficha). Solo se puede quitar un cliente que el usuario pudo destildar.
      const selectable = (await otherProps.contractorsPromise).map((contractor) => contractor.id);
      const changes = diffContractors(baselineContractors, data.contractors ?? [], selectable);
      const payload = buildOtherEquipmentPayload(data, changes);

      const result =
        mode === 'new' ? await createOtherEquipment(payload) : await updateOtherEquipment(equipmentId!, payload);
      createdId = mode === 'new' ? result.id : undefined;

      const { added, removed } = result.contractors;
      const contractorsSummary =
        added > 0 || removed > 0 ? ` Afectaciones: ${added} agregada(s), ${removed} quitada(s).` : '';
      const successMessage = mode === 'new' ? 'Equipo creado correctamente.' : 'Equipo actualizado correctamente.';
      toast.success(`${successMessage}${contractorsSummary}`);

      // Las tablas de equipamiento (activos y dados de baja) y sus conteos de filtros son de
      // React Query: sin invalidar, el listado seguiría mostrando los datos viejos.
      queryClient.invalidateQueries({ queryKey: ['other-equipment-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['inactive-other-equipment-list'] });
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });

      // El boton queda deshabilitado a proposito: la navegacion a la vista de detalle
      // sigue en curso y liberarlo aca permitiria crear el mismo equipo otra vez.
      refreshAfterSave(createdId);
    } catch (error) {
      logger.error('Error al guardar other equipment', { data: { error } });
      const message = error instanceof Error ? error.message : undefined;
      toast.error(message || (mode === 'new' ? 'Error al crear el equipo' : 'Error al actualizar el equipo'));
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const refreshAfterSave = (createdId?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('action', 'view');
    params.set('type', 'other');

    if (createdId) {
      params.set('id', createdId);
    }

    router.refresh();
    router.push(`${pathname}?${params.toString()}`);
  };

  // Al editar, el form NO se remonta despues de guardar (la key del padre es el id del
  // equipo): cuando vuelve a modo lectura la navegacion ya termino y se libera el candado
  // para que una edicion posterior pueda guardar de nuevo.
  const [wasReadOnly, setWasReadOnly] = useState(readOnly);
  if (readOnly !== wasReadOnly) {
    setWasReadOnly(readOnly);
    if (readOnly) {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  const isBusy = isSubmitting || form.formState.isSubmitting;

  const handleCancel = () => {
    if (mode === 'new') {
      router.push('/dashboard/equipment?tab=others');
      return;
    }
    // El form no se remonta al volver a la ficha (la key es el id del equipo): sin reset, lo editado y
    // no guardado reaparecería al tocar "Editar" otra vez.
    form.reset();
    const params = new URLSearchParams(searchParams.toString());
    params.set('action', 'view');
    router.push(`${pathname}?${params.toString()}`);
  };

  // Lectura: ficha con pestañas. Edición y alta: formulario completo en una página.
  if (readOnly && equipment) {
    return (
      <OtherEquipmentTabs
        equipment={equipment}
        certificationsComponent={otherProps.certificationsComponent}
        qrComponent={otherProps.qrComponent}
      />
    );
  }

  return (
    <Form {...form}>
      <OtherEquipmentEditLayout
        form={form}
        equipment={mode === 'new' ? null : equipment}
        isBusy={isBusy}
        onSubmit={() => form.handleSubmit(onSubmit)()}
        onCancel={handleCancel}
        basicProps={{
          brandsPromise: otherProps.brandsPromise,
          modelsPromise: otherProps.modelsPromise,
          typesPromise: otherProps.typesPromise,
          subTypesPromise: otherProps.subTypesPromise,
          ownersPromise: otherProps.ownersPromise,
          vehiclesPromise: otherProps.vehiclesPromise,
        }}
        assignmentProps={{
          contractorsPromise: otherProps.contractorsPromise,
          baselineContractorIds: baselineContractors,
          costCentersPromise: otherProps.costCentersPromise,
          hierarchicalPositionsPromise: otherProps.hierarchicalPositionsPromise,
        }}
      />
    </Form>
  );
}
