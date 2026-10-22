import { FormPageSkeleton } from '@/shared/components/skeletons/FormPageSkeleton';
export default function Loading() {
  return <FormPageSkeleton title showBackButton={false} fieldCount={3} columns={1} />;
}
