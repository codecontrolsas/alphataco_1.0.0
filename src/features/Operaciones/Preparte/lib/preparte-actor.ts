import { preparte_status } from '@/generated/prisma/enums';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';

/**
 * Columna `*_by` que corresponde al cierre de un pedido según su nuevo estado, con el actor
 * tomado SIEMPRE de la sesión (nunca del payload del cliente). Vacío si el estado no cierra
 * el pedido o no hay perfil de sesión.
 */
export async function getStatusActorPayload(
  status: preparte_status | string | null | undefined
): Promise<Record<string, string>> {
  if (
    status !== preparte_status.rechazado &&
    status !== preparte_status.cancelado &&
    status !== preparte_status.reprogramado
  ) {
    return {};
  }

  const profile = await getServerAuthProfile();
  if (!profile) return {};

  if (status === preparte_status.rechazado) return { rejected_by: profile.credentialId };
  if (status === preparte_status.cancelado) return { cancelled_by: profile.credentialId };
  return { reprogrammed_by: profile.credentialId };
}
