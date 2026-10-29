import { Skeleton } from '@/components/ui/skeleton';
import { BrandMark } from '@/shared/components/brand/BrandMark';
import { BRAND_NAME } from '@/shared/lib/branding';
import { getInstanceControls } from '@/shared/lib/instance-controls';
import { DEFAULT_PAUSE_MESSAGE, pauseMessageOf } from '@/shared/lib/instance-controls-core';
import { PauseCircle } from 'lucide-react';
import { Suspense } from 'react';
import { RetryButton } from './RetryButton';

/**
 * Pantalla «Sistema en pausa temporal». El proxy reescribe acá toda página mientras la instancia está en
 * pausa; la URL del navegador no cambia, así que «Reintentar» recarga la misma página. El mensaje sale de la base
 * (nunca de la URL), dentro de un `Suspense`: el resto de la pantalla es estático.
 */
export function PausedScreen() {
  return (
    <div className="bg-background flex min-h-dvh flex-col px-4 py-6 sm:px-12 sm:py-8">
      <header>
        <span className="inline-flex items-center gap-2.5 text-xl font-bold lowercase">
          <BrandMark size={30} />
          {BRAND_NAME}
        </span>
      </header>

      <section aria-labelledby="paused-title" className="flex flex-1 items-center justify-center py-12">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <span className="bg-warn-subtle text-warn-subtle-foreground mb-6 flex size-14 items-center justify-center rounded-full">
            <PauseCircle className="size-7" aria-hidden="true" />
          </span>
          <h1
            id="paused-title"
            className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl"
          >
            Sistema en pausa temporal
          </h1>
          <Suspense fallback={<PausedMessageSkeleton />}>
            <PausedMessage />
          </Suspense>
          <p className="text-muted-foreground mt-6 text-sm">
            Tus datos están a salvo. Volvé a intentar en unos minutos.
          </p>
          <RetryButton className="mt-6" />
        </div>
      </section>

      <footer className="text-muted-foreground border-t pt-5 text-sm">© {BRAND_NAME}</footer>
    </div>
  );
}

async function PausedMessage() {
  const { pause } = await getInstanceControls();
  // Abierta a mano sin pausa activa (o justo al reanudar): mensaje genérico; «Reintentar» lleva de vuelta.
  const message = pause.active ? pauseMessageOf(pause) : DEFAULT_PAUSE_MESSAGE;
  return (
    <p
      role="status"
      className="text-foreground/80 mt-3 text-base leading-relaxed break-words whitespace-pre-line text-pretty"
    >
      {message}
    </p>
  );
}

function PausedMessageSkeleton() {
  return (
    <div className="mt-3 flex w-full flex-col items-center gap-2" aria-hidden="true">
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}
