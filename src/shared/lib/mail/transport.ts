import 'server-only';

import { Logger } from '@/lib/logger';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transporte SMTP de todo el sistema. Es `sendMail()` de P4 generalizado en P5.
 *
 * P4 lo dejó con un solo destinatario (`to: string`) y dos plantillas inline, y anotó que
 * `sendMail()` era «el único punto a redirigir». P5 cumple esa promesa: las plantillas se
 * fueron a `./templates/`, el layout compartido a `./shell.ts`, y acá queda sólo el
 * transporte — que ahora acepta varios destinatarios, `cc` y `bcc`, porque los correos de
 * los jobs van a la lista de `notification_settings` de cada empresa.
 *
 * **Sin `SMTP_HOST` no explota**: loguea y devuelve `false`. Esa propiedad de P4 se mantiene
 * a propósito, porque el contenedor de cron corre igual en entornos sin SMTP configurado y
 * un job no puede caerse por eso (el job lo registra como «no enviado» en `jobs_runs`).
 */
const logger = new Logger('shared/mail');

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  if (!cachedTransport) {
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    cachedTransport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  return cachedTransport;
}

/** Sólo para los tests: obliga a releer `SMTP_*` en la próxima llamada. */
export function resetMailTransport(): void {
  cachedTransport = null;
}

export function fromAddress(): string {
  const address = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || 'no-reply@localhost';
  const name = process.env.EMAIL_FROM_NAME?.trim();
  return name ? `${name} <${address}>` : address;
}

export interface MailMessage {
  /** Uno o varios destinatarios. Con varios, nodemailer arma el header `To:` separado por comas. */
  to: string | readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  /**
   * Al menos uno de `text`/`html` tiene que venir. Van como opcionales para poder OMITIR la
   * parte que no hay: mandar `''` produce un multipart con una parte vacía, que algunos
   * clientes muestran como un mensaje en blanco.
   */
  text?: string;
  html?: string;
  /** Archivos adjuntos (Compras etapa 2: el PDF del pedido de cotizacion o de la orden de compra). */
  attachments?: readonly MailAttachment[];
}

export interface MailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

/** Firma del emisor, para poder inyectar un doble en los tests de los jobs. */
export type SendMail = (message: MailMessage) => Promise<boolean>;

/**
 * Lista blanca de dominios de destino (`MAIL_ALLOWED_DOMAINS`, separados por comas).
 *
 * Sirve para instancias de demostración o prueba que tienen SMTP real pero datos sembrados con
 * direcciones ficticias: los correos a otros dominios se descartan (se loguean) en lugar de rebotar
 * contra el servidor SMTP y dañar su reputación. Vacía o ausente = sin restricción (producción).
 */
export function allowedMailDomains(): readonly string[] {
  return (process.env.MAIL_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
}

/** Deja solo las direcciones cuyo dominio está en la lista blanca (sin lista, deja todas). */
export function filterByAllowedDomains(
  addresses: readonly string[],
  allowed: readonly string[]
): { kept: string[]; dropped: string[] } {
  if (allowed.length === 0) return { kept: [...addresses], dropped: [] };
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const address of addresses) {
    const domain = address.trim().toLowerCase().split('@').pop() ?? '';
    (allowed.includes(domain) ? kept : dropped).push(address);
  }
  return { kept, dropped };
}

function toList(value: string | readonly string[] | undefined): string[] {
  if (!value) return [];
  return typeof value === 'string' ? [value] : [...value];
}

function joinAddresses(value: string | readonly string[] | undefined): string | undefined {
  if (!value) return undefined;
  const list = typeof value === 'string' ? [value] : value;
  const clean = list.map((address) => address.trim()).filter((address) => address.length > 0);
  return clean.length > 0 ? clean.join(', ') : undefined;
}

/**
 * Envía un mail. NO lanza: devuelve `false` si no se pudo enviar.
 *
 * Los llamadores tratan el fallo como no fatal a propósito — el usuario ya quedó creado, el
 * token ya quedó emitido, el indicador ya quedó guardado — y reventar acá sólo agregaría una
 * segunda falla. Quien necesite que el fallo se vea (los jobs) lo registra en `jobs_runs`.
 */
export const sendMail: SendMail = async (rawMessage) => {
  const allowed = allowedMailDomains();
  const message: MailMessage =
    allowed.length === 0
      ? rawMessage
      : {
          ...rawMessage,
          to: filterByAllowedDomains(toList(rawMessage.to), allowed).kept,
          cc: filterByAllowedDomains(toList(rawMessage.cc), allowed).kept,
          bcc: filterByAllowedDomains(toList(rawMessage.bcc), allowed).kept,
        };
  if (allowed.length > 0) {
    const dropped = filterByAllowedDomains(
      [...toList(rawMessage.to), ...toList(rawMessage.cc), ...toList(rawMessage.bcc)],
      allowed
    ).dropped;
    if (dropped.length > 0) {
      logger.info('Mail a dominios fuera de MAIL_ALLOWED_DOMAINS: se descartan esos destinatarios', {
        data: { dropped: dropped.length, subject: rawMessage.subject },
      });
    }
  }

  const to = joinAddresses(message.to);
  if (!to) {
    logger.warn('Mail sin destinatarios: no se envía', { data: { subject: message.subject } });
    return false;
  }

  const transport = getTransport();

  const text = message.text?.trim() ? message.text : undefined;
  const html = message.html?.trim() ? message.html : undefined;

  if (!text && !html) {
    logger.warn('Mail sin contenido: no se envía', { data: { to, subject: message.subject } });
    return false;
  }

  if (!transport) {
    logger.warn('SMTP sin configurar: el mail no se envía (desarrollo)', {
      data: { to, subject: message.subject, text: text ?? html },
    });
    return false;
  }

  try {
    await transport.sendMail({
      from: fromAddress(),
      to,
      cc: joinAddresses(message.cc),
      bcc: joinAddresses(message.bcc),
      subject: message.subject,
      text,
      html,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.content),
        contentType: attachment.contentType,
      })),
    });
    logger.info('Mail enviado', { data: { to, subject: message.subject } });
    return true;
  } catch (error) {
    logger.error('No se pudo enviar el mail', { data: { error, to, subject: message.subject } });
    return false;
  }
};
