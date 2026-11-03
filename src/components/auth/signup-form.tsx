"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type SignupValues, signupSchema } from "@/lib/validations/auth";
import { signup } from "@/server/actions/auth";

function PasswordChecklist({ password }: { password: string }) {
  const rules = [
    { ok: password.length >= 8, label: "8+ characters" },
    { ok: /[a-zA-Z]/.test(password), label: "A letter" },
    { ok: /\d/.test(password), label: "A number" },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Password requirements">
      {rules.map((r) => (
        <li key={r.label} className={cn("flex items-center gap-1", r.ok ? "text-success" : "text-muted-foreground")}>
          <Check className={cn("size-3", !r.ok && "opacity-40")} />
          {r.label}
        </li>
      ))}
    </ul>
  );
}

export function SignupForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { username: "", email: "", password: "", confirmPassword: "" },
    mode: "onTouched",
  });
  const password = useWatch({ control: form.control, name: "password" });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      // On success the action redirects to /verify-email.
      const result = await signup(values);
      if (result && !result.ok) {
        setError(result.error);
        for (const [name, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (messages?.[0]) form.setError(name as keyof SignupValues, { message: messages[0] });
        }
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormAlert message={error} />
      <FieldGroup className="gap-5">
        <Controller
          control={form.control}
          name="username"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="signup-username">Username</FieldLabel>
              <Input
                id="signup-username"
                autoComplete="username"
                placeholder="e.g. hammad_k"
                maxLength={20}
                className="h-10"
                aria-invalid={fieldState.invalid}
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="signup-email">Email</FieldLabel>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="h-10"
                aria-invalid={fieldState.invalid}
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="signup-password">Password</FieldLabel>
              <PasswordInput
                id="signup-password"
                autoComplete="new-password"
                placeholder="Create a password"
                maxLength={72}
                className="h-10"
                aria-invalid={fieldState.invalid}
                {...field}
              />
              {/* A <ul> can't live inside FieldDescription's <p>, so render it directly. */}
              {fieldState.error ? <FieldError errors={[fieldState.error]} /> : <PasswordChecklist password={password} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="signup-confirm">Confirm password</FieldLabel>
              <PasswordInput
                id="signup-confirm"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                maxLength={72}
                className="h-10"
                aria-invalid={fieldState.invalid}
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" className="h-10" disabled={isPending}>
        {isPending && <Loader2 className="animate-spin" />}
        Create account
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
