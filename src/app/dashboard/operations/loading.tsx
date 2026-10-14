import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* 2 tabs */}
      <div className="flex gap-1 border-b">
        <Skeleton className="h-10 w-36 rounded-none" />
        <Skeleton className="h-10 w-32 rounded-none" />
      </div>

      {/* Preparte layout */}
      <Card className="flex w-full gap-4 p-6">
        <div className="space-y-6 w-full">
          {/* Header */}
          <div className="flex justify-between items-center">
            <Skeleton className="h-8 w-[220px]" />
            <Skeleton className="h-10 w-[150px]" />
          </div>

          {/* Status mini-cards row */}
          <div className="flex w-full overflow-x-auto pb-2 mb-6">
            <div className="flex flex-nowrap gap-2 min-w-max">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 min-w-[120px] rounded-lg border p-3 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-10" />
                </div>
              ))}
            </div>
          </div>

          {/* Inner table Card */}
          <Card>
            <CardContent className="p-2">
              <div className="space-y-4 p-4">
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-[200px]" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-9" />
                  <Skeleton className="h-9 w-9" />
                </div>
                <div className="rounded-md border">
                  <div className="border-b p-3">
                    <div className="flex gap-4">
                      <Skeleton className="h-5 w-5" />
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-5 flex-1" />
                      ))}
                    </div>
                  </div>
                  <div className="divide-y">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 p-3">
                        <Skeleton className="h-4 w-4" />
                        {Array.from({ length: 8 }).map((_, j) => (
                          <Skeleton key={j} className="h-4 flex-1" />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-[180px]" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-4 w-[80px]" />
                    <Skeleton className="h-9 w-9" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Card>
    </div>
  );
}
