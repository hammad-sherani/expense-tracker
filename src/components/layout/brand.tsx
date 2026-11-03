import { Wallet } from "lucide-react";
import Link from "next/link";

export function Brand({ href = "/", subtitle = "Personal finance" }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Wallet className="size-4" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight">Spendwise</span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
    </Link>
  );
}
