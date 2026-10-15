import { runDocumentsStatusJob } from '@/features/Jobs/jobs/documents-status';
import { createJobHandler } from '@/features/Jobs/lib/handler';

/**
 * Recalculo diario del cache de status documental (`employees.status` / `vehicles.status`).
 *
 * NO convertir a Server Action: es una excepción legítima a la regla "Server Actions, no API
 * routes" (igual que el resto de `/api/jobs/*`). Lo dispara el contenedor `cron` del compose por
 * HTTP (`docker/cron/crontab`, todos los días 00:10 AR) y una Server Action no es invocable con
 * `curl` desde otro contenedor.
 *
 * `GET` porque el crontab llama con `curl` sin body; también expuesto como `POST` para disparos
 * manuales. La lógica vive en `features/Jobs/jobs/documents-status.ts`. No declarar `dynamic`
 * (con `cacheComponents` activado es error de compilación).
 */
const handler = createJobHandler('documents-status', () => runDocumentsStatusJob());

export { handler as GET, handler as POST };
