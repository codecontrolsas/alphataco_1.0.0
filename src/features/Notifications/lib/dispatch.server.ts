import 'server-only';

import { getCompanyRecipients } from '@/features/Jobs/lib/recipients';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { sendMail as defaultSendMail, type SendMail } from '@/shared/lib/mail/transport';
import { prisma } from '@/shared/lib/prisma';
import { callFunction } from '@/shared/lib/sql';
import { z } from 'zod';
import { getNotificationEvent, type NotificationEventKey } from '../notification-catalog';

const logger = new Logger('features/Notifications/dispatch');

export interface NotifyInput {
  event: NotificationEventKey;
  companyId: string;
  /**
   * Evita repetir el aviso. Jobs: `${event}:${fecha AR}`; acciones: `${event}:${id}:${estado}`. Va
   * acotada por empresa en la base.
   */
  dedupeKey: string;
  title: string;
  body?: string;
  /** Ruta relativa (`/dashboard/...`) a la que lleva el aviso. */
  href?: string;
  /** Contenido del email; sin él, el aviso solo va a la campanita. Lo arman las plantillas existentes. */
  email?: { subject: string; html?: string; text?: string };
  /** Destinatarios puntuales (`credential_id`): obligatorio en los eventos `actor`. */
  userIds?: readonly string[];
  /** Quien disparó el aviso: no se lo avisa a sí mismo en los eventos de rol. */
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NotifyDeps {
  /** Los tests de los jobs inyectan un doble. */
  sendMail?: SendMail;
}

export type NotifyResult =
  | { status: 'no_recipients' }
  | { status: 'duplicate'; emailSent: boolean }
  | { status: 'sent'; inApp: number; emailRecipients: number; emailSent: boolean };

const recipientsSchema = z.array(
  z.object({
    user_id: z.string(),
    email: z.string().nullable(),
    in_app: z.boolean(),
    email_enabled: z.boolean(),
  })
);

const normalizeEmail = (value: string) => value.trim().toLowerCase();

async function resolveRecipients(input: NotifyInput) {
  const def = getNotificationEvent(input.event);
  const rows = await callFunction(
    'resolve_notification_recipients',
    [
      { uuid: input.companyId },
      input.event,
      { json: def.requires },
      input.userIds ? { uuidArray: input.userIds } : null,
    ],
    recipientsSchema
  );
  return def.audience === 'role' && input.actorId ? rows.filter((row) => row.user_id !== input.actorId) : rows;
}

/**
 * Manda el mail del evento y deja anotado el resultado. Antes lo reclama de forma atómica
 * (`pending`/`failed` → `sending`): si dos `notify` con la misma clave corren a la vez, manda uno solo.
 * Un `sending` que quedó colgado (proceso caído a mitad de envío) no se reintenta solo. Nunca lanza.
 */
async function deliverEmail(eventId: string, to: string[], email: NonNullable<NotifyInput['email']>, send: SendMail) {
  const claimed = await prisma.notification_events
    .updateMany({
      where: { id: eventId, email_status: { in: ['pending', 'failed'] } },
      data: { email_status: 'sending' },
    })
    .catch((error: unknown) => {
      logger.error('No se pudo reclamar el envío del mail', { data: { error, eventId } });
      return { count: 0 };
    });
  if (claimed.count === 0) return false;
  const sent = await send({ to, subject: email.subject, html: email.html, text: email.text });
  await prisma.notification_events
    .update({ where: { id: eventId }, data: { email_status: sent ? 'sent' : 'failed' } })
    .catch((error: unknown) => logger.error('No se pudo anotar el estado del mail', { data: { error, eventId } }));
  return sent;
}

/**
 * Registra un aviso y lo entrega: una fila por destinatario (campanita) y UN mail a la unión de los
 * usuarios con email activo y la lista fija de la empresa (si el evento la tiene). Idempotente por
 * `dedupeKey`: si el evento ya existía, solo reintenta el mail si había quedado pendiente o fallido.
 *
 * Puede lanzar (lo usan los jobs, que registran el error en `jobs_runs`). Desde una acción, `notifySafe`.
 */
export async function notify(input: NotifyInput, deps: NotifyDeps = {}): Promise<NotifyResult> {
  const def = getNotificationEvent(input.event);
  if (def.audience === 'actor' && (!input.userIds || input.userIds.length === 0)) {
    throw new Error(`El aviso ${input.event} necesita destinatarios puntuales`);
  }
  const send = deps.sendMail ?? defaultSendMail;

  const [users, legacy] = await Promise.all([
    resolveRecipients(input),
    def.legacyKind && input.email ? getCompanyRecipients(input.companyId, def.legacyKind) : Promise.resolve([]),
  ]);

  const emailUsers = input.email ? users.filter((user) => user.email_enabled && user.email) : [];
  const userEmails = new Set(emailUsers.map((user) => normalizeEmail(user.email ?? '')));
  const externalEmails = legacy.filter((address) => !userEmails.has(normalizeEmail(address)));
  const mailTo = [...emailUsers.map((user) => user.email ?? ''), ...externalEmails];
  const inAppUsers = users.filter((user) => user.in_app);

  if (inAppUsers.length === 0 && mailTo.length === 0) return { status: 'no_recipients' };

  const created = await prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO notification_events
        (company_id, event_key, title, body, href, dedupe_key, actor_id, metadata, external_emails, email_status)
      VALUES (
        ${input.companyId}::uuid, ${input.event}, ${input.title}, ${input.body ?? null}, ${input.href ?? null},
        ${input.dedupeKey}, ${input.actorId ?? null}::uuid,
        ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb, ${externalEmails}::text[],
        ${mailTo.length > 0 ? 'pending' : 'none'}
      )
      ON CONFLICT (company_id, dedupe_key) DO NOTHING
      RETURNING id
    `;
    const eventId = inserted[0]?.id;
    if (!eventId) return null;
    const deliveries = users.filter((user) => user.in_app || (input.email && user.email_enabled && user.email));
    if (deliveries.length > 0) {
      await tx.notification_deliveries.createMany({
        data: deliveries.map((user) => ({
          event_id: eventId,
          user_id: user.user_id,
          company_id: input.companyId,
          in_app: user.in_app,
          email: Boolean(input.email && user.email_enabled && user.email),
        })),
        skipDuplicates: true,
      });
    }
    return eventId;
  });

  if (!created) {
    // Ya avisado. Si el proceso anterior se cayó entre el registro y el mail, se reintenta solo el mail.
    const existing = await prisma.notification_events.findUnique({
      where: { company_id_dedupe_key: { company_id: input.companyId, dedupe_key: input.dedupeKey } },
      select: { id: true, email_status: true },
    });
    const retry = existing && input.email && mailTo.length > 0 && ['pending', 'failed'].includes(existing.email_status);
    const emailSent = retry ? await deliverEmail(existing.id, mailTo, input.email!, send) : false;
    return { status: 'duplicate', emailSent };
  }

  const emailSent = input.email && mailTo.length > 0 ? await deliverEmail(created, mailTo, input.email, send) : false;
  return { status: 'sent', inApp: inAppUsers.length, emailRecipients: mailTo.length, emailSent };
}

/** Para las acciones: el aviso nunca rompe la operación que ya quedó guardada. */
export async function notifySafe(input: NotifyInput): Promise<void> {
  try {
    await notify(input);
  } catch (error) {
    const known = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    logger.error('No se pudo registrar el aviso', { data: { error, code: known, event: input.event } });
  }
}
