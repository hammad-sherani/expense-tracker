import { getCurrentUser } from "@/lib/auth/dal";
import { UserMenuDropdown } from "@/components/layout/user-menu-dropdown";
import { Skeleton } from "@/components/ui/skeleton";

/** Reads the session at request time; render it inside <Suspense>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <UserMenuDropdown username={user.username} email={user.email} role={user.role} />;
}

export function UserMenuSkeleton() {
  return <Skeleton className="size-8 rounded-full" />;
}
