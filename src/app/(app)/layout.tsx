import { Suspense } from "react";
import { ExpenseUIProvider } from "@/components/expenses/expense-dialogs";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { UserMenu, UserMenuSkeleton } from "@/components/layout/user-menu";

/** Shell for regular users: expense tracker navigation, quick add and dialogs. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
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
  );
}
