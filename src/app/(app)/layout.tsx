import { Suspense } from "react";
import { ExpenseUIProvider } from "@/components/expenses/expense-dialogs";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { LookupsProvider, LookupsSync } from "@/components/layout/lookups";
import { UserMenu, UserMenuSkeleton } from "@/components/layout/user-menu";
import { requireUser } from "@/lib/auth/dal";
import { lastUsedWalletId, listCategories, listGroupOptions, listWallets } from "@/server/queries/lookups";
import { dueBillCount } from "@/server/queries/recurring";
import { scheduleMonthlyReport } from "@/server/reports/monthly-report";

/** Loads the user's categories and wallets for client forms (quick add, filters). */
async function LookupsLoader() {
  const user = await requireUser();
  const [categories, wallets, lastWalletId, groups, dueBills] = await Promise.all([
    listCategories(user.id),
    listWallets(user.id),
    lastUsedWalletId(user.id),
    listGroupOptions(user.id),
    dueBillCount(user.id),
    // Emails last month's PDF once, if the user turned it on (sent after the response).
    scheduleMonthlyReport(user).catch((e) => console.error("monthly report check failed", e)),
  ]);
  return <LookupsSync data={{ categories, wallets, lastWalletId, groups, dueBills }} />;
}

/** Shell for regular users: expense tracker navigation, quick add and dialogs. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <LookupsProvider>
      <Suspense fallback={null}>
        <LookupsLoader />
      </Suspense>
      <ExpenseUIProvider>
        <div className="flex min-h-dvh">
          <AppSidebar variant="user" />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader
              variant="user"
              userMenu={
                <Suspense fallback={<UserMenuSkeleton />}>
                  <UserMenu />
                </Suspense>
              }
            />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-12 sm:px-6 lg:px-8 lg:pt-0">{children}</main>
          </div>
        </div>
      </ExpenseUIProvider>
    </LookupsProvider>
  );
}
