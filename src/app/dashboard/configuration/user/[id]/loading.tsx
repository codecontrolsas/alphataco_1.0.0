import { DetailPageSkeleton } from '@/shared/components/skeletons/DetailPageSkeleton';
export default function Loading() {
  return <DetailPageSkeleton showBackButton={false} fieldCount={4} />;
}
