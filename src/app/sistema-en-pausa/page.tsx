import { PausedScreen } from '@/features/InstanceControls/components/PausedScreen';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sistema en pausa', robots: { index: false, follow: false } };

/** Destino de la reescritura del proxy mientras la instancia está en pausa (ver `instance-pause-paths.ts`). */
export default function PausedPage() {
  return <PausedScreen />;
}
