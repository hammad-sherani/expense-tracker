"use client";

import { Download, Loader2, LogOut, Settings, ShieldCheck, Tags, User } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { usePwa } from "@/components/layout/pwa";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/initials";
import { logout } from "@/server/actions/auth";

export function UserMenuDropdown({
  username,
  email,
  role,
}: {
  username: string;
  email: string;
  role: "USER" | "ADMIN";
}) {
  const [isPending, startTransition] = useTransition();
  const pwa = usePwa();
  const [iosHelp, setIosHelp] = useState(false);
  const showInstall = !pwa.installed && (pwa.canInstall || pwa.isIos);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Account menu"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(username)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            {username}
            <Badge variant={role === "ADMIN" ? "default" : "secondary"} className="h-4 px-1.5 text-[10px]">
              {role === "ADMIN" ? <ShieldCheck className="size-3" /> : <User className="size-3" />}
              {role === "ADMIN" ? "Admin" : "User"}
            </Badge>
          </span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {role === "USER" && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/categories">
                <Tags />
                Categories
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {showInstall && (
          <>
            <DropdownMenuItem
              onSelect={async () => {
                if (pwa.canInstall) {
                  if (await pwa.install()) toast.success("Spendwise installed");
                } else setIosHelp(true);
              }}
            >
              <Download />
              Install app
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          disabled={isPending}
          onSelect={(e) => {
            e.preventDefault();
            startTransition(() => logout());
          }}
        >
          {isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={iosHelp} onOpenChange={setIosHelp}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Install on iPhone</DialogTitle>
          <DialogDescription>
            In Safari, tap the Share button, then choose &quot;Add to Home Screen&quot;. Spendwise will open like an app.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
    </>
  );
}
