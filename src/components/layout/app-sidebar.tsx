import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { NavLinks, type NavVariant } from "@/components/layout/nav-links";
import { QuickAddButton } from "@/components/layout/quick-add-button";

export function AppSidebar({ variant }: { variant: NavVariant }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-5 lg:flex">
      <div className="px-2">
        <Brand href={variant === "admin" ? "/admin/users" : "/"} subtitle={variant === "admin" ? "Admin console" : undefined} />
      </div>
      {variant === "user" && (
        <div className="mt-6 px-1">
          <QuickAddButton className="w-full" />
        </div>
      )}
      <p className="mt-6 px-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Menu</p>
      <NavLinks variant={variant} className="mt-2" />
      <div className="mt-auto rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
        {variant === "user" ? (
          <>
            <p className="font-medium text-foreground">Tip</p>
            <p className="mt-1 leading-relaxed">
              Press <kbd className="rounded border bg-background px-1 font-mono text-[10px]">N</kbd> anywhere to add an
              expense.
            </p>
          </>
        ) : (
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Signed in as administrator
          </p>
        )}
      </div>
    </aside>
  );
}
