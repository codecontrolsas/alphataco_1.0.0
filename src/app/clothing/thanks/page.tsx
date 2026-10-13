'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { BRAND_NAME } from '@/shared/lib/branding';
import { ArrowRight, CheckCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ClothingThanksPage() {
  const router = useRouter();

  // Auto-redirect after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/clothing/delivery');
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
            <CardDescription className="text-base text-muted-foreground">Sistema de Indumentaria</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">¡Entrega registrada!</h2>
              <p className="text-muted-foreground">La entrega de indumentaria ha sido registrada correctamente.</p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LogOut className="h-4 w-4" />
              <span>Seras redirigido automaticamente en unos segundos...</span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button onClick={() => router.push('/clothing/delivery')} className="w-full" size="lg">
            Nueva entrega
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Si no eres redirigido automaticamente, haz clic en el boton de arriba
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
