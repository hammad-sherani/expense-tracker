"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { resendResetCode, resetPassword } from "@/server/actions/auth";

const LENGTH = 6;
type Errors = Partial<Record<"code" | "password" | "confirmPassword", string>>;

export function ResetPasswordForm({ initialCooldown }: { initialCooldown: number }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [isPending, startTransition] = useTransition();
  const [isResending, startResend] = useTransition();
  const clear = (k: keyof Errors) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submit = () => {
    setError(null);
    const parsed = resetPasswordSchema.safeParse({ code, password, confirmPassword });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    startTransition(async () => {
      const result = await resetPassword(parsed.data);
      if (result && !result.ok) {
        setError(result.error);
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        if (result.fieldErrors?.code) setCode("");
      }
    });
  };

  const resend = () => {
    setError(null);
    startResend(async () => {
      const result = await resendResetCode();
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
        submit();
      }}
    >
      <FormAlert message={error} />
      <FieldGroup className="gap-5">
        <Field data-invalid={Boolean(errors.code)}>
          <FieldLabel htmlFor="reset-code">Reset code</FieldLabel>
          <InputOTP
            id="reset-code"
            maxLength={LENGTH}
            value={code}
            onChange={(v) => {
              setCode(v.replace(/\D/g, ""));
              clear("code");
            }}
            inputMode="numeric"
            pattern="^\d*$"
            autoFocus
            aria-invalid={Boolean(errors.code)}
          >
            <InputOTPGroup className="gap-2 *:data-[slot=input-otp-slot]:size-11 *:data-[slot=input-otp-slot]:rounded-lg *:data-[slot=input-otp-slot]:border *:data-[slot=input-otp-slot]:text-lg">
              {Array.from({ length: LENGTH }, (_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {errors.code && <FieldError>{errors.code}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="reset-password">New password</FieldLabel>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            className="h-10"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear("password");
            }}
            aria-invalid={Boolean(errors.password)}
          />
          {errors.password ? (
            <FieldError>{errors.password}</FieldError>
          ) : (
            <FieldDescription>At least 8 characters, with a letter and a number.</FieldDescription>
          )}
        </Field>
        <Field data-invalid={Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="reset-confirm">Confirm new password</FieldLabel>
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            className="h-10"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              clear("confirmPassword");
            }}
            aria-invalid={Boolean(errors.confirmPassword)}
          />
          {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
        </Field>
      </FieldGroup>

      <Button type="submit" className="h-10" disabled={isPending}>
        {isPending && <Loader2 className="animate-spin" />}
        Reset password
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        Didn&apos;t get the code?{" "}
        <Button type="button" variant="link" className="h-auto p-0" onClick={resend} disabled={cooldown > 0 || isResending}>
          {isResending ? <Loader2 className="animate-spin" /> : <RotateCw />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Button>
      </div>
    </form>
  );
}
