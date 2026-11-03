"use client";

import { Loader2, LogOut, ShieldCheck, User } from "lucide-react";
import { useTransition } from "react";
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

  return (
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
  );
}
