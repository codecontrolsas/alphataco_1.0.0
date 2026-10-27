'use client';
import { Button } from '@/components/ui/button';
import { updateCompany } from '@/features/Empresa/General/actions/company.server';
import { COMPANIES_QUERY_KEY } from '@/features/Empresa/General/hooks/useCompanyData';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { parseCompanyForm } from '../lib/company-form';
import { showCompanyFieldErrors } from './company-field-errors';

interface EditCompanyButtonProps {
  /** Empresa que se edita (la página la resuelve por ruta; el servidor valida la pertenencia). */
  companyId: string;
}

function errorsSummary(count: number): string {
  return count === 1 ? 'Hay 1 campo para revisar.' : `Hay ${count} campos para revisar.`;
}

/**
 * Botón de guardado de la edición de empresa: valida el `FormData` de la página y lo manda a
 * `updateCompany`. El logo elegido viaja en el mismo `FormData` (`<input name="logo">` de
 * `CompanyLogoField`) y el servidor lo reemplaza junto con los datos.
 *
 * Ticket 806: si la validación falla se avisa con un toast y se lleva el foco al primer campo con
 * error. Antes el mensaje quedaba escrito arriba de todo y, al estar el botón abajo, "no pasaba nada".
 */
export default function EditCompanyButton({ companyId }: EditCompanyButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Bloquea el boton mientras la peticion esta en curso para evitar ediciones duplicadas
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clientAction = async (formData: FormData) => {
    if (isSubmitting) return;
    const parsed = parseCompanyForm(formData);
    const errorCount = showCompanyFieldErrors(formData, parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) {
      toast.error('No se guardaron los cambios', { description: errorsSummary(errorCount) });
      return;
    }

    setIsSubmitting(true);
    await toast
      .promise(
        async () => {
          const result = await updateCompany(companyId, formData);
          if (!result.ok) {
            if (result.fieldErrors) showCompanyFieldErrors(formData, result.fieldErrors);
            throw new Error(result.error);
          }
          // Reemplaza al canal realtime que refrescaba el listado de compañías al cambiar
          // la tabla `company` o el logo en storage.
          await queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY });
          // `revalidatePath` de la action ya invalida la caché del router: alcanza con navegar.
          router.push('/dashboard/configuration?tab=general&subtab=company');
        },
        {
          loading: 'Guardando los cambios…',
          success: 'Datos de la empresa actualizados',
          error: (error) => (error instanceof Error ? error.message : 'No se pudo actualizar la compañía'),
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <Button type="submit" formAction={clientAction} disabled={isSubmitting}>
      {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
      {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
    </Button>
  );
}
