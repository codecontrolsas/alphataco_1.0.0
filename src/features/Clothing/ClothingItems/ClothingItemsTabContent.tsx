import { ClothingTableSkeleton } from '@/features/Clothing/fallback/ClothingTableSkeleton';
import { Suspense } from 'react';
import ClothingItemsList from './ClothingItemsList/ClothingItemsList';

// ============================================================================
// TYPES
// ============================================================================

interface ClothingItemsTabContentProps {
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function ClothingItemsTabContent({ searchParams, permissions }: ClothingItemsTabContentProps) {
  return (
    <Suspense fallback={<ClothingTableSkeleton rows={8} withAction />}>
      <ClothingItemsList searchParams={searchParams} permissionsMap={permissions} />
    </Suspense>
  );
}
