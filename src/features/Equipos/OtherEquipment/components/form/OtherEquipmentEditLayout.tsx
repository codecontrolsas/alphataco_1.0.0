'use client';

import { Button } from '@/components/ui/button';
import type { OtherEquipmentDetail } from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { FormCompletenessAside, SectionErrorsAlert } from '@/shared/components/common/FormCompleteness';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SplitLayout } from '@/shared/components/common/SplitLayout';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { MAX_FILES_BY_KIND } from '../../lib/equipment-files';
import { OTHER_EQUIPMENT_FORM_SECTIONS, REQUIRED_OTHER_EQUIPMENT_FIELDS } from '../../lib/other-equipment-form';
import { OtherEquipmentAssignmentForm } from '../OtherEquipmentAssignmentForm';
import { OtherEquipmentBasicDataForm } from '../OtherEquipmentBasicDataForm';
import { OtherEquipmentFileUpload } from '../OtherEquipmentFileUpload';
import type { OtherEquipmentFormData } from '../OtherEquipmentForm';

type BasicFormProps = Omit<React.ComponentProps<typeof OtherEquipmentBasicDataForm>, 'form' | 'readOnly'>;
type AssignmentFormProps = Omit<React.ComponentProps<typeof OtherEquipmentAssignmentForm>, 'form' | 'readOnly'>;

interface OtherEquipmentEditLayoutProps {
  form: UseFormReturn<OtherEquipmentFormData>;
  /** `undefined` en el alta: las fotos y los planos se suben contra un equipo ya creado. */
  equipment?: OtherEquipmentDetail | null;
  isBusy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  basicProps: BasicFormProps;
  assignmentProps: AssignmentFormProps;
}

/** Alta y edición del equipamiento: el formulario completo en una página, con la completitud al costado. */
export function OtherEquipmentEditLayout({
  form,
  equipment,
  isBusy,
  onSubmit,
  onCancel,
  basicProps,
  assignmentProps,
}: OtherEquipmentEditLayoutProps) {
  const isNew = !equipment;
  const identifier = equipment?.serial_number || equipment?.intern_number;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="-ml-2">
          <ArrowLeft />
          {isNew ? 'Equipamiento' : 'Volver a la ficha'}
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isNew ? 'Nuevo equipo' : `Editar ${identifier ?? 'equipo'}`}
        </h1>
        <p className="text-muted-foreground">
          {isNew
            ? 'Cargá lo que ya tengas; las fotos, los planos y los documentos se suben después desde la ficha.'
            : 'Los cambios se aplican al guardar.'}
        </p>
      </div>

      <SplitLayout
        main={
          <>
            <SectionCard title="Datos del equipo" description="Qué es, cómo se identifica y bajo qué régimen opera.">
              <OtherEquipmentBasicDataForm {...basicProps} form={form} readOnly={false} />
            </SectionCard>
            <SectionCard title="Asignación" description="Dónde trabaja y a quién se le imputa.">
              <OtherEquipmentAssignmentForm {...assignmentProps} form={form} readOnly={false} />
            </SectionCard>

            {equipment && (
              <>
                <SectionCard
                  title="Fotos"
                  description={`Imágenes del equipo (máx. ${MAX_FILES_BY_KIND.pictures}). Se guardan al subirlas.`}
                >
                  {/* key por equipo: sin remount, el estado interno mostraría las fotos del equipo anterior. */}
                  <OtherEquipmentFileUpload
                    key={`${equipment.id}-pictures`}
                    equipmentId={equipment.id}
                    type="pictures"
                    files={equipment.pictures ?? []}
                    maxFiles={MAX_FILES_BY_KIND.pictures}
                  />
                </SectionCard>
                <SectionCard title="Planos" description="Documentos técnicos y planos. Se guardan al subirlos.">
                  <OtherEquipmentFileUpload
                    key={`${equipment.id}-blueprints`}
                    equipmentId={equipment.id}
                    type="blueprints"
                    files={equipment.blueprints ?? []}
                    maxFiles={MAX_FILES_BY_KIND.blueprints}
                  />
                </SectionCard>
              </>
            )}

            <div className="bg-background/90 sticky bottom-0 -mx-1 space-y-3 px-1 py-4 backdrop-blur-sm">
              <SectionErrorsAlert sections={OTHER_EQUIPMENT_FORM_SECTIONS} required={REQUIRED_OTHER_EQUIPMENT_FIELDS} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={isBusy}>
                  Cancelar
                </Button>
                {/* `form.formState.isSubmitting` se activa al inicio de `handleSubmit` (antes de validar),
                    así que `isBusy` cubre la ventana en la que el resolver consulta duplicados. */}
                <Button type="button" onClick={onSubmit} disabled={isBusy} aria-busy={isBusy}>
                  {isBusy && <Loader2 className="animate-spin motion-reduce:animate-none" />}
                  {isBusy ? 'Guardando…' : isNew ? 'Crear equipo' : 'Guardar cambios'}
                </Button>
              </div>
            </div>
          </>
        }
        aside={
          <>
            <FormCompletenessAside
              title="Completitud de la ficha"
              sections={OTHER_EQUIPMENT_FORM_SECTIONS}
              required={REQUIRED_OTHER_EQUIPMENT_FIELDS}
            />
            <SectionCard title="Qué pasa al guardar">
              <p className="text-muted-foreground text-sm text-pretty">
                {isNew
                  ? 'Se crea el equipo y quedan habilitados sus documentos, mantenimientos y, si su tipo lo pide, el código QR.'
                  : 'Los cambios se aplican a la ficha. Los documentos y el historial ya cargados se conservan.'}
              </p>
            </SectionCard>
          </>
        }
      />
    </div>
  );
}
