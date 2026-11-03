import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ChartCardSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <Card className="gap-4">
      <CardHeader className="gap-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-56" />
      </CardHeader>
      <CardContent>
        <Skeleton className={`${height} w-full`} />
      </CardContent>
    </Card>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 pt-2 pb-6 xl:flex-row xl:items-end xl:justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-64" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy aria-label="Loading dashboard">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className="gap-3 px-5 py-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </Card>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCardSkeleton />
        </div>
        <ChartCardSkeleton />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCardSkeleton />
        </div>
        <ChartCardSkeleton />
      </div>
    </div>
  );
}
