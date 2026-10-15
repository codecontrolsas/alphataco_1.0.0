import { Skeleton } from '@/components/ui/skeleton';
import ContactComponent from '@/features/Empresa/Contactos/components/ContactComponent';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { cn } from '@/lib/utils';
import BackButton from '@/shared/components/common/BackButton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Suspense } from 'react';

/** `?id=` (contacto a ver/editar) y `?action=` (`new` | `edit` | `view`) de la ruta de contactos. */
export interface ContactSectionSearchParams {
  id?: string;
  action?: string;
}

interface ContactSectionProps {
  searchParams: Promise<ContactSectionSearchParams>;
  /** Volver a la izquierda (vista de listado) o a la derecha (vista de acción). */
  backButtonAlign?: 'start' | 'end';
  /** Alto del skeleton mientras carga el formulario. */
  skeletonClassName?: string;
}

/**
 * Sección de contacto de la empresa activa: encabezado con el botón Volver y el formulario.
 * La empresa la resuelve el servidor dentro de las actions de `ContactComponent`; acá sólo se
 * resuelven los search params de la ruta (en Next 16 son una Promise y hay que esperarlos, antes
 * se leían en forma síncrona y `id` llegaba siempre `undefined`).
 */
export default async function ContactSection({
  searchParams,
  backButtonAlign = 'start',
  skeletonClassName = 'h-[400px]',
}: ContactSectionProps) {
  const [{ id, action }, canView] = await Promise.all([
    searchParams,
    checkPermissionServer('comercial', 'customers', 'view'),
  ]);

  // Las lecturas del formulario exigen este permiso: sin él se muestra la falta de permiso, no un
  // "contacto no encontrado" ni un selector de clientes vacío.
  if (!canView) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver los contactos de clientes"
        description="Pedile acceso a un administrador."
      />
    );
  }

  return (
    <section className="grid grid-cols-2 xl:grid-cols-2 gap-2 py-4 justify-start">
      <div className={cn('flex gap-2', backButtonAlign === 'end' && 'col-start-2 justify-end')}>
        <BackButton />
      </div>

      <div className={cn('col-span-6 flex flex-col justify-between overflow-hidden', action === 'new' && 'col-span-8')}>
        <Suspense fallback={<Skeleton className={cn('w-full rounded-md', skeletonClassName)} />}>
          <ContactComponent id={id ?? ''} />
        </Suspense>
      </div>
    </section>
  );
}
