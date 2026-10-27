import { runHseExpiredAttemptsJob } from '@/features/Jobs/jobs/hse-expired-attempts';
import { createJobHandler } from '@/features/Jobs/lib/handler';

/**
 * Cierre y corrección de los exámenes HSE vencidos sin enviar (cada hora).
 *
 * NO convertir a Server Action: es una excepción legítima a la regla "Server Actions, no API routes" (igual que el resto
 * de `/api/jobs/*`). Lo dispara el contenedor `cron` del compose por HTTP (`docker/cron/crontab`) y, en Dokploy, un
 * schedule de la Application. La lógica vive en `features/Jobs/jobs/hse-expired-attempts.ts`. No declarar `dynamic`.
 */
const handler = createJobHandler('hse-expired-attempts', () => runHseExpiredAttemptsJob());

export { handler as GET, handler as POST };
