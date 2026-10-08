import { AuthShell } from '@/features/Auth/components/AuthShell';
import { AuthFormSkeleton } from '@/features/Auth/fallback/AuthFormSkeleton';

export default function Loading() {
  return (
    <AuthShell>
      <AuthFormSkeleton fields={2} />
    </AuthShell>
  );
}
