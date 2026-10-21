/**
 * Layout y primitivas compartidas de los correos HTML.
 *
 * Portado de las dos edge functions de Deno (`send-deviations-email` y
 * `send-documents-expiry-email`), que repetían el mismo encabezado, barra de título, cuerpo y
 * pie en ~150 líneas cada una. Se conserva el diseño (tablas anidadas, estilos inline: es lo
 * que renderizan los clientes de correo), con tres cambios deliberados:
 *
 * 1. **Sin logo remoto.** Las edge functions embebían
 *    `https://vvrckjjyrwqzpbaatemz.supabase.co/storage/v1/object/public/logo/...`, que murió
 *    con Supabase. El logo de cada empresa hoy vive en RustFS, que no se publica en internet y
 *    sólo se sirve por `/api/files` contra una sesión — un cliente de correo no puede
 *    autenticarse ahí. Una imagen rota en todos los correos es peor que ninguna, así que el
 *    encabezado es tipográfico.
 * 2. **Nombre de la empresa en el encabezado.** Los jobs corren para todas las empresas y
 *    mandan un correo por empresa; que el destinatario vea de quién son los datos es la
 *    señal más barata de que no se mezclaron.
 * 3. **Todo lo que viene de la base se escapa.** Las edge functions interpolaban nombres de
 *    cliente, de empleado y descripciones libres directamente en el HTML.
 */

/**
 * Tokens visuales de los correos: son los del sistema (`src/app/globals.css`, tema claro) copiados
 * como hex literales, porque un cliente de correo no resuelve variables CSS. ÚNICO lugar donde se
 * escriben colores y radios de los mails: si cambia el tema del sistema, se actualiza acá.
 */
export const MAIL_COLORS = {
  /** `--background` */
  background: '#f5f7fa',
  /** `--card` */
  card: '#ffffff',
  /** `--border` */
  border: '#e0e5ec',
  /** `--foreground` */
  text: '#161c24',
  /** `--muted-foreground` */
  textMuted: '#566170',
  /** `--secondary` / `--muted` */
  surfaceMuted: '#eef1f6',
  /** `--accent`: filas alternas de tabla */
  surfaceAlt: '#f0f4f9',
  /** `--primary` y su texto */
  primary: '#3597c7',
  primaryForeground: '#13202b',
  /** `--brand-subtle` / `--brand-ink` */
  brandSubtle: '#e6f2f9',
  brandInk: '#1f6c94',
  /** Encabezado oscuro: `--foreground` con texto claro (`--input` para el secundario). */
  onDark: '#ffffff',
  onDarkMuted: '#c9d1db',
  /** Estados: sólido, fondo suave y texto sobre el suave (`--status-*`). */
  ok: '#2d8949',
  okSubtle: '#e5f5e9',
  okInk: '#1d5f32',
  warn: '#e0a21b',
  warnSubtle: '#fcf1d3',
  warnInk: '#7a5410',
  danger: '#c7303a',
  dangerSubtle: '#fdeceb',
  dangerInk: '#a1222b',
  pending: '#8a95a5',
  pendingSubtle: '#eceef3',
  pendingInk: '#4a5565',
  info: '#1b9cb5',
  infoSubtle: '#def3f8',
  infoInk: '#145a6b',
  cert: '#7b6bd6',
  certSubtle: '#ece9fb',
  certInk: '#4b3f9a',
  expired: '#d9822b',
  expiredSubtle: '#fdebdc',
  expiredInk: '#9a4c10',
} as const;

/** Radios del sistema: superficie 12 px (`rounded-xl`), control 6 px (`rounded-md`), estado = píldora. */
export const MAIL_RADIUS = {
  surface: '12px',
  control: '6px',
  pill: '9999px',
} as const;

export type MailTone = 'ok' | 'warn' | 'danger' | 'info' | 'pending' | 'cert' | 'expired' | 'brand';

/** Fondo suave + texto de cada tono, para los `badge()`. */
export const MAIL_TONES: Record<MailTone, { bg: string; fg: string }> = {
  ok: { bg: MAIL_COLORS.okSubtle, fg: MAIL_COLORS.okInk },
  warn: { bg: MAIL_COLORS.warnSubtle, fg: MAIL_COLORS.warnInk },
  danger: { bg: MAIL_COLORS.dangerSubtle, fg: MAIL_COLORS.dangerInk },
  info: { bg: MAIL_COLORS.infoSubtle, fg: MAIL_COLORS.infoInk },
  pending: { bg: MAIL_COLORS.pendingSubtle, fg: MAIL_COLORS.pendingInk },
  cert: { bg: MAIL_COLORS.certSubtle, fg: MAIL_COLORS.certInk },
  expired: { bg: MAIL_COLORS.expiredSubtle, fg: MAIL_COLORS.expiredInk },
  brand: { bg: MAIL_COLORS.brandSubtle, fg: MAIL_COLORS.brandInk },
};

const C = MAIL_COLORS;
const R = MAIL_RADIUS;

/** Escapa un valor para interpolarlo en el cuerpo de un tag HTML o en un atributo entre comillas. */
export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Base pública de la app, para los enlaces de los correos. */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Píldora de color usada en todas las tablas de los correos. */
export function badge(label: string, tone: MailTone, extraStyle = ''): string {
  const { bg, fg } = MAIL_TONES[tone];
  return `<span style="display:inline-block;background:${bg};color:${fg};padding:2px 8px;border-radius:${R.pill};font-size:11px;font-weight:600;white-space:nowrap;line-height:1.4;${extraStyle}">${escapeHtml(label)}</span>`;
}

/** Píldora para la barra de color primario del encabezado (`badgeHtml` de `renderEmailShell`). */
export function headerPill(htmlLabel: string, tone: 'default' | 'ok' = 'default'): string {
  const bg = tone === 'ok' ? C.ok : C.primaryForeground;
  return `<span style="background:${bg};color:${C.onDark};padding:6px 14px;border-radius:${R.pill};font-size:13px;font-weight:600;">${htmlLabel}</span>`;
}

export function tableHeaderRow(headers: readonly string[]): string {
  return `<tr style="background:${C.brandSubtle};">${headers
    .map(
      (header) =>
        `<th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:${C.brandInk};border-bottom:1px solid ${C.border};">${escapeHtml(header)}</th>`
    )
    .join('')}</tr>`;
}

/** Encabezado oscuro de un grupo (una empresa, un cliente, un tipo de recurso). */
export function groupCardOpen(title: string, countLabel: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid ${C.border};border-radius:${R.surface};overflow:hidden;">
      <tr>
        <td style="background:${C.text};padding:12px 18px;">
          <p style="margin:0;font-size:14px;font-weight:700;color:${C.onDark};">${escapeHtml(title)}</p>
          <p style="margin:2px 0 0;font-size:11px;color:${C.onDarkMuted};">${escapeHtml(countLabel)}</p>
        </td>
      </tr>`;
}

export const groupCardClose = '</table>';

export function sectionHeader(title: string, subtitle: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
      <tr>
        <td>
          <p style="margin:0;font-size:14px;font-weight:700;color:${C.text};">${escapeHtml(title)}</p>
          <p style="margin:4px 0 0;font-size:12px;color:${C.textMuted};">${escapeHtml(subtitle)}</p>
        </td>
      </tr>
    </table>`;
}

/** Botón principal + el enlace en texto, para los clientes que no renderizan el botón. */
export function ctaBlock(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr>
        <td align="center" style="padding:16px 0 4px;">
          <a href="${safeUrl}" target="_blank" style="display:inline-block;background:${C.primary};color:${C.primaryForeground};padding:12px 28px;border-radius:${R.control};font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.2px;">${escapeHtml(label)}</a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:4px 0 0;">
          <a href="${safeUrl}" target="_blank" style="font-size:11px;color:${C.textMuted};text-decoration:underline;">${safeUrl}</a>
        </td>
      </tr>
    </table>`;
}

export interface EmailShellOptions {
  /** Empresa dueña de los datos. Va en el encabezado. */
  companyName: string;
  /** Título de la barra de color primario. */
  title: string;
  /** Bajada de la barra de color primario (normalmente la fecha). */
  subtitle: string;
  /** Píldora a la derecha de la barra de color primario (ya renderizada). */
  badgeHtml?: string;
  /** Cuerpo, ya renderizado. */
  body: string;
}

/** Documento HTML completo de un correo del sistema. */
export function renderEmailShell(options: EmailShellOptions): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:${C.background};font-family:'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.background};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="780" cellpadding="0" cellspacing="0" style="max-width:780px;width:100%;border-radius:${R.surface};overflow:hidden;box-shadow:0 4px 24px rgba(22,28,36,0.08);">

          <tr>
            <td style="background:${C.text};padding:28px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:${C.onDark};letter-spacing:-0.3px;">${escapeHtml(options.companyName)}</p>
              <p style="margin:2px 0 0;font-size:13px;color:${C.onDarkMuted};font-weight:400;">Sistema de Gesti&oacute;n</p>
            </td>
          </tr>

          <tr>
            <td style="background:${C.primary};padding:16px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:16px;font-weight:700;color:${C.primaryForeground};">${escapeHtml(options.title)}</p>
                    <p style="margin:4px 0 0;font-size:13px;color:${C.primaryForeground};text-transform:capitalize;">${escapeHtml(options.subtitle)}</p>
                  </td>
                  <td align="right" style="vertical-align:middle;">${options.badgeHtml ?? ''}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:${C.card};padding:28px 32px;">${options.body}</td>
          </tr>

          <tr>
            <td style="background:${C.surfaceMuted};border-top:1px solid ${C.border};padding:20px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:${C.textMuted};">Este es un correo autom&aacute;tico generado por el sistema de gesti&oacute;n.</p>
              <p style="margin:0;font-size:12px;color:${C.textMuted};">${escapeHtml(options.companyName)} &mdash; Por favor no responda a este correo.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Layout simple (un párrafo y un botón) para los correos transaccionales de auth. */
export function renderActionEmail(title: string, body: string, action: { url: string; label: string }): string {
  const safeUrl = escapeHtml(action.url);
  return `<!doctype html><html lang="es"><body style="font-family:'Segoe UI',Arial,sans-serif;color:${C.text};line-height:1.5">
  <h2 style="color:${C.text}">${escapeHtml(title)}</h2>
  <p>${escapeHtml(body)}</p>
  <p><a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:${C.primary};color:${C.primaryForeground};text-decoration:none;border-radius:${R.control}">${escapeHtml(action.label)}</a></p>
  <p style="font-size:12px;color:${C.textMuted}">Si el bot&oacute;n no funciona, copi&aacute; este enlace en tu navegador:<br>${safeUrl}</p>
</body></html>`;
}
