"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const isDb = /prisma|mongo|database|ECONNREFUSED|server selection/i.test(error.message ?? "");

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-10">
      <Card className="max-w-md items-center px-8 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {isDb ? "Couldn't reach the database" : "Something went wrong"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isDb
              ? "Check that DATABASE_URL in your .env points to a reachable MongoDB Atlas cluster and that your IP is allowed."
              : "An unexpected error occurred while loading this page. Please try again."}
          </p>
          {error.digest && <p className="mt-3 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>}
        </div>
        <Button onClick={() => retry()}>
          <RotateCw />
          Try again
        </Button>
      </Card>
    </div>
  );
}
