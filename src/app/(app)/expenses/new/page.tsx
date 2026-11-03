import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddExpenseForm } from "@/components/expenses/add-expense-form";
import { requireUser } from "@/lib/auth/dal";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Add Expense" };

export default function NewExpensePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add expense" description="Record a new expense. Fields marked * are required." />
      <Card>
        <CardContent className="px-5 py-2 sm:px-6">
          <Suspense fallback={<FormSkeleton />}>
            <DynamicForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

/** The form defaults to *today*, so it must render at request time, not build time. */
async function DynamicForm() {
  await connection();
  await requireUser();
  return <AddExpenseForm />;
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5 py-2">
      {[11, 9, 28, 9, 20].map((h, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton style={{ height: `${h * 4}px` }} className="w-full" />
        </div>
      ))}
    </div>
  );
}
