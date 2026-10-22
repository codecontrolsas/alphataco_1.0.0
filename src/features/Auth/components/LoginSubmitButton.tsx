import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/** Botón de envío de los formularios de ingreso: se deshabilita y avisa mientras se autentica. */
export function LoginSubmitButton({ isPending, testId }: { isPending: boolean; testId?: string }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={isPending} aria-busy={isPending} data-testid={testId}>
      {isPending ? (
        <>
          <Loader2 className="animate-spin motion-reduce:animate-none" />
          Ingresando…
        </>
      ) : (
        'Ingresar'
      )}
    </Button>
  );
}
