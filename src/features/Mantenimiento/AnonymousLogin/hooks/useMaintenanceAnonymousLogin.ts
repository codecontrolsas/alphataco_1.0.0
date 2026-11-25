'use client';

import {
  completeMaintenanceEmployeeAnonymousSession,
  setActiveCompanyForEquipment,
  signOutMaintenanceSession,
} from '@/features/Mantenimiento/actions/maintenance-actions';
import { maintenanceGuestLogin } from '@/features/Mantenimiento/actions/maintenance-session.server';
import { authClient } from '@/shared/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { CredentialsValues, MaintenanceLoginType } from '../utils/login-schemas';

/**
 * Login del QR de mantenimiento.
 *
 * Dos caminos: el invitado entra con email y contraseña, el empleado con una sesión anónima
 * validada contra su CUIL. En los dos casos la empresa activa la fija el SERVIDOR desde el
 * equipo escaneado o desde el legajo — el cliente ni escribe la cookie `actualComp` ni puede
 * proponer el claim de empresa (`input: false` en `shared/lib/auth.ts`).
 *
 * Lo único que hace el cliente con Auth es abrir la sesión ANÓNIMA, que no lleva ninguna
 * decisión de perímetro: el operario entra sin empresa y sin legajo, y los dos claims se los
 * escribe el servidor recién cuando `completeMaintenanceEmployeeAnonymousSession()` valida el
 * CUIL contra la base.
 */
export function useMaintenanceAnonymousLogin(equipmentId: string | null) {
  const router = useRouter();

  // Si se llega al QR con una sesión de dashboard abierta, se cierra: el flujo de
  // mantenimiento corre siempre con la sesión del operario o del invitado.
  useEffect(() => {
    const clearDashboardSession = async () => {
      const { data } = await authClient.getSession();
      if (data?.user && !data.user.isAnonymous) {
        await signOutMaintenanceSession();
      }
    };
    void clearDashboardSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(loginType: MaintenanceLoginType, { cuil, email, password }: CredentialsValues) {
    await toast
      .promise(
        async () => {
          if (!equipmentId) {
            throw new Error('No se ha seleccionado un equipo. Por favor, seleccione un equipo primero.');
          }

          if (loginType === 'invitado' && email && password) {
            const result = await maintenanceGuestLogin(email, password);
            if ('error' in result) {
              throw new Error(result.error);
            }
            // La empresa activa sale del equipo escaneado y la cookie la escribe el servidor.
            await setActiveCompanyForEquipment(equipmentId);
          } else {
            const { error: anonError } = await authClient.signIn.anonymous();
            if (anonError) {
              throw new Error(anonError.message ?? 'No se pudo iniciar la sesión de mantenimiento.');
            }

            // Valida el CUIL contra el legajo y escribe los claims server-side.
            const res = await completeMaintenanceEmployeeAnonymousSession({
              cuil: cuil || '',
              equipmentId,
            });
            if (!res.ok) {
              throw new Error(res.error);
            }
          }

          router.push(`/maintenance/equipment/${equipmentId}`);
        },
        {
          loading: 'Iniciando sesión...',
          success: 'Sesión iniciada correctamente.',
          // Un Error devuelto tal cual, sonner lo toma como opciones del toast y pierde el texto.
          error: (error) => (error instanceof Error ? error.message : String(error)),
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      });
  }

  return { login };
}
