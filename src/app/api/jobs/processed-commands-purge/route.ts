import { runProcessedCommandsPurgeJob } from '@/features/Jobs/jobs/processed-commands-purge';
import { createJobHandler } from '@/features/Jobs/lib/handler';

/**
 * Purga de comandos procesados con más de 30 días. Lo dispara el contenedor `cron` con `curl`
 * (`docker/cron/crontab`, todos los días 03:15 AR). `GET` para el cron, `POST` para dispararlo a mano.
 */
const handler = createJobHandler('processed-commands-purge', () => runProcessedCommandsPurgeJob());

export { handler as GET, handler as POST };
