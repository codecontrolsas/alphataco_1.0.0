import 'server-only';

import type { EmailInfo } from '@/features/Auth/utils/emailTemplates';
import { renderDocumentEmailTemplate, renderHelpEmailTemplate } from '@/features/Auth/utils/emailTemplates';
import { sendMail } from '@/shared/lib/mail/transport';

/**
 * Envío de correo por el SMTP de la empresa.
 *
 * **No es una Server Action**: el módulo es `server-only` a propósito. Antes vivía en
 * `actions/sendEmail.ts` con `'use server'` y exportada, o sea que era un endpoint público que
 * aceptaba `to` y `html` arbitrarios: cualquiera podía invocarla desde el navegador y mandar el
 * HTML que quisiera a cualquier destinatario desde nuestro SMTP. Es el mismo agujero que se cerró
 * en `POST /api/send`, pero por la puerta de la Server Action.
 *
 * Los llamadores son server-side y fijan el destinatario: `sendHelpRequestEmail`
 * (`features/Ayuda`) y `sendErrorReport` (`lib/utils`).
 *
 * **P5**: tenía su propio `nodemailer.createTransport` — un segundo transporte SMTP con su
 * propia configuración (puerto 465 por default, `rejectUnauthorized: false`) y su propio
 * `from` hardcodeado. Ahora delega en `sendMail` de `shared/lib/mail`, que es el único punto
 * de salida de correo del sistema. Efecto colateral deseado: sin `SMTP_HOST` ya no intenta
 * conectarse a localhost y esperar el timeout — loguea y devuelve `false`.
 */

export type EmailOptions = {
  /** Destinatario. Lo fija SIEMPRE el código del servidor, nunca un valor que venga del cliente. */
  to: string;
  subject: string;
  userEmail: string;
  template?: 'document' | 'help';
  body?: EmailInfo;
  html?: string;
  text?: string;
  reason?: string;
};

export type SendEmailResult = { success: true } | { success: false; error: string };

export async function sendEmail(options: EmailOptions): Promise<SendEmailResult> {
  const { to, subject, userEmail, template, body, html, text, reason } = options;

  let emailHtml = html;

  // Si se especifica un template, usarlo
  if (template && !html) {
    if (template === 'document' && body) {
      emailHtml = renderDocumentEmailTemplate(userEmail, body);
    } else if (template === 'help') {
      emailHtml = renderHelpEmailTemplate({ userEmail, reason, body });
    }
  }

  // Si no hay HTML ni texto, no podemos enviar el correo
  if (!emailHtml && !text) {
    return { success: false, error: 'Se requiere contenido HTML o texto para enviar el correo' };
  }

  // `to` puede venir como lista separada por comas (sendErrorReport manda a dos casillas).
  const recipients = to
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0);

  // `undefined`, no `''`: el emisor omite la parte que no hay (el código viejo hacía lo
  // mismo). Con `''` el mensaje sale con una parte vacía.
  const sent = await sendMail({ to: recipients, subject, html: emailHtml, text });

  return sent ? { success: true } : { success: false, error: 'No se pudo enviar el correo (ver el log de shared/mail)' };
}
