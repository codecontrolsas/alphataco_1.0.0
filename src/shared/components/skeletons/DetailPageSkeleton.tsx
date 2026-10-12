import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DetailPageSkeletonProps {
  showBackButton?: boolean;
  showAvatar?: boolean;
  tabCount?: number;
  fieldCount?: number;
}

export function DetailPageSkeleton({
  showBackButton = true,
  showAvatar = false,
  tabCount = 0,
  fieldCount = 6,
}: DetailPageSkeletonProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {showAvatar && <Skeleton className="h-16 w-16 rounded-full" />}
            <div className="space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
          {showBackButton && <Skeleton className="h-9 w-24" />}
        </div>
      </CardHeader>
      <CardContent>
        {/* Tabs (optional) */}
        {tabCount > 0 && (
          <div className="flex gap-1 border-b mb-6">
            {Array.from({ length: tabCount }).map((_, i) => (
              <Skeleton
                key={i}
                className={`h-10 ${i === 0 ? 'w-32 border-b-2 border-primary' : 'w-28'} rounded-md`}
              />
            ))}
          </div>
        )}

        {/* Fields grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: fieldCount }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
