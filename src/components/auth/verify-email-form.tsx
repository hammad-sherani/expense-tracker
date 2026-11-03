"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { resendVerificationCode, verifyEmail } from "@/server/actions/auth";

const LENGTH = 6;

export function VerifyEmailForm({ initialCooldown }: { initialCooldown: number }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [isVerifying, startVerify] = useTransition();
  const [isResending, startResend] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submit = (value: string) => {
    if (value.length !== LENGTH || isVerifying) return;
    setError(null);
    startVerify(async () => {
      // On success the action redirects to the dashboard.
      const result = await verifyEmail({ code: value });
      if (result && !result.ok) {
        setError(result.error);
        setCode("");
      }
    });
  };

  const resend = () => {
    setError(null);
    startResend(async () => {
      const result = await resendVerificationCode();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCode("");
      setCooldown(result.data.cooldown);
      toast.success(result.message ?? "A new code has been sent.");
    });
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
    >
      <FormAlert message={error} />
      <div className="flex flex-col items-center gap-2">
        <label htmlFor="otp" className="sr-only">
          Verification code
        </label>
        <InputOTP
          id="otp"
          maxLength={LENGTH}
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, ""))}
          onComplete={submit}
          inputMode="numeric"
          pattern="^\d*$"
          autoFocus
          disabled={isVerifying}
          aria-invalid={Boolean(error)}
        >
          <InputOTPGroup className="gap-2 *:data-[slot=input-otp-slot]:size-12 *:data-[slot=input-otp-slot]:rounded-lg *:data-[slot=input-otp-slot]:border *:data-[slot=input-otp-slot]:text-lg">
            {Array.from({ length: LENGTH }, (_, i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <Button type="submit" className="h-10" disabled={isVerifying || code.length !== LENGTH}>
        {isVerifying && <Loader2 className="animate-spin" />}
        Verify email
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        Didn&apos;t get the code?{" "}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={resend}
          disabled={cooldown > 0 || isResending}
        >
          {isResending ? <Loader2 className="animate-spin" /> : <RotateCw />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Button>
      </div>
    </form>
  );
}
