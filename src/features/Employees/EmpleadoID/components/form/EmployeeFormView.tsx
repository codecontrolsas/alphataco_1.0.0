'use client';

import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Logger } from '@/lib/logger';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SplitLayout } from '@/shared/components/common/SplitLayout';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ContactDataFields } from '../../../shared/forms/ContactDataFields';
import { PersonalDataFields } from '../../../shared/forms/PersonalDataFields';
import type { EmployeeDetailData } from '../../actions.server';
import { createEmployee, updateEmployee } from '../../actions.server';
import { buildEmployeeDefaultValues } from '../../lib/employee-form';
import { employeeFormSchema, type EmployeeFormData } from '../../schemas/employee-schema';
import { EmployeeWorkDataForm } from '../forms/employee-work-data-form';
import { EmployeeFormAside, SectionErrorsAlert } from './EmployeeFormAside';

const logger = new Logger('EmployeeFormView');

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
  const { canView } = usePermissions();
  // Mismo criterio que la lectura: sin permiso sobre contacto, esa sección no se ofrece.
  const showContact = canView('empleados', 'datos-contacto');
  const [isRefreshing, startRefreshTransition] = useTransition();
  const refreshResolveRef = useRef<(() => void) | null>(null);

  // Resuelve la promesa pendiente cuando termina la transición de `router.refresh()`: el toast
  // queda abierto hasta que el servidor volvió a renderizar el legajo con los datos nuevos.
  useEffect(() => {
    if (!isRefreshing && refreshResolveRef.current) {
      refreshResolveRef.current();
      refreshResolveRef.current = null;
    }
  }, [isRefreshing]);

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: buildEmployeeDefaultValues(employee),
  });

  const onSubmit = async (data: EmployeeFormData) => {
    if (mode === 'new') {
      const creating = createEmployee(data).then((created) => {
        router.replace(`/dashboard/employee/action?action=view&employee_id=${created.id}`);
      });
      toast.promise(creating, {
        loading: 'Creando empleado...',
        success: 'Empleado creado',
        error: 'Hubo un error al crear el empleado',
      });
      await creating.catch((error) => logger.error('Error al crear empleado', { data: { error } }));
      return;
    }

    if (employee) {
      const saving = (async () => {
        await updateEmployee(employee.id, data);
        await new Promise<void>((resolve) => {
          refreshResolveRef.current = resolve;
          startRefreshTransition(() => router.refresh());
        });
        onClose();
      })();
      toast.promise(saving, {
        loading: 'Guardando cambios...',
        success: 'Cambios guardados',
        error: 'Hubo un error al guardar los cambios',
      });
      await saving.catch((error) => logger.error('Error al actualizar empleado', { data: { error } }));
    }
  };

  const isSaving = form.formState.isSubmitting || isRefreshing;
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
                  <PersonalDataFields />
                </SectionCard>
                {showContact && (
                  <SectionCard title="Contacto y dirección" description="Domicilio y medios de contacto.">
                    <ContactDataFields />
                  </SectionCard>
                )}
                <SectionCard
                  title="Datos laborales"
                  description="El puesto depende del sector y las aptitudes dependen del puesto."
                >
                  <EmployeeWorkDataForm />
                </SectionCard>

                <div className="bg-background/90 sticky bottom-0 -mx-1 space-y-3 px-1 py-4 backdrop-blur-sm">
                  <SectionErrorsAlert />
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
            aside={<EmployeeFormAside isNew={isNew} />}
          />
        </form>
      </Form>
    </div>
  );
}
