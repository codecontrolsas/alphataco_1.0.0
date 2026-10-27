import 'server-only';

import { renderActionEmail } from '../shell';
import { sendMail } from '../transport';

/**
 * Correos transaccionales de autenticación (P4): invitación y recuperación de contraseña.
 *
 * Venían inline en `src/shared/lib/mailer.ts`; P5 los movió acá sin cambiarles el texto ni el
 * diseño, sólo para que el transporte quede separado de las plantillas. El layout es el
 * mismo, ahora compartido en `shell.ts` (`renderActionEmail`) y con escapado de los valores
 * que vienen de la base (`name`, `companyName`).
 *
 * Si SMTP no está configurado el envío no explota: `sendMail` loguea el mensaje completo
 * —con el enlace— para poder terminar el flujo a mano en desarrollo. El logger emite sólo con
 * `NEXT_PUBLIC_SHOW_LOGS=true`; sin eso el enlace también se puede sacar de
 * `auth_verification` (el token va en `identifier`, como `reset-password:<token>`).
 */

/** Recuperación de contraseña. Lo llama `emailAndPassword.sendResetPassword` de Better Auth. */
export async function sendPasswordResetEmail(params: {
  to: string;
  name?: string | null;
  url: string;
}): Promise<boolean> {
  const saludo = params.name ? `Hola ${params.name}` : 'Hola';
  return sendMail({
    to: params.to,
    subject: 'Restablecé tu contraseña',
    text: `${saludo}, entrá a este enlace para elegir una nueva contraseña: ${params.url}`,
    html: renderActionEmail(
      'Restablecé tu contraseña',
      `${saludo}, pediste restablecer tu contraseña. El enlace vence en 24 horas.`,
      { url: params.url, label: 'Elegir nueva contraseña' }
    ),
  });
}

/** Invitación a la empresa: el usuario recién creado define su propia contraseña. */
export async function sendInvitationEmail(params: {
  to: string;
  name?: string | null;
  companyName: string;
  url: string;
}): Promise<boolean> {
  const saludo = params.name ? `Hola ${params.name}` : 'Hola';
  return sendMail({
    to: params.to,
    subject: `Te invitaron a ${params.companyName}`,
    text: `${saludo}, te crearon un usuario en ${params.companyName}. Definí tu contraseña acá: ${params.url}`,
    html: renderActionEmail(
      `Te invitaron a ${params.companyName}`,
      `${saludo}, te crearon un usuario. Definí tu contraseña para entrar por primera vez; el enlace vence en 24 horas.`,
      { url: params.url, label: 'Definir mi contraseña' }
    ),
  });
}

/**
 * Invitación al portal de empleados (ticket 804): el empleado define su contraseña con el enlace y entra a `/portal`.
 * Distinto de la invitación a la empresa: no es un usuario del sistema, es el acceso a sus propios datos.
 */
export async function sendPortalInvitationEmail(params: {
  to: string;
  name?: string | null;
  companyName: string;
  url: string;
}): Promise<boolean> {
  const saludo = params.name ? `Hola ${params.name}` : 'Hola';
  return sendMail({
    to: params.to,
    subject: `Tu acceso al portal de empleados de ${params.companyName}`,
    text: `${saludo}, ${params.companyName} te habilitó el portal de empleados. Definí tu contraseña acá: ${params.url}`,
    html: renderActionEmail(
      `Tu acceso al portal de ${params.companyName}`,
      `${saludo}, Recursos Humanos te habilitó el portal de empleados. Definí tu contraseña para entrar por primera vez; el enlace vence en 24 horas.`,
      { url: params.url, label: 'Definir mi contraseña' }
    ),
  });
}

/** Aviso al empleado que ya tenía usuario: entra al portal con su contraseña de siempre. */
export async function sendPortalAccessEnabledEmail(params: {
  to: string;
  name?: string | null;
  companyName: string;
  url: string;
}): Promise<boolean> {
  const saludo = params.name ? `Hola ${params.name}` : 'Hola';
  return sendMail({
    to: params.to,
    subject: `Ya tenés acceso al portal de empleados de ${params.companyName}`,
    text: `${saludo}, ya podés entrar al portal de empleados con tu usuario y contraseña de siempre: ${params.url}`,
    html: renderActionEmail(
      `Ya tenés acceso al portal de ${params.companyName}`,
      `${saludo}, Recursos Humanos te habilitó el portal de empleados. Entrá con tu usuario y contraseña de siempre.`,
      { url: params.url, label: 'Ir al portal' }
    ),
  });
}
