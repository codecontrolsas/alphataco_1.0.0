'use client';

import { Form } from '@/components/ui/form';
import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { fetchAllContractorForVehicles } from '@/features/Equipos/EquipoID/actions/vehicle-actions';
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
import moment from 'moment';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { OtherEquipmentTabs } from './OtherEquipmentTabs';
import { OtherEquipmentEditLayout } from './form/OtherEquipmentEditLayout';

const logger = new Logger('OtherEquipmentForm');

// ─── Schema de validación ─────────────────────────────────────────────────────

const otherEquipmentBaseSchema = z.object({
  type_id: z.string().min(1, 'El tipo es requerido'),
  sub_type_id: z.string().nullable().optional(),
  brand_id: z.string().nullable().optional(),
  model_id: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  intern_number: z.string().nullable().optional(),
  year: z.string().nullable().optional(),
  // La condición NO se edita desde este formulario (mismo criterio que vehicles):
  // todo equipo nace 'operativo' y solo la cambian los flujos de mantenimiento
  // y la acción del header. Si el form la mandara, pisaría lo que puso el taller.
  horometer: z.coerce.number().nullable().optional(),
  manufacturer_plate: z.string().nullable().optional(),
  composition: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  initial_value: z.coerce.number().nullable().optional(),
  currency: z.enum(['USD', 'ARS']).nullable().optional(),
  purchase_date: z.date().nullable().optional(),
  owner_id: z.string().nullable().optional(),
  type_of_contract: z.enum(['Leasing', 'Alquiler', 'Propio', 'Prendado']).nullable().optional(),
  contract_start_date: z.date().nullable().optional(),
  contract_expiration_date: z.date().nullable().optional(),
  contract_number: z.string().nullable().optional(),
  // Certificacion del equipamiento. Los dos datos dependientes son opcionales en
  // la base y se vuelven obligatorios en el form cuando `has_certification` esta
  // en true (ver createOtherEquipmentSchema).
  has_certification: z.boolean().default(false),
  certification_expiration_date: z.date().nullable().optional(),
  certification_number: z.string().nullable().optional(),
  linked_vehicle_id: z.string().nullable().optional(),
  // Campos de asignación
  cost_center_id: z.string().nullable().optional(),
  cost_type: z.enum(['Directo', 'Indirecto']).nullable().optional(),
  sector: z.string().nullable().optional(),
  contractors: z.array(z.string()).optional(),
});

function createOtherEquipmentSchema(excludeId?: string) {
  return otherEquipmentBaseSchema.superRefine(async (data, ctx) => {
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

export type OtherEquipmentFormData = z.infer<typeof otherEquipmentBaseSchema>;

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
      contractors: (equipment?.contractors as string[]) ?? [],
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
      if (mode === 'new') {
        const result = await createOtherEquipment({
          type_id: data.type_id,
          sub_type_id: data.sub_type_id ?? null,
          brand_id: data.brand_id ? parseInt(data.brand_id, 10) : null,
          model_id: data.model_id ? parseInt(data.model_id, 10) : null,
          serial_number: data.serial_number ?? null,
          intern_number: data.intern_number ?? null,
          year: data.year ?? null,
          horometer: data.horometer ?? null,
          manufacturer_plate: data.manufacturer_plate ?? null,
          composition: data.composition ?? null,
          invoice_number: data.invoice_number ?? null,
          initial_value: data.initial_value ?? null,
          currency: data.currency ?? null,
          purchase_date: data.purchase_date ? moment(data.purchase_date).format('YYYY-MM-DD') : null,
          owner_id: data.owner_id ?? null,
          type_of_contract: data.type_of_contract ?? null,
          contract_start_date: data.contract_start_date ? moment(data.contract_start_date).format('YYYY-MM-DD') : null,
          contract_expiration_date: data.contract_expiration_date
            ? moment(data.contract_expiration_date).format('YYYY-MM-DD')
            : null,
          contract_number: data.contract_number ?? null,
          // Sin certificacion no se guardan los datos dependientes: si el usuario
          // los cargo y despues destildo el check, no deben quedar en la base
          has_certification: data.has_certification,
          certification_expiration_date:
            data.has_certification && data.certification_expiration_date
              ? moment(data.certification_expiration_date).format('YYYY-MM-DD')
              : null,
          certification_number: data.has_certification ? data.certification_number?.trim() || null : null,
          linked_vehicle_id: data.linked_vehicle_id ?? null,
          cost_center_id: data.cost_center_id ?? null,
          cost_type: data.cost_type ?? null,
          sector: data.sector ?? null,
          contractors: data.contractors ?? [],
        });
        createdId = result?.id;
        toast.success('Equipo creado correctamente');
      } else {
        await updateOtherEquipment(equipmentId!, {
          type_id: data.type_id,
          sub_type_id: data.sub_type_id ?? null,
          brand_id: data.brand_id ? parseInt(data.brand_id, 10) : null,
          model_id: data.model_id ? parseInt(data.model_id, 10) : null,
          serial_number: data.serial_number ?? null,
          intern_number: data.intern_number ?? null,
          year: data.year ?? null,
          horometer: data.horometer ?? null,
          manufacturer_plate: data.manufacturer_plate ?? null,
          composition: data.composition ?? null,
          invoice_number: data.invoice_number ?? null,
          initial_value: data.initial_value ?? null,
          currency: data.currency ?? null,
          purchase_date: data.purchase_date ? moment(data.purchase_date).format('YYYY-MM-DD') : null,
          owner_id: data.owner_id ?? null,
          type_of_contract: data.type_of_contract ?? null,
          contract_start_date: data.contract_start_date ? moment(data.contract_start_date).format('YYYY-MM-DD') : null,
          contract_expiration_date: data.contract_expiration_date
            ? moment(data.contract_expiration_date).format('YYYY-MM-DD')
            : null,
          contract_number: data.contract_number ?? null,
          // Sin certificacion no se guardan los datos dependientes: si el usuario
          // los cargo y despues destildo el check, no deben quedar en la base
          has_certification: data.has_certification,
          certification_expiration_date:
            data.has_certification && data.certification_expiration_date
              ? moment(data.certification_expiration_date).format('YYYY-MM-DD')
              : null,
          certification_number: data.has_certification ? data.certification_number?.trim() || null : null,
          linked_vehicle_id: data.linked_vehicle_id ?? null,
          cost_center_id: data.cost_center_id ?? null,
          cost_type: data.cost_type ?? null,
          sector: data.sector ?? null,
          contractors: data.contractors ?? [],
        });
        toast.success('Equipo actualizado correctamente');
      }

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
          costCentersPromise: otherProps.costCentersPromise,
          hierarchicalPositionsPromise: otherProps.hierarchicalPositionsPromise,
        }}
      />
    </Form>
  );
}
