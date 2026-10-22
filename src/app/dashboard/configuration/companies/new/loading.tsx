import { FormPageSkeleton } from '@/shared/components/skeletons/FormPageSkeleton';
export default function Loading() {
  return <FormPageSkeleton showBackButton={false} fieldCount={10} />;
}
