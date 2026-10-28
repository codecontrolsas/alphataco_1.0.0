import { Skeleton } from '@/components/ui/skeleton';
import { getClothingOperatorContext } from '@/features/Clothing/actions/session.server';
import { requireInstanceRoute } from '@/features/Modules/server/public-routes.server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

function RedirectSkeleton() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

async function ClothingRootContent() {
  await requireInstanceRoute('/clothing');
  const context = await getClothingOperatorContext();

  if (context) {
    redirect('/clothing/delivery');
  }

  redirect('/clothing/login');
  return null;
}

export default function ClothingRootPage() {
  return (
    <Suspense fallback={<RedirectSkeleton />}>
      <ClothingRootContent />
    </Suspense>
  );
}
