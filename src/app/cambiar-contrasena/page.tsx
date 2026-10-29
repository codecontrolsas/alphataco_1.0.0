import { ForcedPasswordChange } from '@/features/Portal/components/ForcedPasswordChange';
import { getSessionNeedsPasswordChange, getSessionUserId } from '@/shared/lib/session';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export const metadata: Metadata = { title: 'Elegí tu contraseña', robots: { index: false, follow: false } };

/**
 * Primer ingreso con contraseña temporal (p. ej. el primer administrador que crea el alta remota de TaskApp). El
 * proxy manda acá toda página del dashboard mientras `needsPasswordChange` siga en true y corta las Server Actions.
 * Al guardar, `changePassword` baja la marca y la recarga vuelve al dashboard.
 */
export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  if (!(await getSessionUserId())) redirect('/login');
  if (!(await getSessionNeedsPasswordChange())) redirect('/dashboard');
  return (
    <div className="w-full max-w-sm">
      <ForcedPasswordChange />
    </div>
  );
}
