import { DailyReportAttentionSection } from '@/features/Operaciones/PartesDiarios/detail/DailyReportAttentionSection';
import { DailyReportDetailTable } from '@/features/Operaciones/PartesDiarios/detail/DailyReportDetailTable';
import { DailyReportHeader } from '@/features/Operaciones/PartesDiarios/detail/DailyReportHeader';
import { DailyReportDetailSkeleton } from '@/features/Operaciones/PartesDiarios/detail/fallback/DailyReportDetailSkeleton';
import { DailyReportHeaderSkeleton } from '@/features/Operaciones/PartesDiarios/detail/fallback/DailyReportHeaderSkeleton';
import { getCachedDailyReportHeader } from '@/features/Operaciones/PartesDiarios/detail/lib/header-cache';
import { checkPermissionServer } from '@/features/Permissions';
import { ChevronLeft } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  // El permiso y la cabecera (cacheada por request) se resuelven juntos; sin permiso se redirige
  // antes de usar el resultado, y un parte inexistente da 404 en vez de renderizar una pantalla vacía.
  const [canView, header] = await Promise.all([
    checkPermissionServer('operaciones', 'detalle-parte-diario', 'view'),
    getCachedDailyReportHeader(resolvedParams.uuid),
  ]);
  if (!canView) redirect('/dashboard');
  if (!header) notFound();

  return (
    <div className="space-y-6 px-4 py-4 sm:px-6">
      <Link
        href="/dashboard/operations?tab=dailyreportstable"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded text-sm outline-none focus-visible:ring-[3px]"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Volver a partes
      </Link>
      <Suspense fallback={<DailyReportHeaderSkeleton />}>
        <DailyReportHeader uuid={resolvedParams.uuid} />
      </Suspense>
      <Suspense fallback={null}>
        <DailyReportAttentionSection uuid={resolvedParams.uuid} />
      </Suspense>
      <Suspense fallback={<DailyReportDetailSkeleton />}>
        <DailyReportDetailTable uuid={resolvedParams.uuid} searchParams={resolvedSearchParams} />
      </Suspense>
    </div>
  );
}

export default Page;

export async function generateMetadata({ params }: { params: Promise<{ uuid: string }> }) {
  const resolvedParams = await params;
  const header = await getCachedDailyReportHeader(resolvedParams.uuid);
  return {
    title: `Parte diario - ${header ? moment.utc(header.date).format('DD/MM/YYYY') : ''}`,
    description: 'Detalle del parte diario',
  };
}
