import 'server-only';

import { isModuleEnabledForCompany } from '@/features/Modules/server/modules.server';
import { Logger } from '@/lib/logger';
import { renderHseDocumentPublishedEmail, renderHseTrainingPublishedEmail } from '@/shared/lib/mail/templates/hse';
import { sendMail as defaultSendMail, type SendMail } from '@/shared/lib/mail/transport';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { getEmployeeContacts } from './employee-contacts.server';

/**
 * Aviso por mail al EMPLEADO cuando HSE le asigna algo: un documento (o una versión nueva) para aceptar o una
 * capacitación para rendir. Lo dispara la acción de publicar, en segundo plano y DESPUÉS de confirmar la transacción:
 * un mail que falla nunca deshace ni demora la publicación.
 *
 * Quién recibe (y por qué):
 * - los empleados ACTIVOS que quedaron pendientes con esta publicación (la misma consulta que arma el cumplimiento);
 * - solo si el módulo `portal` y el `hse` están encendidos para la empresa (sin portal no hay dónde aceptar);
 * - solo con el acceso al portal HABILITADO por RR.HH. (es la preferencia que existe para el empleado: sin acceso no
 *   hay a dónde llevarlo) y con un correo válido;
 * - los dominios fuera de `MAIL_ALLOWED_DOMAINS` los descarta `sendMail` (demos con SMTP real y datos ficticios).
 * Un mail por persona (nunca una lista en `Para:`: se verían entre sí las direcciones).
 *
 * Corre con `prismaSystem` y la empresa explícita (la de la sesión de quien publicó, nunca del pedido): quien publica
 * puede no tener permiso sobre los legajos ni sobre el acceso al portal. Es de mejor esfuerzo y sin reintento: la
 * publicación ocurre una sola vez, y lo pendiente sigue a la vista en el portal y en el resumen semanal a HSE.
 */

const logger = new Logger('features/Hse/publication-notices');

export type PublicationNoticeInput =
  | { kind: 'document'; companyId: string; documentId: string; versionId: string }
  | { kind: 'training'; companyId: string; trainingId: string };

export interface PublicationNoticeResult {
  skipped: string | null;
  recipients: number;
  sent: number;
  failed: number;
  withoutEmail: number;
}

const EMPTY: PublicationNoticeResult = { skipped: null, recipients: 0, sent: 0, failed: 0, withoutEmail: 0 };

/** Manda de a poco, en orden: un SMTP de demo no admite ráfagas y no hace falta apurarse. */
async function deliver(
  recipients: { employeeId: string; to: string; render: () => { subject: string; text: string; html: string } }[],
  send: SendMail
) {
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const email = recipient.render();
    const ok = await send({ to: [recipient.to], subject: email.subject, text: email.text, html: email.html }).catch(
      () => false
    );
    if (ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

export async function sendHsePublicationNotices(
  input: PublicationNoticeInput,
  deps: { sendMail?: SendMail } = {}
): Promise<PublicationNoticeResult> {
  const { companyId } = input;
  if (!(await isModuleEnabledForCompany('hse', companyId)) || !(await isModuleEnabledForCompany('portal', companyId)))
    return { ...EMPTY, skipped: 'HSE o el portal están apagados para la empresa' };
  const send = deps.sendMail ?? defaultSendMail;
  const company = await prismaSystem.company.findUnique({ where: { id: companyId }, select: { company_name: true } });
  if (!company) return { ...EMPTY, skipped: 'La empresa no existe' };

  if (input.kind === 'document') {
    const version = await prismaSystem.hse_document_versions.findFirst({
      where: { id: input.versionId, document_id: input.documentId, company_id: companyId },
      select: { version: true, expires_at: true, document: { select: { title: true, status: true } } },
    });
    if (!version || version.document.status !== 'published')
      return { ...EMPTY, skipped: 'El documento no está publicado' };
    const pending = await prismaSystem.hse_document_acknowledgements.findMany({
      where: {
        company_id: companyId,
        version_id: input.versionId,
        status: 'pending',
        archived_at: null,
        employee: { is_active: true },
      },
      select: { employee_id: true },
    });
    const ids = [...new Set(pending.map((p) => p.employee_id))];
    const contacts = await getEmployeeContacts(companyId, ids, { requirePortalAccess: true });
    const recipients = ids.flatMap((employeeId) => {
      const contact = contacts.get(employeeId);
      return contact?.email
        ? [
            {
              employeeId,
              to: contact.email,
              render: () =>
                renderHseDocumentPublishedEmail({
                  name: contact.name,
                  companyName: company.company_name,
                  title: version.document.title,
                  version: version.version,
                  isNewVersion: version.version > 1,
                  expiresAt: version.expires_at ? version.expires_at.toISOString().slice(0, 10) : null,
                }),
            },
          ]
        : [];
    });
    const result = await deliver(recipients, send);
    const summary = {
      skipped: null,
      recipients: recipients.length,
      ...result,
      withoutEmail: ids.length - recipients.length,
    };
    logger.info('Avisos de documento HSE publicado', { data: { companyId, documentId: input.documentId, ...summary } });
    return summary;
  }

  const training = await prismaSystem.hse_trainings.findFirst({
    where: { id: input.trainingId, company_id: companyId },
    select: { title: true, status: true, time_limit_minutes: true },
  });
  if (!training || training.status !== 'published') return { ...EMPTY, skipped: 'La capacitación no está publicada' };
  const assigned = await prismaSystem.hse_training_assignments.findMany({
    where: {
      company_id: companyId,
      training_id: input.trainingId,
      status: 'pending',
      archived_at: null,
      employee: { is_active: true },
    },
    select: { employee_id: true },
  });
  const ids = [...new Set(assigned.map((a) => a.employee_id))];
  const contacts = await getEmployeeContacts(companyId, ids, { requirePortalAccess: true });
  const recipients = ids.flatMap((employeeId) => {
    const contact = contacts.get(employeeId);
    return contact?.email
      ? [
          {
            employeeId,
            to: contact.email,
            render: () =>
              renderHseTrainingPublishedEmail({
                name: contact.name,
                companyName: company.company_name,
                title: training.title,
                timeLimitMinutes: training.time_limit_minutes,
                trainingId: input.trainingId,
              }),
          },
        ]
      : [];
  });
  const result = await deliver(recipients, send);
  const summary = {
    skipped: null,
    recipients: recipients.length,
    ...result,
    withoutEmail: ids.length - recipients.length,
  };
  logger.info('Avisos de capacitación HSE publicada', {
    data: { companyId, trainingId: input.trainingId, ...summary },
  });
  return summary;
}
