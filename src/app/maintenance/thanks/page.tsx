'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { BRAND_NAME } from '@/shared/lib/branding';
import { ArrowRight, CheckCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ThanksPage() {
  const router = useRouter();

  // Auto-redirigir después de 5 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/maintenance');
    }, 5000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md space-y-6 rounded-xl border shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="flex items-center justify-center">
            <span className="text-brand-ink text-2xl font-bold tracking-tight lowercase mb-2">{BRAND_NAME}</span>
          </div>
          <div className="space-y-2">
            <CardDescription className="text-base text-muted-foreground">Sistema de Mantenimiento</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="h-20 w-20 rounded-full bg-ok-subtle flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-ok" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">¡Sesión cerrada exitosamente!</h2>
              <p className="text-muted-foreground">
                Gracias por usar nuestro sistema de mantenimiento. Tus acciones han sido registradas correctamente.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LogOut className="h-4 w-4" />
              <span>Serás redirigido automáticamente en unos segundos...</span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button onClick={() => router.push('/maintenance')} className="w-full" size="lg">
            Volver al inicio
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Si no eres redirigido automáticamente, haz clic en el botón de arriba
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
