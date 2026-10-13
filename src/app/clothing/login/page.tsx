import { AuthShell } from '@/features/Auth/components/AuthShell';
import { AuthSkeleton } from '@/features/Auth/components/AuthSkeleton';
import { CredentialsLoginForm } from '@/features/Auth/components/CredentialsLoginForm';
import { clothingLogin, getClothingOperatorContext } from '@/features/Clothing/actions/session.server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export const metadata = {
  title: 'Entrega de indumentaria',
};

async function ClothingLoginContent() {
  const context = await getClothingOperatorContext();

  if (context) {
    redirect('/clothing/delivery');
  }

  return (
    <AuthShell
      kicker="Entrega de indumentaria"
      title="Ingresá para registrar entregas"
      description="Acceso para el registro de entregas de ropa de trabajo y EPP."
    >
      <CredentialsLoginForm
        action={clothingLogin}
        redirectTo="/clothing/delivery"
        helpText="Si no tenés acceso, pedíselo al responsable de indumentaria o a un administrador."
      />
    </AuthShell>
  );
}

export default function ClothingLoginPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <ClothingLoginContent />
    </Suspense>
  );
}
