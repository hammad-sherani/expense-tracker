"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { requestPasswordReset } from "@/server/actions/auth";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    startTransition(async () => {
      // On success the action redirects to /reset-password.
      const result = await requestPasswordReset(parsed.data);
      if (result && !result.ok) {
        setError(result.error);
        setFieldError(result.fieldErrors?.email?.[0]);
      }
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
      <FieldGroup>
        <Field data-invalid={Boolean(fieldError)}>
          <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-10"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldError(undefined);
            }}
            aria-invalid={Boolean(fieldError)}
            autoFocus
          />
          {fieldError && <FieldError>{fieldError}</FieldError>}
        </Field>
      </FieldGroup>
      <Button type="submit" className="h-10" disabled={isPending}>
        {isPending && <Loader2 className="animate-spin" />}
        Send reset code
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
