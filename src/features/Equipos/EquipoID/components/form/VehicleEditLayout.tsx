'use client';

import { Button } from '@/components/ui/button';
import { FormCompletenessAside, SectionErrorsAlert } from '@/shared/components/common/FormCompleteness';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SplitLayout } from '@/shared/components/common/SplitLayout';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { VehicleAssignmentDataForm } from '../../forms/vehicle-assignment-data-form';
import { VehicleBasicDataForm } from '../../forms/vehicle-basic-data-form';
import { REQUIRED_VEHICLE_FIELDS, VEHICLE_FORM_SECTIONS } from '../../lib/vehicle-form';
import type { VehicleFormData } from '../vehicle-tabs';

type BasicFormProps = Omit<React.ComponentProps<typeof VehicleBasicDataForm>, 'form' | 'readOnly'>;
type AssignmentFormProps = Omit<React.ComponentProps<typeof VehicleAssignmentDataForm>, 'form' | 'readOnly'>;

interface VehicleEditLayoutProps {
  form: UseFormReturn<VehicleFormData>;
  isNew: boolean;
  /** Dominio del equipo que se edita (título de la pantalla). */
  domain?: string | null;
  isBusy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  basicProps: BasicFormProps;
  assignmentProps: AssignmentFormProps;
}

/** Alta y edición del vehículo: el formulario completo en una página, con la completitud al costado. */
export function VehicleEditLayout({
  form,
  isNew,
  domain,
  isBusy,
  onSubmit,
  onCancel,
  basicProps,
  assignmentProps,
}: VehicleEditLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-2">
          <ArrowLeft />
          {isNew ? 'Vehículos' : 'Volver a la ficha'}
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isNew ? 'Nuevo vehículo' : `Editar ${domain ?? 'vehículo'}`}
        </h1>
        <p className="text-muted-foreground">
          {isNew
            ? 'Cargá lo que ya tengas; la documentación se sube después desde la ficha.'
            : 'Los cambios se aplican al guardar.'}
        </p>
      </div>

      <SplitLayout
        main={
          <>
            <SectionCard title="Datos del equipo" description="Qué es, cómo se identifica y bajo qué régimen opera.">
              <VehicleBasicDataForm {...basicProps} form={form} readOnly={false} />
            </SectionCard>
            <SectionCard title="Asignación" description="Dónde trabaja y a quién se le imputa.">
              <VehicleAssignmentDataForm {...assignmentProps} form={form} readOnly={false} />
            </SectionCard>

            <div className="bg-background/90 sticky bottom-0 -mx-1 space-y-3 px-1 py-4 backdrop-blur-sm">
              <SectionErrorsAlert sections={VEHICLE_FORM_SECTIONS} required={REQUIRED_VEHICLE_FIELDS} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={isBusy}>
                  Cancelar
                </Button>
                {/* `form.formState.isSubmitting` se activa al inicio de `handleSubmit` (antes de validar),
                    así que `isBusy` cubre la ventana en la que el resolver consulta el dominio. */}
                <Button type="button" onClick={onSubmit} disabled={isBusy} aria-busy={isBusy}>
                  {isBusy && <Loader2 className="animate-spin motion-reduce:animate-none" />}
                  {isBusy ? 'Guardando…' : isNew ? 'Crear vehículo' : 'Guardar cambios'}
                </Button>
              </div>
            </div>
          </>
        }
        aside={
          <>
            <FormCompletenessAside
              title="Completitud de la ficha"
              sections={VEHICLE_FORM_SECTIONS}
              required={REQUIRED_VEHICLE_FIELDS}
            />
            <SectionCard title="Qué pasa al guardar">
              <p className="text-muted-foreground text-sm text-pretty">
                {isNew
                  ? 'Se crea el equipo y quedan habilitados sus documentos, checklists y código QR.'
                  : 'Los cambios se aplican a la ficha. Los documentos y el historial ya cargados se conservan.'}
              </p>
            </SectionCard>
          </>
        }
      />
    </div>
  );
}
