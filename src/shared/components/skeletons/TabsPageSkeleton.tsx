import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { TableSkeleton } from './TableSkeleton';

interface TabsPageSkeletonProps {
  tabCount?: number;
  hasSubtabs?: boolean;
  subtabCount?: number;
  contentType?: 'table' | 'cards' | 'empty';
  columnCount?: number;
  rowCount?: number;
}

export function TabsPageSkeleton({
  tabCount = 4,
  hasSubtabs = false,
  subtabCount = 2,
  contentType = 'table',
  columnCount = 6,
  rowCount = 8,
}: TabsPageSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {Array.from({ length: tabCount }).map((_, i) => (
          <Skeleton key={i} className={`h-10 ${i === 0 ? 'w-32 ' : 'w-28'} rounded-md`} />
        ))}
      </div>

      {/* Subtab bar */}
      {hasSubtabs && (
        <div className="flex gap-1 border-b">
          {Array.from({ length: subtabCount }).map((_, i) => (
            <Skeleton key={i} className={`h-9 ${i === 0 ? 'w-36 ' : 'w-32'} rounded-md`} />
          ))}
        </div>
      )}

      {/* Content */}
      {contentType === 'table' && (
        <Card>
          <CardContent className="pt-6">
            <TableSkeleton columnCount={columnCount} rowCount={rowCount} />
          </CardContent>
        </Card>
      )}

      {contentType === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {contentType === 'empty' && (
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
