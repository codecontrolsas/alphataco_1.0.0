'use client';

import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ContactDataFields } from '@/features/Employees/shared/forms/ContactDataFields';
import { PersonalDataFields } from '@/features/Employees/shared/forms/PersonalDataFields';
import { Logger } from '@/lib/logger';
import { FormCompletenessAside, SectionErrorsAlert } from '@/shared/components/common/FormCompleteness';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SplitLayout } from '@/shared/components/common/SplitLayout';
import { useRefreshAndWait } from '@/shared/hooks/useRefreshAndWait';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createPreEmployee,
  updatePreEmployee,
  type PreEmployeeDetailData,
} from '../../actions/pre-employee-actions.server';
import {
  PRE_EMPLOYEE_FORM_SECTIONS,
  REQUIRED_PRE_EMPLOYEE_FIELDS,
  buildPreEmployeeDefaultValues,
} from '../../lib/pre-employee-form';
import { preEmployeeFormSchema, type PreEmployeeFormData } from '../../schemas/pre-employee-schema';
import { useInvalidatePreEmployeeLists } from '../../hooks/useInvalidatePreEmployeeLists';
import { PreEmployeeWorkDataForm } from '../forms/PreEmployeeWorkDataForm';

const logger = new Logger('PreEmployeeFormView');

interface PreEmployeeFormViewProps {
  /** `null` en un alta. */
  preEmployee: PreEmployeeDetailData | null;
  /** Vuelve atrás: a la ficha al editar, a la lista al crear. */
  onClose: () => void;
}

/** Alta y edición del candidato: tres secciones apiladas con un único form y, a la derecha, la completitud. */
export function PreEmployeeFormView({ preEmployee, onClose }: PreEmployeeFormViewProps) {
  const router = useRouter();
  const invalidateLists = useInvalidatePreEmployeeLists();
  const { refreshAndWait, isRefreshing } = useRefreshAndWait();
  const isNew = !preEmployee;
  // Tras crear, la navegación a la ficha tarda: el botón sigue bloqueado para no crear el mismo candidato dos veces.
  const [isCreated, setIsCreated] = useState(false);

  const form = useForm<PreEmployeeFormData>({
    resolver: zodResolver(preEmployeeFormSchema),
    defaultValues: buildPreEmployeeDefaultValues(preEmployee),
  });

  const onSubmit = async (values: PreEmployeeFormData) => {
    try {
      if (!preEmployee) {
        const created = await createPreEmployee(values);
        toast.success('Candidato creado');
        invalidateLists();
        setIsCreated(true);
        router.push(`/dashboard/recruitment/detail?action=view&pre_employee_id=${created.id}`);
        return;
      }

      await updatePreEmployee(preEmployee.id, values);
      toast.success('Cambios guardados');
      invalidateLists();
      await refreshAndWait();
      onClose();
    } catch (error) {
      logger.error('Error al guardar el candidato', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el candidato');
    }
  };

  const isSaving = form.formState.isSubmitting || isRefreshing || isCreated;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="-ml-2">
          <ArrowLeft />
          {isNew ? 'Candidatos' : 'Volver a la ficha'}
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {preEmployee ? `Editar a ${preEmployee.firstname} ${preEmployee.lastname}` : 'Nuevo candidato'}
        </h1>
        <p className="text-muted-foreground">
          {isNew
            ? 'Cargá lo que ya tengas; los documentos se suben después desde la ficha.'
            : 'Los datos se pueden editar mientras está en proceso o en pre ingreso.'}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <SplitLayout
            main={
              <>
                <SectionCard title="Datos personales" description="Tal como figuran en el DNI.">
                  <div className="space-y-6">
                    {preEmployee && (
                      <div className="max-w-xs space-y-2">
                        <Label htmlFor="pre_file_number">N° de candidato</Label>
                        {/* Lo asigna la base al crear: nunca se edita a mano */}
                        <Input
                          id="pre_file_number"
                          readOnly
                          disabled
                          className="font-mono"
                          value={preEmployee.pre_file_number}
                        />
                      </div>
                    )}
                    <PersonalDataFields currentPicture={preEmployee?.picture} />
                  </div>
                </SectionCard>
                <SectionCard title="Contacto y dirección" description="Domicilio y medios de contacto.">
                  <ContactDataFields />
                </SectionCard>
                <SectionCard
                  title="Función propuesta"
                  description="Define qué documentos se piden. El resto de los datos laborales los completa gerencia al aprobar."
                >
                  <PreEmployeeWorkDataForm />
                </SectionCard>

                <div className="bg-background/90 sticky bottom-0 -mx-1 space-y-3 px-1 py-4 backdrop-blur-sm">
                  <SectionErrorsAlert sections={PRE_EMPLOYEE_FORM_SECTIONS} required={REQUIRED_PRE_EMPLOYEE_FIELDS} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
                      {isSaving && <Loader2 className="animate-spin motion-reduce:animate-none" />}
                      {isSaving ? 'Guardando…' : isNew ? 'Crear candidato' : 'Guardar cambios'}
                    </Button>
                  </div>
                </div>
              </>
            }
            aside={
              <>
                <FormCompletenessAside
                  title="Completitud del candidato"
                  sections={PRE_EMPLOYEE_FORM_SECTIONS}
                  required={REQUIRED_PRE_EMPLOYEE_FIELDS}
                />
                <SectionCard title="Qué sigue">
                  <ol className="text-muted-foreground list-decimal space-y-2 pl-5 text-sm">
                    <li>
                      Se crea con la etapa <b className="text-foreground">En proceso</b>.
                    </li>
                    <li>Se suben los documentos obligatorios.</li>
                    <li>
                      Se envía a <b className="text-foreground">Pre ingreso</b> y gerencia decide.
                    </li>
                  </ol>
                </SectionCard>
              </>
            }
          />
        </form>
      </Form>
    </div>
  );
}
