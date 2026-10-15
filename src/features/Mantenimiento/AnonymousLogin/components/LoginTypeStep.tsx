'use client';

import { Button } from '@/components/ui/button';
import type { MaintenanceLoginType } from '../utils/login-schemas';

interface LoginTypeStepProps {
  onSelect: (loginType: Exclude<MaintenanceLoginType, ''>) => void;
}

/**
 * Paso 2: tipo de acceso. "Mecanico" entra por el mismo camino que "Invitado"
 * (usuario y contraseña); sólo el empleado usa la sesión anónima con CUIL.
 */
export function LoginTypeStep({ onSelect }: LoginTypeStepProps) {
  return (
    <div className="space-y-4">
      <p className="mb-4 text-center text-base text-foreground">Seleccione su tipo de usuario para continuar:</p>
      <Button type="button" className="h-12 w-full text-base" onClick={() => onSelect('empleado')}>
        Empleado
      </Button>
      <Button type="button" variant="secondary" className="h-12 w-full text-base" onClick={() => onSelect('invitado')}>
        Invitado
      </Button>
      <Button type="button" variant="secondary" className="h-12 w-full text-base" onClick={() => onSelect('invitado')}>
        Mecanico
      </Button>
    </div>
  );
}
