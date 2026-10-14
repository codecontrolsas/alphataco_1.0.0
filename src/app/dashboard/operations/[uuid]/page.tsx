import { DailyReportDetailTable } from '@/features/Operaciones/PartesDiarios/detail/DailyReportDetailTable';
import { DailyReportHeader } from '@/features/Operaciones/PartesDiarios/detail/DailyReportHeader';
import { getDailyReportHeader } from '@/features/Operaciones/PartesDiarios/detail/queries.server';
import { DailyReportDetailSkeleton } from '@/features/Operaciones/PartesDiarios/detail/fallback/DailyReportDetailSkeleton';
import { DailyReportHeaderSkeleton } from '@/features/Operaciones/PartesDiarios/detail/fallback/DailyReportHeaderSkeleton';
import { checkPermissionServer } from '@/features/Permissions';
import moment from 'moment';
import { redirect } from 'next/navigation';
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

  const canView = await checkPermissionServer('operaciones', 'detalle-parte-diario', 'view');
  if (!canView) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <Suspense fallback={<DailyReportHeaderSkeleton />}>
        <DailyReportHeader uuid={resolvedParams.uuid} />
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
  const header = await getDailyReportHeader(resolvedParams.uuid);
  return {
    title: `Parte diario - ${header ? moment(header.date).format('DD/MM/YYYY') : ''}`,
    description: 'Detalle del parte diario',
  };
}
