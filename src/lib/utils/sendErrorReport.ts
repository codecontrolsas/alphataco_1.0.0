'use server';

import { sendEmail } from '@/features/Auth/lib/email';
import { Logger } from '@/lib/logger';
import { BRAND_NAME } from '@/shared/lib/branding';

const logger = new Logger('sendErrorReport');

const ERROR_REPORT_RECIPIENTS = 'fspiritosi@codecontrol.com.ar,yjimenez@codecontrol.com.ar';

interface ErrorReportParams {
  message: string;
  stack?: string;
  digest?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  source: string;
}

function formatStackTrace(stack: string | undefined): string {
  if (!stack) return 'No disponible';

  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes('node_modules') || line.includes('webpack-internal')) {
        return `  [lib] ${line}`;
      }
      return `  > ${line}`;
    })
    .join('\n');
}

function buildErrorEmailHtml(params: ErrorReportParams): string {
  const { message, stack, digest, componentStack, url, userAgent, source } = params;
  const timestamp = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const formattedStack = formatStackTrace(stack);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 700px; margin: 0 auto; }
        .header { background: #dc2626; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 20px; }
        .header p { margin: 4px 0 0; opacity: 0.9; font-size: 14px; }
        .content { background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; }
        .section { margin-bottom: 20px; }
        .section-title { font-size: 14px; font-weight: bold; color: #374151; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .info-table { width: 100%; border-collapse: collapse; }
        .info-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
        .info-table td:first-child { font-weight: 600; color: #6b7280; width: 140px; white-space: nowrap; }
        .info-table td:last-child { color: #111827; }
        .digest { background: #fef2f2; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 14px; color: #991b1b; display: inline-block; }
        .error-message { background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 0 6px 6px 0; font-size: 14px; color: #991b1b; }
        .stack-block { background: #1f2937; color: #d1d5db; padding: 16px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; overflow-x: auto; max-height: 400px; }
        .component-stack { background: #fffbeb; border: 1px solid #fde68a; padding: 16px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; color: #92400e; }
        .footer { background: #f9fafb; padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; text-align: center; color: #9ca3af; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Reporte de Error - ${BRAND_NAME}</h1>
          <p>Origen: ${source} | ${timestamp}</p>
        </div>
        <div class="content">
          <div class="section">
            <div class="section-title">Resumen</div>
            <table class="info-table">
              <tr>
                <td>Origen</td>
                <td>${source}</td>
              </tr>
              <tr>
                <td>Fecha/Hora</td>
                <td>${timestamp}</td>
              </tr>
              ${digest ? `<tr><td>Error Digest</td><td><span class="digest">${digest}</span></td></tr>` : ''}
              <tr>
                <td>URL</td>
                <td>${url}</td>
              </tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Mensaje de Error</div>
            <div class="error-message">${message}</div>
          </div>

          <div class="section">
            <div class="section-title">Stack Trace</div>
            <div class="stack-block">${formattedStack}</div>
          </div>

          ${
            componentStack
              ? `
          <div class="section">
            <div class="section-title">Component Stack</div>
            <div class="component-stack">${componentStack.trim()}</div>
          </div>
          `
              : ''
          }

          <div class="section">
            <div class="section-title">Entorno</div>
            <table class="info-table">
              <tr>
                <td>User Agent</td>
                <td style="font-size: 12px;">${userAgent}</td>
              </tr>
              <tr>
                <td>URL Completa</td>
                <td style="font-size: 12px;">${url}</td>
              </tr>
            </table>
          </div>
        </div>
        <div class="footer">
          <p>Este es un correo automatico generado por el sistema de gestion.</p>
          <p>Por favor no responda a este correo.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendErrorReport(params: ErrorReportParams) {
  logger.info('Enviando reporte de error', { data: { source: params.source, digest: params.digest } });

  try {
    const html = buildErrorEmailHtml(params);
    const subject = `[Error] ${params.source} - ${params.message.substring(0, 80)}`;

    const result = await sendEmail({
      to: ERROR_REPORT_RECIPIENTS,
      subject,
      html,
    });

    if (result.success) {
      logger.info('Reporte de error enviado correctamente');
    } else {
      logger.error('Error al enviar reporte', { data: { error: result.error } });
    }

    return result;
  } catch (err) {
    logger.error('Error critico al enviar reporte', { data: { err } });
    return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
