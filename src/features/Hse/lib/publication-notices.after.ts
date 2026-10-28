import 'server-only';

import { Logger } from '@/lib/logger';
import { after } from 'next/server';
import { sendHsePublicationNotices, type PublicationNoticeInput } from './publication-notices.server';

const logger = new Logger('features/Hse/publication-notices');

/**
 * Programa los avisos por mail para DESPUÉS de responder (`after`): el mail no demora ni puede romper la publicación,
 * que ya quedó confirmada. Cualquier error queda en el log. Solo se llama desde una acción (necesita el contexto del
 * request); los tests llaman a `sendHsePublicationNotices` directo.
 */
export function noticeAfterCommit(input: PublicationNoticeInput): void {
  try {
    after(async () => {
      try {
        await sendHsePublicationNotices(input);
      } catch (error) {
        logger.error('No se pudieron mandar los avisos de la publicación', { data: { error, kind: input.kind } });
      }
    });
  } catch (error) {
    logger.error('No se pudo programar el aviso de la publicación', { data: { error, kind: input.kind } });
  }
}
