import { runHseExpiryJob } from '@/features/Jobs/jobs/hse-expiry';
import { createJobHandler } from '@/features/Jobs/lib/handler';

/**
 * Avisos de vencimiento HSE (diario 07:20): al empleado (portal + mail) y, los lunes, el resumen a HSE.
 *
 * NO convertir a Server Action: es una excepción legítima a la regla "Server Actions, no API routes" (igual que el resto
 * de `/api/jobs/*`). Lo dispara el contenedor `cron` del compose por HTTP (`docker/cron/crontab`) y, en Dokploy, un
 * schedule de la Application. La lógica vive en `features/Jobs/jobs/hse-expiry.ts`. No declarar `dynamic`.
 */
const handler = createJobHandler('hse-expiry', () => runHseExpiryJob());

export { handler as GET, handler as POST };
