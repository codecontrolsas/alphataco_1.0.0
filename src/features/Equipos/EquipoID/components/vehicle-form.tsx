'use client';
import { VehicleById } from '@/app/dashboard/equipment/action/page';
import { Form } from '@/components/ui/form';
import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { fetchAllContractorForVehicles } from '@/features/Equipos/EquipoID/actions/vehicle-actions';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import moment from 'moment';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
import { useVehicleFormReset } from '../lib/store/vehicleFormReset';
import { VEHICLE_TYPE_OF_VEHICLE_ID } from '../lib/utils/vehicle-utils';
import { vehicleFormSchema } from '../schemas/vehicle';
import { VehicleEditLayout } from './form/VehicleEditLayout';
import { VehicleFormData, VehicleTabs } from './vehicle-tabs';

const logger = new Logger('VehicleForm');

interface VehicleFormProps {
  vehicle?: VehicleById;
  mode: 'view' | 'edit' | 'new';
  vehicleId?: string;
  brandsPromise: ReturnType<typeof getVehicleBrands>;
  modelsPromise: ReturnType<typeof getModelsByBrand>;
  typesOfVehiclesPromise: ReturnType<typeof getTypesOfVehicles>;
  contractorsPromise: ReturnType<typeof fetchAllContractorForVehicles>;
  costCentersPromise: ReturnType<typeof getCostCenterOptions>;
  hierarchicalPositionsPromise: Promise<Array<{ id: string; name: string }>>;
  documentsComponent?: React.ReactNode;
  qrComponent?: React.ReactNode;
  checklistsComponent?: React.ReactNode;
  operationsComponent?: React.ReactNode;
  tiresComponent?: React.ReactNode;
  typesPromise: ReturnType<typeof getVehicleTypes>;
  subTypesPromise: ReturnType<typeof getSubTypesByType>;
  ownersPromise: Promise<getVehicleOwnersType>;
}

/**
 * Schema del formulario: la base vive en `schemas/vehicle.ts` (compartida con el servidor);
 * acá sólo se agrega el chequeo async de dominio repetido, que consulta una server action
 * y sólo aplica al alta (`action=new`).
 */
const vehicleSchema = vehicleFormSchema.refine(
  async (data) => {
    if (
      data.type_of_vehicle === '1' &&
      data.domain &&
      window.location.href.includes('/dashboard/equipment/action?action=new')
    ) {
      return !(await isVehicleDomainTaken(data.domain));
    }
    return true;
  },
  { message: 'El dominio ya existe', path: ['domain'] }
);

export function VehicleForm({ vehicle, mode, vehicleId, ...otherProps }: VehicleFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Candado sincrono contra doble submit. El estado de React no alcanza: la validacion
  // del resolver es async (consulta si el dominio ya existe), asi que dos clicks seguidos
  // pueden llegar a onSubmit antes de cualquier re-render.
  const submitLockRef = useRef(false);
  const readOnly = mode === 'view';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resetTrigger, triggerReset } = useVehicleFormReset();

  const onSubmit = async (data: VehicleFormData) => {
    if (submitLockRef.current) {
      logger.warn('Submit descartado: ya hay un guardado en curso');
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    let createdVehicleId;
    // La fecha de certificacion viaja como 'YYYY-MM-DD' (formateada en la zona del navegador),
    // igual que en equipamientos. Si viajara como Date, un navegador al este de UTC la
    // serializa como el dia anterior (medianoche local del 15 = 14 a las 23:00 UTC) y la
    // columna DATE guarda un dia menos.
    const payload = {
      ...data,
      certification_expiration_date:
        data.has_certification && data.certification_expiration_date
          ? moment(data.certification_expiration_date).format('YYYY-MM-DD')
          : null,
    };
    try {
      if (mode === 'new') {
        const result = await createVehicle(payload);
        if (result?.id) {
          createdVehicleId = result.id;
        }
        toast.success('Equipo creado correctamente');
      } else {
        await updateVehicle(vehicleId!, payload);
        toast.success('Equipo actualizado correctamente');
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

  const form = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      // Unico valor posible en este form: los otros equipos se cargan desde su propia pantalla
      type_of_vehicle: vehicle?.types_of_vehicles?.id?.toString() || VEHICLE_TYPE_OF_VEHICLE_ID,
      brand: vehicle?.brand_vehicles?.id?.toString() || '',
      model: vehicle?.model_vehicles?.id?.toString() || null,
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

  useEffect(() => {
    if (resetTrigger > 0) {
      form.reset();
    }
  }, [resetTrigger]);

  const refresh = (createdVehicleId?: string | undefined) => {
    if (!createdVehicleId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('action', 'view');
      router.refresh();
      router.push(`${pathname}?${params.toString()}`);
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.set('action', 'view');
      params.set('id', createdVehicleId.toString());
      router.refresh();
      router.push(`${pathname}?${params.toString()}`);
    }
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
      router.push('/dashboard/equipment');
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('action', 'view');
    router.push(`${pathname}?${params.toString()}`);
    triggerReset();
  };

  // Lectura: ficha con pestañas. Edición y alta: formulario completo en una página.
  if (readOnly && vehicle) {
    return (
      <VehicleTabs
        vehicle={vehicle}
        costCentersPromise={otherProps.costCentersPromise}
        hierarchicalPositionsPromise={otherProps.hierarchicalPositionsPromise}
        documentsComponent={otherProps.documentsComponent}
        qrComponent={otherProps.qrComponent}
        checklistsComponent={otherProps.checklistsComponent}
        operationsComponent={otherProps.operationsComponent}
        tiresComponent={otherProps.tiresComponent}
      />
    );
  }

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
          contractorsPromise: otherProps.contractorsPromise,
          costCentersPromise: otherProps.costCentersPromise,
          hierarchicalPositionsPromise: otherProps.hierarchicalPositionsPromise,
        }}
      />
    </Form>
  );
}
