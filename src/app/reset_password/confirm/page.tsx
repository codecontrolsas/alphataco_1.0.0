// src/app/reset_password/confirm/page.tsx
import { buttonVariants } from '@/components/ui/button';
import { AuthShell } from '@/features/Auth/components/AuthShell';
import Link from 'next/link';

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function ConfirmUserPassword({ searchParams }: PageProps) {
  const error = typeof searchParams.error === 'string' ? searchParams.error : '';

  return (
    <AuthShell>
      <div className="space-y-2">
        <h1 className="text-display text-balance">{error ? 'Enlace inválido o expirado' : 'Procesando solicitud...'}</h1>
      </div>
      <div className="mt-8">
        {error === 'invalid_token' ? (
          <div className="border border-danger-border bg-danger-soft px-3 py-2.5">
            <p className="text-label text-danger-text">Enlace inválido o expirado</p>
            <p className="mt-1 text-caption text-foreground/80">
              Por favor, solicita un nuevo enlace de recuperación de contraseña.
            </p>
            <Link href="/reset_password" className={buttonVariants({ variant: 'primary', className: 'mt-4' })}>
              Solicitar nuevo enlace
            </Link>
          </div>
        ) : (
          <div className="border border-info-border bg-info-soft px-3 py-2.5">
            <p className="text-label text-info-text">Verificando enlace...</p>
            <p className="mt-1 text-caption text-foreground/80">Por favor espera mientras procesamos tu solicitud.</p>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
