import { TablePageSkeleton } from '@/shared/components/skeletons/TablePageSkeleton';
export default function Loading() {
  return <TablePageSkeleton title showBackButton columnCount={5} />;
}
