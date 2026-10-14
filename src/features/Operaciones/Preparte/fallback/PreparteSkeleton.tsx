import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderStatusMetricsSkeleton } from './OrderStatusMetricsSkeleton';

function ToolbarSkeleton() {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="flex items-center gap-2">
        {/* Search input */}
        <Skeleton className="h-9 w-[200px]" />
        {/* Filter buttons */}
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="flex items-center gap-2">
        {/* View options / export */}
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
      </div>
    </div>
  );
}

function TableHeaderSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-4 w-[100px]" />
      <Skeleton className="h-4 w-[120px]" />
      <Skeleton className="h-4 w-[80px]" />
      <Skeleton className="h-4 w-[100px]" />
      <Skeleton className="h-4 w-[80px]" />
      <Skeleton className="h-4 w-[90px]" />
      <Skeleton className="h-4 w-[70px]" />
      <Skeleton className="h-4 w-[60px]" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-4 w-[100px]" />
      <Skeleton className="h-4 w-[120px]" />
      <Skeleton className="h-5 w-[70px] rounded-full" />
      <Skeleton className="h-4 w-[100px]" />
      <Skeleton className="h-4 w-[80px]" />
      <Skeleton className="h-4 w-[90px]" />
      <Skeleton className="h-5 w-[60px] rounded-full" />
      <Skeleton className="h-8 w-8 rounded-md" />
    </div>
  );
}

export function PreparteSkeleton() {
  return (
    <div className="w-full space-y-6">
      {/* Cabecera: título, descripción y acciones */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-[220px]" />
          <Skeleton className="h-4 w-[360px] max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-[140px]" />
          <Skeleton className="h-9 w-[130px]" />
        </div>
      </div>

      <OrderStatusMetricsSkeleton />

      {/* Tabla */}
      <Card className="w-full">
        <CardContent className="p-2">
          <ToolbarSkeleton />
          <div className="rounded-md border">
            <TableHeaderSkeleton />
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRowSkeleton key={i} />
            ))}
          </div>
          {/* Paginación */}
          <div className="flex items-center justify-between px-4 py-3">
            <Skeleton className="h-4 w-[180px]" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-4 w-[80px]" />
              <Skeleton className="h-9 w-9" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
