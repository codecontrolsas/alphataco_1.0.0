import { ClothingTableSkeleton } from '@/features/Clothing/fallback/ClothingTableSkeleton';
import { Suspense } from 'react';
import ClothingReportsList from './ClothingReportsList/ClothingReportsList';

// ============================================================================
// TYPES
// ============================================================================

interface ClothingReportsTabContentProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function ClothingReportsTabContent({ searchParams }: ClothingReportsTabContentProps) {
  return (
    <Suspense fallback={<ClothingTableSkeleton rows={8} />}>
      <ClothingReportsList searchParams={searchParams} />
    </Suspense>
  );
}
