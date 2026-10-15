import { Suspense } from 'react';
import { CertificationsAttention } from '../components/CertificationsAttention';
import type { getCertificationAttention } from './actions.server';

async function Attention({
  attention,
  serverStatus,
}: {
  attention: ReturnType<typeof getCertificationAttention>;
  serverStatus: string | null;
}) {
  return <CertificationsAttention initialData={await attention} serverStatus={serverStatus} />;
}

/**
 * Server Component: resuelve la banda en su propio Suspense sin frenar la tabla. La promesa se inicia en la
 * lista ANTES de esperar la tabla; `getCertificationAttention` nunca rechaza (devuelve `null` si falla).
 */
export function CertificationsAttentionSection({
  attention,
  serverStatus = null,
}: {
  attention: ReturnType<typeof getCertificationAttention>;
  serverStatus?: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <Attention attention={attention} serverStatus={serverStatus} />
    </Suspense>
  );
}
