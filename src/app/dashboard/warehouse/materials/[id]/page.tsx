import { Button } from '@/components/ui/button';
import { checkPermissionServer } from '@/features/Permissions';
import { MaterialHeader } from '@/features/Warehouses/Materials/components/MaterialHeader';
import { MaterialKardex } from '@/features/Warehouses/Materials/components/MaterialKardex';
import {
  MaterialHeaderSkeleton,
  MaterialKardexSkeleton,
} from '@/features/Warehouses/Materials/fallback/MaterialDetailSkeletons';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';

export const metadata = { title: 'Material | Almacenes' };

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) notFound();

  // Solo la unidad, para el kardex: el resto lo carga cada bloque en su propio Suspense.
  const material = await prisma.materials.findFirst({
    where: { id, company_id: await getActiveCompanyId() },
    select: { unit: { select: { abbreviation: true } } },
  });
  if (!material) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/warehouse?tab=stock">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Stock
        </Link>
      </Button>
      <Suspense fallback={<MaterialHeaderSkeleton />}>
        <MaterialHeader materialId={id} />
      </Suspense>
      <Suspense fallback={<MaterialKardexSkeleton />}>
        <MaterialKardex materialId={id} unit={material.unit.abbreviation} />
      </Suspense>
    </div>
  );
}
