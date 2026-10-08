import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ClothingLoginForm } from '@/features/Clothing/ClothingDelivery/components/ClothingLoginForm';
import { getClothingOperatorContext } from '@/features/Clothing/actions/session.server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export const metadata = {
  title: 'Iniciar Sesion - Entrega de Indumentaria',
};

function LoginSkeleton() {
  return (
    <main className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-7 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

async function ClothingLoginContent() {
  const context = await getClothingOperatorContext();

  if (context) {
    redirect('/clothing/delivery');
  }

  return (
    <main className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <ClothingLoginForm />
      </div>
    </main>
  );
}

export default function ClothingLoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <ClothingLoginContent />
    </Suspense>
  );
}
