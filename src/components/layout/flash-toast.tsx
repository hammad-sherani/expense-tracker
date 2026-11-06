"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** One-off messages passed through the URL after a server redirect, e.g. `?reset=1`. */
const FLASHES: Record<string, string> = {
  reset: "Password updated. You're logged in.",
  deleted: "Your account has been deleted.",
};

export function FlashToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const key = Object.keys(FLASHES).find((k) => searchParams.get(k) === "1");
    if (!key) return;
    toast.success(FLASHES[key]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  return null;
}
