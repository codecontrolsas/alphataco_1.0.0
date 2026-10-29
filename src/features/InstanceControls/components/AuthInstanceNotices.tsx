import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getInstanceControls } from '@/shared/lib/instance-controls';
import { bannerDismissToken, pauseMessageOf } from '@/shared/lib/instance-controls-core';
import { PauseCircle } from 'lucide-react';
import { InstanceBanner } from './InstanceBanner';

/**
 * Avisos de la instancia en las pantallas previas a la sesión (`AuthShell`: login, recuperación, accesos de operario,
 * portal e indumentaria): la pausa del sistema, si está activa, y el banner del login. Dato por request, dentro de un
 * `Suspense`; sin nada activo no ocupa lugar.
 */
export async function AuthInstanceNotices() {
  const { pause, banners } = await getInstanceControls();
  const banner = banners.login;
  if (!pause.active && !banner.enabled) return null;

  return (
    <div className="mb-8 flex flex-col gap-3">
      {pause.active && (
        <Alert variant="warning">
          <PauseCircle aria-hidden="true" />
          <AlertTitle>Sistema en pausa temporal</AlertTitle>
          <AlertDescription className="break-words whitespace-pre-line">{pauseMessageOf(pause)}</AlertDescription>
        </Alert>
      )}
      {banner.enabled && (
        <InstanceBanner
          slot="login"
          layout="card"
          message={banner.message}
          severity={banner.severity}
          token={bannerDismissToken(banner)}
        />
      )}
    </div>
  );
}
