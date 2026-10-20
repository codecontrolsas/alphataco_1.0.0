import 'server-only';

import { appUrl, renderActionEmail } from '../shell';
import { sendMail } from '../transport';

/** Contenido de un aviso por mail; lo entrega `notify` (features/Notifications) a quien corresponda. */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Aviso al solicitante de que su solicitud de compra se aprobó o se rechazó (Compras etapa 1). */
export function renderPurchaseRequestDecisionEmail(params: {
  name: string | null;
  number: string;
  approved: boolean;
  notes: string | null;
  requestId: string;
}): RenderedEmail {
  const url = `${appUrl()}/dashboard/purchases/requests/${params.requestId}`;
  const verdict = params.approved ? 'aprobada' : 'rechazada';
  const greeting = params.name ? `Hola ${params.name}` : 'Hola';
  const reason = params.notes ? ` ${params.approved ? 'Comentario' : 'Motivo'}: ${params.notes}` : '';
  return {
    subject: `Solicitud de compra ${params.number} ${verdict}`,
    text: `${greeting}, tu solicitud de compra ${params.number} fue ${verdict}.${reason} Detalle: ${url}`,
    // `renderActionEmail` escapa titulo y cuerpo: van en texto plano.
    html: renderActionEmail(
      `Solicitud ${params.number} ${verdict}`,
      `${greeting}, tu solicitud de compra ${params.number} fue ${verdict}.${reason}`,
      { url, label: 'Ver la solicitud' }
    ),
  };
}

/** Aviso a quien creó la orden de compra de que se aprobó o se rechazó (Compras etapa 2). */
export function renderPurchaseOrderDecisionEmail(params: {
  name: string | null;
  number: string;
  approved: boolean;
  notes: string | null;
  orderId: string;
}): RenderedEmail {
  const url = `${appUrl()}/dashboard/purchases/orders/${params.orderId}`;
  const verdict = params.approved ? 'aprobada' : 'rechazada';
  const greeting = params.name ? `Hola ${params.name}` : 'Hola';
  const reason = params.notes ? ` Motivo: ${params.notes}` : '';
  const next = params.approved ? ' Ya se puede enviar al proveedor.' : ' Volvió a borrador para corregirla.';
  return {
    subject: `Orden de compra ${params.number} ${verdict}`,
    text: `${greeting}, la orden de compra ${params.number} fue ${verdict}.${reason}${next} Detalle: ${url}`,
    html: renderActionEmail(
      `Orden de compra ${params.number} ${verdict}`,
      `${greeting}, la orden de compra ${params.number} fue ${verdict}.${reason}${next}`,
      { url, label: 'Ver la orden de compra' }
    ),
  };
}

/** Aviso a quienes pueden aprobar: hay una solicitud o una orden de compra esperando (#786). */
export function renderPurchaseApprovalPendingEmail(params: {
  kind: 'request' | 'order';
  number: string;
  submittedBy: string | null;
  id: string;
}): RenderedEmail {
  const isRequest = params.kind === 'request';
  const url = `${appUrl()}/dashboard/purchases/${isRequest ? 'requests' : 'orders'}/${params.id}`;
  const what = isRequest ? `La solicitud de compra ${params.number}` : `La orden de compra ${params.number}`;
  const who = params.submittedBy ? ` (enviada por ${params.submittedBy})` : '';
  const body = `${what}${who} está esperando aprobación.`;
  return {
    subject: `${isRequest ? 'Solicitud' : 'Orden de compra'} ${params.number} para aprobar`,
    text: `${body} Detalle: ${url}`,
    html: renderActionEmail(`${isRequest ? 'Solicitud' : 'Orden de compra'} ${params.number} para aprobar`, body, {
      url,
      label: isRequest ? 'Ver la solicitud' : 'Ver la orden de compra',
    }),
  };
}

/**
 * Mail al proveedor con el pedido de cotizacion o la orden de compra en PDF (Compras etapa 2).
 * A diferencia de los avisos internos, aca el envio ES la accion: quien lo llama solo marca el
 * documento como enviado si esto devuelve `true`.
 */
export async function sendSupplierDocumentEmail(params: {
  kind: 'quote' | 'order' | 'payment';
  to: readonly string[];
  number: string;
  companyName: string;
  supplierName: string;
  message: string | null;
  attachment: { filename: string; content: Uint8Array };
}): Promise<boolean> {
  const label =
    params.kind === 'quote' ? 'Pedido de cotización' : params.kind === 'order' ? 'Orden de compra' : 'Orden de pago';
  const intro =
    params.kind === 'quote'
      ? `${params.companyName} le solicita cotización por los ítems del pedido ${params.number}, que va adjunto en PDF.`
      : params.kind === 'order'
        ? `${params.companyName} le envía la orden de compra ${params.number}, adjunta en PDF.`
        : `${params.companyName} le informa el pago de la orden ${params.number}. Adjuntamos en PDF el detalle y los certificados de las retenciones practicadas.`;
  const body = [
    `Estimados ${params.supplierName}:`,
    '',
    intro,
    ...(params.message ? ['', params.message] : []),
    '',
    'Saludos cordiales,',
    params.companyName,
  ].join('\n');
  return sendMail({
    to: params.to,
    subject: `${label} ${params.number} — ${params.companyName}`,
    text: body,
    attachments: [
      { filename: params.attachment.filename, content: params.attachment.content, contentType: 'application/pdf' },
    ],
  });
}
