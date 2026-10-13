'use client';

import { Button } from '@/components/ui/button';
import { GoogleIcon } from '@/components/ui/icons/google';
import { googleLogin } from '@/features/Auth/actions/login-actions';
import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';

/**
 * Login con Google. El servidor arma la URL del proveedor y redirige; el destino es una ruta
 * interna que el servidor vuelve a validar, no un dato confiable del navegador.
 */
function GoogleButton({ next }: { next: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await googleLogin(next);
            if (result?.error) setError(result.error);
          })
        }
      >
        {isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <GoogleIcon />}
        Continuar con Google
      </Button>
      {error && (
        <p role="alert" className="text-danger-subtle-foreground text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export default GoogleButton;
