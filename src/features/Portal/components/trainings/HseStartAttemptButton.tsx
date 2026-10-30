'use client';

import { Button } from '@/components/ui/button';
import { startHseAttempt } from '@/features/Portal/actions/hse-trainings.server';
import { Loader2, PlayCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../ui/ConfirmDialog';

/**
 * Empezar (o retomar) el examen. Empezar pide confirmación porque consume un intento y, si hay límite, arranca el reloj
 * del servidor. Retomar va directo.
 */
export function HseStartAttemptButton({
  trainingId,
  resume,
  attemptsLeft,
  timeLimitMinutes,
  questions,
}: {
  trainingId: string;
  resume: boolean;
  attemptsLeft: number;
  timeLimitMinutes: number | null;
  questions: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Si puede empezar, la acción redirige al examen desde el servidor (sin `router.push`: ver `startHseAttempt`). Solo
  // vuelve con un resultado cuando no se pudo.
  const start = () =>
    startTransition(async () => {
      const result = await startHseAttempt({ trainingId });
      if (result && !result.ok) {
        toast.error(result.error);
        setConfirming(false);
        router.refresh();
      }
    });

  if (resume) {
    return (
      <Button type="button" size="lg" className="min-h-12 w-full sm:w-auto" disabled={isPending} onClick={start}>
        {isPending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <PlayCircle aria-hidden="true" className="size-4" />
        )}
        Retomar el examen
      </Button>
    );
  }

  return (
    <>
      <Button type="button" size="lg" className="min-h-12 w-full sm:w-auto" onClick={() => setConfirming(true)}>
        <PlayCircle aria-hidden="true" className="size-4" /> Rendir el examen
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="¿Empezar el examen?"
        description={
          <>
            Son {questions} pregunta{questions === 1 ? '' : 's'}. Usás 1 de tus {attemptsLeft} intento
            {attemptsLeft === 1 ? '' : 's'}.{' '}
            {timeLimitMinutes
              ? `Tenés ${timeLimitMinutes} minutos desde que empezás: el tiempo corre aunque cierres la página.`
              : 'No tiene límite de tiempo.'}{' '}
            Tus respuestas se guardan a medida que las elegís.
          </>
        }
        cancelLabel="Todavía no"
        confirmLabel="Empezar"
        pendingLabel="Empezando…"
        pending={isPending}
        onConfirm={start}
      />
    </>
  );
}
