'use client';

import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Logger } from '@/lib/logger';
import { FormCompletenessAside, SectionErrorsAlert } from '@/shared/components/common/FormCompleteness';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SplitLayout } from '@/shared/components/common/SplitLayout';
import { useRefreshAndWait } from '@/shared/hooks/useRefreshAndWait';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ContactDataFields } from '../../../shared/forms/ContactDataFields';
import { PersonalDataFields } from '../../../shared/forms/PersonalDataFields';
import type { EmployeeDetailData } from '../../actions.server';
import { createEmployee, updateEmployee } from '../../actions.server';
import { diffIds } from '../../lib/employee-deltas';
import { EMPLOYEE_FORM_SECTIONS, REQUIRED_EMPLOYEE_FIELDS, buildEmployeeDefaultValues } from '../../lib/employee-form';
import { employeeFormSchema, type EmployeeFormData } from '../../schemas/employee-schema';
import { EmployeeWorkDataForm } from '../forms/employee-work-data-form';
import { PendingRemovalsNotice } from './PendingRemovalsNotice';

const logger = new Logger('EmployeeFormView');

/** Resumen del guardado con los números reales que devolvió el servidor (`{added, removed}`). */
function describeSavedChanges(result: unknown): string {
  if (typeof result === 'object' && result !== null && 'removed' in result && 'added' in result) {
    const { added, removed } = result;
    if (typeof added === 'number' && typeof removed === 'number' && (added > 0 || removed > 0)) {
      return `Cambios guardados. Relaciones: ${added} ${added === 1 ? 'alta' : 'altas'}, ${removed} ${
        removed === 1 ? 'baja' : 'bajas'
      }.`;
    }
  }
  return 'Cambios guardados';
}

interface EmployeeFormViewProps {
  /** `null` en un alta. */
  employee: EmployeeDetailData | null;
  mode: 'edit' | 'new';
  /** Vuelve a la lectura (cancelar o terminar de guardar). */
  onClose: () => void;
}

/**
 * Alta y edición del legajo: las tres secciones apiladas con un único form de react-hook-form y,
 * a la derecha, la completitud. El estado del form vive acá, así sobrevive a todo el scroll.
 */
export function EmployeeFormView({ employee, mode, onClose }: EmployeeFormViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canView } = usePermissions();
  // Mismo criterio que la lectura: sin permiso sobre contacto, esa sección no se ofrece.
  const showContact = canView('empleados', 'datos-contacto');
  const { refreshAndWait, isRefreshing } = useRefreshAndWait();
  // Tras crear, la navegación a la ficha tarda: el botón sigue bloqueado para no crear el mismo legajo dos veces.
  const [isCreated, setIsCreated] = useState(false);

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: buildEmployeeDefaultValues(employee),
  });

  // Baseline de las relaciones M:M: lo que cargó la ficha desde las pivotes al abrir el formulario.
  // El delta se calcula contra esto (no contra el estado de la pantalla) y el servidor solo recibe
  // altas y bajas explícitas.
  const baseline = useMemo(() => {
    const defaults = buildEmployeeDefaultValues(employee);
    return {
      allocated_to: defaults.allocated_to ?? [],
      aptitudes: defaults.aptitudes ?? [],
      workshop_sector_ids: defaults.workshop_sector_ids ?? [],
    };
  }, [employee]);

  /** Las listas de empleados (activos y bajas) y sus filtros quedan viejos tras un alta o edición. */
  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ['employees-paginated'] });
    queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
  };

  const errorMessage = (fallback: string) => (error: unknown) =>
    error instanceof Error && error.message ? error.message : fallback;

  const onSubmit = async (data: EmployeeFormData) => {
    if (mode === 'new') {
      const creating = createEmployee(data).then((created) => {
        setIsCreated(true);
        invalidateLists();
        router.replace(`/dashboard/employee/action?action=view&employee_id=${created.id}`);
      });
      toast.promise(creating, {
        loading: 'Creando empleado...',
        success: 'Empleado creado',
        error: errorMessage('Hubo un error al crear el empleado'),
      });
      await creating.catch((error) => logger.error('Error al crear empleado', { data: { error } }));
      return;
    }

    if (employee) {
      // En la edición las relaciones M:M viajan como deltas, no como el conjunto final.
      const { allocated_to, aptitudes, workshop_sector_ids, ...rest } = data;
      const payload = {
        ...rest,
        allocation_changes: diffIds(baseline.allocated_to, allocated_to),
        aptitude_changes: diffIds(baseline.aptitudes, aptitudes),
        workshop_sector_changes: diffIds(baseline.workshop_sector_ids, workshop_sector_ids),
      };
      const saving = (async () => {
        const result = await updateEmployee(employee.id, payload);
        invalidateLists();
        await refreshAndWait();
        onClose();
        return result;
      })();
      toast.promise(saving, {
        loading: 'Guardando cambios...',
        success: (result) => describeSavedChanges(result),
        error: errorMessage('Hubo un error al guardar los cambios'),
      });
      await saving.catch((error) => logger.error('Error al actualizar empleado', { data: { error } }));
    }
  };

  const isSaving = form.formState.isSubmitting || isRefreshing || isCreated;
  const isNew = mode === 'new';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" onClick={onClose} className="-ml-2">
          <ArrowLeft />
          {isNew ? 'Empleados' : 'Volver al legajo'}
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isNew ? 'Nuevo empleado' : `Editar a ${employee?.firstname} ${employee?.lastname}`}
        </h1>
        <p className="text-muted-foreground">
          {isNew ? 'Completá lo obligatorio; el resto se puede cargar después.' : 'Los cambios se aplican al guardar.'}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <SplitLayout
            main={
              <>
                <SectionCard title="Datos personales" description="Tal como figuran en el DNI.">
                  <PersonalDataFields currentPicture={employee?.picture} />
                </SectionCard>
                {/* Sin permiso sobre contacto la sección se oculta pero los campos siguen montados: así el
                    formulario conserva sus valores y valida (el schema los exige) en vez de fallar sin
                    mostrar qué falta. */}
                <div hidden={!showContact}>
                  <SectionCard title="Contacto y dirección" description="Domicilio y medios de contacto.">
                    <ContactDataFields />
                  </SectionCard>
                </div>
                <SectionCard
                  title="Datos laborales"
                  description="El puesto depende del sector y las aptitudes dependen del puesto."
                >
                  <EmployeeWorkDataForm />
                </SectionCard>

                <div className="bg-background/90 sticky bottom-0 -mx-1 space-y-3 px-1 py-4 backdrop-blur-sm">
                  {!isNew && <PendingRemovalsNotice baseline={baseline} />}
                  <SectionErrorsAlert sections={EMPLOYEE_FORM_SECTIONS} required={REQUIRED_EMPLOYEE_FIELDS} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
                      {isSaving && <Loader2 className="animate-spin motion-reduce:animate-none" />}
                      {isSaving ? 'Guardando…' : isNew ? 'Crear empleado' : 'Guardar cambios'}
                    </Button>
                  </div>
                </div>
              </>
            }
            aside={
              <>
                <FormCompletenessAside
                  title="Completitud del legajo"
                  sections={EMPLOYEE_FORM_SECTIONS}
                  required={REQUIRED_EMPLOYEE_FIELDS}
                />
                <SectionCard title="Qué pasa al guardar">
                  <p className="text-muted-foreground text-sm text-pretty">
                    {isNew
                      ? 'Se crea el legajo y después podés cargar su documentación desde la ficha.'
                      : 'Los cambios se aplican al legajo. La documentación ya cargada se conserva.'}
                  </p>
                </SectionCard>
              </>
            }
          />
        </form>
      </Form>
    </div>
  );
}
