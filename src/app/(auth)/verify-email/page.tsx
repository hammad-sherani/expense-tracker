import { MailCheck, MailX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OTP_TTL_MINUTES, resendCooldown } from "@/lib/auth/otp";
import { readPendingVerification } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifySkeleton />}>
      <VerifyEmail />
    </Suspense>
  );
}

/** "hammad@gmail.com" -> "h****d@gmail.com" */
function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}${"*".repeat(Math.min(6, name.length - 2))}${name.at(-1)}@${domain}`;
}

async function VerifyEmail() {
  const pending = await readPendingVerification();
  const user = pending
    ? await db.user.findUnique({ where: { id: pending.sub }, select: { id: true, email: true, emailVerified: true } })
    : null;

  if (!user || user.emailVerified) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MailX className="size-5" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          {user?.emailVerified ? "Email already verified" : "Verification link expired"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user?.emailVerified
            ? "Your email is verified. Log in to continue."
            : "Log in with your email and password and we'll send you a new code."}
        </p>
        <Button asChild className="mt-6 h-10 w-full">
          <Link href="/login">Go to log in</Link>
        </Button>
      </div>
    );
  }

  const cooldown = await resendCooldown(user.id);

  return (
    <>
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MailCheck className="size-5" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We sent a 6-digit code to <span className="font-medium text-foreground">{maskEmail(user.email)}</span>. It
          expires in {OTP_TTL_MINUTES} minutes.
        </p>
      </div>
      <VerifyEmailForm initialCooldown={cooldown} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Wrong email?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up again
        </Link>
      </p>
    </>
  );
}

function VerifySkeleton() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Skeleton className="size-12 rounded-2xl" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="size-12 rounded-lg" />
        ))}
      </div>
      <Skeleton className="mt-4 h-10 w-full" />
    </div>
  );
}
