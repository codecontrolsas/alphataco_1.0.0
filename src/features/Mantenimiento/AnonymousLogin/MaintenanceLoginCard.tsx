'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { BRAND_NAME } from '@/shared/lib/branding';
import { ArrowLeft } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CredentialsStep } from './components/CredentialsStep';
import { EquipmentSelectionStep } from './components/EquipmentSelectionStep';
import { LoginTypeStep } from './components/LoginTypeStep';
import { useMaintenanceAnonymousLogin } from './hooks/useMaintenanceAnonymousLogin';
import type { CredentialsValues, MaintenanceLoginType } from './utils/login-schemas';

type Step = 'equipment-selection' | 'selection' | 'login';

/**
 * Login del QR de mantenimiento: identificación del equipo, tipo de acceso y credenciales.
 *
 * El equipo puede venir por query param (`?equipment=<id>`, que es lo que imprime el QR) o
 * tipearse a mano. De ese equipo sale la empresa activa: en este flujo no hay sesión previa
 * ni empresa en el JWT, así que la fija el servidor a partir del vehículo o del legajo.
 */
export function MaintenanceLoginCard() {
  const searchParams = useSearchParams();
  const equipmentIdFromQr = searchParams.get('equipment');

  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(equipmentIdFromQr);
  const [step, setStep] = useState<Step>(equipmentIdFromQr ? 'selection' : 'equipment-selection');
  const [loginType, setLoginType] = useState<MaintenanceLoginType>('');

  const { login } = useMaintenanceAnonymousLogin(selectedEquipmentId);

  const handleEquipmentSubmit = (equipmentId: string) => {
    setSelectedEquipmentId(equipmentId);
    setStep('selection');
  };

  const handleLoginTypeSelect = (type: Exclude<MaintenanceLoginType, ''>) => {
    setLoginType(type);
    setStep('login');
  };

  const handleCredentialsSubmit = async (values: CredentialsValues) => {
    await login(loginType, values);
  };

  const handleBack = () => {
    if (step === 'login') {
      setStep('selection');
      setLoginType('');
    } else if (step === 'selection') {
      setStep('equipment-selection');
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <span className="text-brand-ink text-3xl font-bold tracking-tight lowercase">{BRAND_NAME}</span>
          </div>
          <CardDescription className="text-center text-base text-muted-foreground">
            Sistema de Checklist y Mantenimiento de Equipos
          </CardDescription>
          {/* Progreso del ingreso: el equipo que llega por QR ya cuenta como paso 1 resuelto */}
          <p className="text-center text-sm text-muted-foreground tabular-nums" aria-live="polite">
            Paso {step === 'equipment-selection' ? 1 : step === 'selection' ? 2 : 3} de 3{' · '}
            {step === 'equipment-selection' ? 'Equipo' : step === 'selection' ? 'Tipo de usuario' : 'Credenciales'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'equipment-selection' ? (
            <EquipmentSelectionStep
              selectedEquipmentId={selectedEquipmentId}
              onSelect={setSelectedEquipmentId}
              onSubmit={handleEquipmentSubmit}
            />
          ) : step === 'selection' ? (
            <LoginTypeStep onSelect={handleLoginTypeSelect} />
          ) : (
            <CredentialsStep loginType={loginType} onSubmit={handleCredentialsSubmit} />
          )}
        </CardContent>
        {(step === 'login' || step === 'selection') && (
          <CardFooter>
            <Button type="button" variant="outline" className="h-12 w-full text-base" onClick={handleBack}>
              <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" /> Regresar
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
