import { MailCheck, MailX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OTP_TTL_MINUTES, resendCooldown } from "@/lib/auth/otp";
import { readPendingReset } from "@/lib/auth/session";
import { maskEmail } from "@/lib/format";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetSkeleton />}>
      <ResetPassword />
    </Suspense>
  );
}

async function ResetPassword() {
  const pending = await readPendingReset();

  if (!pending) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MailX className="size-5" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Reset session expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">Request a new code to reset your password.</p>
        <Button asChild className="mt-6 h-10 w-full">
          <Link href="/forgot-password">Request a new code</Link>
        </Button>
      </div>
    );
  }

  // Unknown emails get the same page (no cooldown), so nobody can tell which emails have accounts.
  const cooldown = pending.sub ? await resendCooldown(pending.sub, "RESET_PASSWORD") : 0;

  return (
    <>
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MailCheck className="size-5" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          If <span className="font-medium text-foreground">{maskEmail(pending.email)}</span> has a Spendwise account,
          we sent it a 6-digit code. It expires in {OTP_TTL_MINUTES} minutes.
        </p>
      </div>
      <ResetPasswordForm initialCooldown={cooldown} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Wrong email?{" "}
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          Start again
        </Link>
      </p>
    </>
  );
}

function ResetSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Skeleton className="size-12 rounded-2xl" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-6 h-11 w-72" />
      <Skeleton className="mt-2 h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
