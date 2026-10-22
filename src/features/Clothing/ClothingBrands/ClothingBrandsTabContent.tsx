import { ClothingTableSkeleton } from '@/features/Clothing/fallback/ClothingTableSkeleton';
import { Suspense } from 'react';
import ClothingBrandsList from './ClothingBrandsList/ClothingBrandsList';

// ============================================================================
// TYPES
// ============================================================================

interface ClothingBrandsTabContentProps {
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function ClothingBrandsTabContent({ searchParams, permissions }: ClothingBrandsTabContentProps) {
  return (
    <Suspense fallback={<ClothingTableSkeleton rows={8} withAction />}>
      <ClothingBrandsList searchParams={searchParams} permissionsMap={permissions} />
    </Suspense>
  );
}
