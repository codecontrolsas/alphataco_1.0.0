import 'server-only';

import { sendMail } from '../transport';

/**
 * Mail al cliente con el recibo de cobranza en PDF (Tesorería etapa 2). Como el envío de
 * documentos a proveedores: el envío ES la acción, y quien lo llama solo marca el recibo como
 * enviado si esto devuelve `true`.
 */
export async function sendCustomerReceiptEmail(params: {
  to: readonly string[];
  number: string;
  companyName: string;
  customerName: string;
  message: string | null;
  attachment: { filename: string; content: Uint8Array };
}): Promise<boolean> {
  const intro = `${params.companyName} le envía el recibo ${params.number} por los pagos recibidos, adjunto en PDF.`;
  const body = [`Estimados ${params.customerName}:`, '', intro, ...(params.message ? ['', params.message] : []), '', 'Saludos cordiales,', params.companyName].join('\n');
  return sendMail({
    to: params.to,
    subject: `Recibo ${params.number} — ${params.companyName}`,
    text: body,
    attachments: [{ filename: params.attachment.filename, content: params.attachment.content, contentType: 'application/pdf' }],
  });
}
