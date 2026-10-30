'use client';

import { Button } from '@/components/ui/button';
import { markHseMaterialRead } from '@/features/Portal/actions/hse-trainings.server';
import { Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

/**
 * "Ya lo leí": registra la lectura en el servidor (la base valida que el material sea de una capacitación que le
 * aplica). Es una declaración explícita del empleado, no se marca sola al abrir el archivo.
 */
export function HseMaterialReadButton({
  materialId,
  trainingId,
  title,
}: {
  materialId: string;
  trainingId: string;
  title: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11"
      disabled={isPending}
      aria-label={`Marcar «${title}» como leído`}
      onClick={() =>
        startTransition(async () => {
          const result = await markHseMaterialRead({ materialId, trainingId });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success('Material marcado como leído');
          router.refresh();
        })
      }
    >
      {isPending ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Check aria-hidden="true" className="size-4" />
      )}
      Ya lo leí
    </Button>
  );
}
