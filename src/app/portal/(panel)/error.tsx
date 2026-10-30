'use client';

import { PortalPageError } from '@/features/Portal/components/states/PortalPageError';

/** Error inesperado al cargar una pantalla del panel: se ofrece reintentar sin perder el menú. */
export default function PortalPanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PortalPageError error={error} reset={reset} />;
}
