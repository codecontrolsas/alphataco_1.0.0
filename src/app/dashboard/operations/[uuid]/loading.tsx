import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/shared/components/skeletons';

export default function Loading() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-1 border-b mb-6">
          <Skeleton className="h-10 w-24 rounded-none border-b-2 border-primary" />
        </div>
        <TableSkeleton columnCount={6} rowCount={6} />
      </CardContent>
    </Card>
  );
}
