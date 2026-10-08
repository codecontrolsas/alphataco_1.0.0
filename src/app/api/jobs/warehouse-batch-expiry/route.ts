import { runWarehouseBatchExpiryJob } from '@/features/Jobs/jobs/warehouse-batch-expiry';
import { createJobHandler } from '@/features/Jobs/lib/handler';

/**
 * Lotes vencidos y por vencer de Almacenes, un correo por empresa. Mismas razones que
 * `/api/jobs/documents-expiry` para ser una route y no una Server Action: lo dispara el
 * contenedor `cron` con `curl` (`docker/cron/crontab`, lunes 08:05 AR). `GET` para el cron,
 * `POST` para dispararlo a mano. La logica vive en `runWarehouseBatchExpiryJob`.
 */
const handler = createJobHandler('warehouse-batch-expiry', () => runWarehouseBatchExpiryJob());

export { handler as GET, handler as POST };
