import { getInstanceControls } from '@/shared/lib/instance-controls';
import { bannerDismissToken } from '@/shared/lib/instance-controls-core';
import { InstanceBanner } from './InstanceBanner';

/**
 * Banner del dashboard: franja arriba de todas las vistas del dashboard (encima del header). Dato por request: se
 * monta dentro de un `Suspense` (con `cacheComponents` no puede bloquear el shell). Apagado, no renderiza nada.
 */
export async function DashboardInstanceBanner() {
  const { banners } = await getInstanceControls();
  const banner = banners.dashboard;
  if (!banner.enabled) return null;
  return (
    <InstanceBanner
      slot="dashboard"
      layout="bar"
      message={banner.message}
      severity={banner.severity}
      token={bannerDismissToken(banner)}
    />
  );
}
