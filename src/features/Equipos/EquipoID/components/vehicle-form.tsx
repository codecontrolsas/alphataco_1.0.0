'use client';
import { VehicleById } from '@/app/dashboard/equipment/action/page';
import { Form } from '@/components/ui/form';
import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { fetchAllContractorForVehicles } from '@/features/Equipos/EquipoID/actions/customer-catalog-actions';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createVehicle, isVehicleDomainTaken, updateVehicle } from '../lib/actions/vehicle-actions';
import {
  getModelsByBrand,
  getSubTypesByType,
  getTypesOfVehicles,
  getVehicleBrands,
  getVehicleOwnersType,
  getVehicleTypes,
} from '../lib/actions/vehicle-catalog-actions';
import { diffAllocations } from '../lib/allocation-diff';
import { invalidateVehicleLists } from '../lib/invalidate-vehicle-lists';
import { VEHICLE_TYPE_OF_VEHICLE_ID } from '../lib/utils/vehicle-utils';
import { vehicleFormSchema, type VehicleFormValues } from '../schemas/vehicle';
import { VehicleEditLayout } from './form/VehicleEditLayout';

const logger = new Logger('VehicleForm');

interface VehicleFormProps {
  vehicle?: VehicleById;
  mode: 'edit' | 'new';
  vehicleId?: string;
  brandsPromise: ReturnType<typeof getVehicleBrands>;
  modelsPromise: ReturnType<typeof getModelsByBrand>;
  typesOfVehiclesPromise: ReturnType<typeof getTypesOfVehicles>;
  contractorsPromise: ReturnType<typeof fetchAllContractorForVehicles>;
  costCentersPromise: ReturnType<typeof getCostCenterOptions>;
  hierarchicalPositionsPromise: Promise<Array<{ id: string; name: string }>>;
  typesPromise: ReturnType<typeof getVehicleTypes>;
  subTypesPromise: ReturnType<typeof getSubTypesByType>;
  ownersPromise: Promise<getVehicleOwnersType>;
}

/**
 * Schema del formulario: la base vive en `schemas/vehicle.ts` (compartida con el servidor);
 * acá sólo se agrega el chequeo async de dominio repetido, que consulta una server action.
 * En la edición se excluye al propio equipo.
 */
function buildVehicleSchema(excludeId: string | undefined) {
  return vehicleFormSchema.refine(
    async (data) => {
      if (data.type_of_vehicle === '1' && data.domain) {
        return !(await isVehicleDomainTaken(data.domain, excludeId));
      }
      return true;
    },
    { message: 'El dominio ya está registrado', path: ['domain'] }
  );
}

/** Día sin hora: se manda como `YYYY-MM-DD` para que la zona del navegador no corra la fecha. */
const toDateString = (value: Date | null | undefined) => (value ? moment(value).format('YYYY-MM-DD') : null);

export function VehicleForm({ vehicle, mode, vehicleId, ...otherProps }: VehicleFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Candado sincrono contra doble submit. El estado de React no alcanza: la validacion
  // del resolver es async (consulta si el dominio ya existe), asi que dos clicks seguidos
  // pueden llegar a onSubmit antes de cualquier re-render.
  const submitLockRef = useRef(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vehicleSchema = useMemo(() => buildVehicleSchema(mode === 'edit' ? vehicleId : undefined), [mode, vehicleId]);
  // Baseline de afectaciones: lo que la ficha trajo del servidor al abrir. El delta se arma contra esto.
  const baselineAllocations = vehicle?.allocated_to ?? [];

  const onSubmit = async (data: VehicleFormValues) => {
    if (submitLockRef.current) {
      logger.warn('Submit descartado: ya hay un guardado en curso');
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    let createdVehicleId: string | undefined;
    // Las fechas viajan como 'YYYY-MM-DD' (formateadas en la zona del navegador). Si viajaran como
    // Date, un navegador al este de UTC la serializa como el dia anterior (medianoche local del 15
    // = 14 a las 23:00 UTC) y la columna DATE guarda un dia menos.
    const { allocated_to: finalAllocations, ...rest } = data;
    const payload = {
      ...rest,
      contract_start_date: toDateString(data.contract_start_date),
      contract_expiration_date: toDateString(data.contract_expiration_date),
      certification_expiration_date: data.has_certification ? toDateString(data.certification_expiration_date) : null,
    };
    try {
      if (mode === 'new') {
        // Alta: no hay baseline, todas las afectaciones son altas.
        const result = await createVehicle({ ...payload, allocated_to: finalAllocations ?? [] });
        if (result?.id) {
          createdVehicleId = result.id;
        }
        toast.success('Equipo creado correctamente');
      } else {
        const allocationChanges = diffAllocations(baselineAllocations, finalAllocations ?? []);
        const result = await updateVehicle(vehicleId!, { ...payload, allocation_changes: allocationChanges });
        const allocationSummary = [
          result.added > 0 ? `${result.added} afectación(es) agregada(s)` : null,
          result.removed > 0 ? `${result.removed} afectación(es) quitada(s)` : null,
        ]
          .filter(Boolean)
          .join(', ');
        toast.success(
          'Equipo actualizado correctamente',
          allocationSummary ? { description: allocationSummary } : undefined
        );
      }
      // El boton queda deshabilitado a proposito: la navegacion a la vista de detalle
      // sigue en curso y liberarlo aca permitiria crear el mismo equipo otra vez.
      refresh(createdVehicleId);
    } catch (error) {
      logger.error('Error submitting form', { data: { error } });
      const message = error instanceof Error ? error.message : undefined;
      toast.error(message || (mode === 'new' ? 'Error al crear el equipo' : 'Error al actualizar el equipo'));
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      // Unico valor posible en este form: los otros equipos se cargan desde su propia pantalla
      type_of_vehicle: vehicle?.types_of_vehicles?.id?.toString() || VEHICLE_TYPE_OF_VEHICLE_ID,
      brand: vehicle?.brand_vehicles?.id?.toString() || '',
      model: vehicle?.model_vehicles?.id?.toString() || '',
      year: vehicle?.year || '',
      engine: vehicle?.engine || '',
      type: vehicle?.type.id || null,
      subType: vehicle?.sub_type?.id || null,
      chassis: vehicle?.chassis || '',
      serie: vehicle?.serie || '',
      domain: vehicle?.domain || '',
      kilometer: vehicle?.kilometer || '',
      engine_hours: vehicle?.engine_hours || '',
      intern_number: vehicle?.intern_number || '',
      picture: vehicle?.picture || null,
      allocated_to: vehicle?.allocated_to || [],
      cost_center_id: vehicle?.cost_center_id || null,
      cost_type: vehicle?.cost_type || undefined,
      sector: vehicle?.sector || '',
      owner_id: vehicle?.equipment_owners?.id || null,
      type_of_contract: vehicle?.type_of_contract || null,
      contract_expiration_date: vehicle?.contract_expiration_date
        ? moment(vehicle.contract_expiration_date).toDate()
        : null,
      contract_start_date: vehicle?.contract_start_date ? moment(vehicle.contract_start_date).toDate() : null,
      contract_number: vehicle?.contract_number || '',
      has_certification: vehicle?.has_certification ?? false,
      certification_expiration_date: vehicle?.certification_expiration_date
        ? moment(vehicle.certification_expiration_date).toDate()
        : null,
      certification_number: vehicle?.certification_number ?? null,
      price: vehicle?.price || undefined,
      currency: vehicle?.currency || 'USD',
    },
  });

  /** Tras guardar: a la ficha en lectura (la del equipo nuevo si fue un alta). `revalidatePath` ya refrescó los datos. */
  const refresh = (createdVehicleId?: string) => {
    invalidateVehicleLists(queryClient);
    const params = new URLSearchParams(searchParams.toString());
    params.set('action', 'view');
    if (createdVehicleId) params.set('id', createdVehicleId);
    router.push(`${pathname}?${params.toString()}`);
  };

  const isBusy = isSubmitting || form.formState.isSubmitting;

  const handleCancel = () => {
    if (mode === 'new') {
      router.push('/dashboard/equipment');
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('action', 'view');
    router.push(`${pathname}?${params.toString()}`);
    form.reset();
  };

  return (
    <Form {...form}>
      <VehicleEditLayout
        form={form}
        isNew={mode === 'new'}
        domain={vehicle?.domain}
        isBusy={isBusy}
        onSubmit={() => form.handleSubmit(onSubmit)()}
        onCancel={handleCancel}
        basicProps={{
          ownersPromise: otherProps.ownersPromise,
          brandsPromise: otherProps.brandsPromise,
          modelsPromise: otherProps.modelsPromise,
          typesPromise: otherProps.typesPromise,
          subTypesPromise: otherProps.subTypesPromise,
          typesOfVehiclesPromise: otherProps.typesOfVehiclesPromise,
        }}
        assignmentProps={{
          baselineAllocations,
          contractorsPromise: otherProps.contractorsPromise,
          costCentersPromise: otherProps.costCentersPromise,
          hierarchicalPositionsPromise: otherProps.hierarchicalPositionsPromise,
        }}
      />
    </Form>
  );
}
