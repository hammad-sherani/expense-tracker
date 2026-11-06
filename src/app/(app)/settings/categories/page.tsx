import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { AddCategoryButton, CategoryList } from "@/components/settings/category-manager";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { listCategories } from "@/server/queries/lookups";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <Suspense fallback={<CategoriesSkeleton />}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  await connection();
  const user = await requireUser();
  const [categories, usage] = await Promise.all([
    listCategories(user.id),
    db.expense.groupBy({ by: ["categoryId"], where: { userId: user.id }, _count: { _all: true } }),
  ]);
  const counts = new Map(usage.map((u) => [u.categoryId, (u._count as { _all: number })._all]));

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2 w-fit text-muted-foreground">
        <Link href="/settings">
          <ArrowLeft />
          Settings
        </Link>
      </Button>
      <PageHeader
        title="Categories"
        description="Organise your spending your way. Archived categories keep their expenses but leave the picker."
        actions={<AddCategoryButton />}
      />
      <div className="max-w-3xl">
        <CategoryList categories={categories.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))} />
      </div>
    </>
  );
}

function CategoriesSkeleton() {
  return (
    <div aria-busy aria-label="Loading categories">
      <PageHeaderSkeleton />
      <Skeleton className="h-96 max-w-3xl rounded-xl" />
    </div>
  );
}
