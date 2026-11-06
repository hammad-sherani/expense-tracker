"use client";

import { Loader2, MailCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/auth/password-input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Switch } from "@/components/ui/switch";
import {
  cancelEmailChange,
  changePassword,
  changeUsername,
  confirmEmailChange,
  deleteAccount,
  requestEmailChange,
  setMonthlyReportEmail,
} from "@/server/actions/account";
import type { ActionResult } from "@/types";

type Errors = Record<string, string | undefined>;

function useForm() {
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const run = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (r: Extract<ActionResult<T>, { ok: true }>) => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(r.error);
        return;
      }
      setErrors({});
      if (r.message) toast.success(r.message);
      onOk?.(r);
    });
  return { errors, clear, isPending, run };
}

export function UsernameForm({ username }: { username: string }) {
  const [value, setValue] = useState(username);
  const { errors, clear, isPending, run } = useForm();
  return (
    <form
      noValidate
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => changeUsername({ username: value }));
      }}
    >
      <Field data-invalid={Boolean(errors.username)} className="flex-1">
        <FieldLabel htmlFor="settings-username">Username</FieldLabel>
        <Input
          id="settings-username"
          value={value}
          maxLength={20}
          autoComplete="username"
          onChange={(e) => {
            setValue(e.target.value);
            clear("username");
          }}
          aria-invalid={Boolean(errors.username)}
        />
        {errors.username ? (
          <FieldError>{errors.username}</FieldError>
        ) : (
          <FieldDescription>Letters, numbers and underscores. 3–20 characters.</FieldDescription>
        )}
      </Field>
      <Button type="submit" variant="secondary" className="sm:mt-6" disabled={isPending || value.trim().toLowerCase() === username}>
        {isPending && <Loader2 className="animate-spin" />}
        Save
      </Button>
    </form>
  );
}

export function EmailForm({ email, pendingEmail }: { email: string; pendingEmail: string | null }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const { errors, clear, isPending, run } = useForm();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (pendingEmail) {
    return (
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => confirmEmailChange({ code }), () => setCode(""));
        }}
      >
        <div className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2.5 text-sm">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            Enter the 6-digit code we sent to <span className="font-medium">{pendingEmail}</span> to make it your login
            email.
          </p>
        </div>
        <Field data-invalid={Boolean(errors.code)}>
          <FieldLabel htmlFor="settings-email-code">Code</FieldLabel>
          <InputOTP
            id="settings-email-code"
            maxLength={6}
            value={code}
            onChange={(v) => {
              setCode(v.replace(/\D/g, ""));
              clear("code");
            }}
            inputMode="numeric"
            pattern="^\d*$"
            aria-invalid={Boolean(errors.code)}
          >
            <InputOTPGroup className="gap-2 *:data-[slot=input-otp-slot]:size-10 *:data-[slot=input-otp-slot]:rounded-lg *:data-[slot=input-otp-slot]:border">
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {errors.code && <FieldError>{errors.code}</FieldError>}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending || code.length !== 6}>
            {isPending && <Loader2 className="animate-spin" />}
            Confirm new email
          </Button>
          <Button type="button" variant="ghost" disabled={isPending} onClick={() => run(() => cancelEmailChange())}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => requestEmailChange({ email: newEmail, currentPassword: password }),
          (r) => {
            setCooldown(r.data.cooldown);
            setPassword("");
          },
        );
      }}
    >
      <p className="text-sm text-muted-foreground">
        Current email: <span className="font-medium text-foreground">{email}</span>
      </p>
      <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="settings-new-email">New email</FieldLabel>
          <Input
            id="settings-new-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              clear("email");
            }}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <FieldError>{errors.email}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.currentPassword)}>
          <FieldLabel htmlFor="settings-email-password">Your password</FieldLabel>
          <PasswordInput
            id="settings-email-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear("currentPassword");
            }}
            aria-invalid={Boolean(errors.currentPassword)}
          />
          {errors.currentPassword && <FieldError>{errors.currentPassword}</FieldError>}
        </Field>
      </FieldGroup>
      <Button type="submit" variant="secondary" className="w-fit" disabled={isPending || cooldown > 0}>
        {isPending && <Loader2 className="animate-spin" />}
        {cooldown > 0 ? `Wait ${cooldown}s` : "Send code to new email"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { errors, clear, isPending, run } = useForm();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => changePassword({ currentPassword: current, password, confirmPassword: confirm }),
          () => {
            setCurrent("");
            setPassword("");
            setConfirm("");
          },
        );
      }}
    >
      <FieldGroup className="gap-4 sm:grid sm:grid-cols-3">
        <Field data-invalid={Boolean(errors.currentPassword)}>
          <FieldLabel htmlFor="settings-current-password">Current password</FieldLabel>
          <PasswordInput
            id="settings-current-password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              clear("currentPassword");
            }}
            aria-invalid={Boolean(errors.currentPassword)}
          />
          {errors.currentPassword && <FieldError>{errors.currentPassword}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="settings-new-password">New password</FieldLabel>
          <PasswordInput
            id="settings-new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear("password");
            }}
            aria-invalid={Boolean(errors.password)}
          />
          {errors.password && <FieldError>{errors.password}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="settings-confirm-password">Confirm new password</FieldLabel>
          <PasswordInput
            id="settings-confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              clear("confirmPassword");
            }}
            aria-invalid={Boolean(errors.confirmPassword)}
          />
          {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
        </Field>
      </FieldGroup>
      <p className="text-xs text-muted-foreground">
        At least 8 characters with a letter and a number. Changing it logs you out on other devices.
      </p>
      <Button type="submit" variant="secondary" className="w-fit" disabled={isPending}>
        {isPending && <Loader2 className="animate-spin" />}
        Change password
      </Button>
    </form>
  );
}

export function ReportToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor="settings-report" className="text-sm font-medium">
          Monthly PDF report by email
        </label>
        <p className="text-xs text-muted-foreground">
          When a month ends, we email you a PDF summary of it the next time you open the app.
        </p>
      </div>
      <Switch
        id="settings-report"
        checked={on}
        disabled={isPending}
        onCheckedChange={(v) => {
          setOn(v);
          startTransition(async () => {
            const r = await setMonthlyReportEmail(v);
            if (r.ok) toast.success(r.message);
            else {
              setOn(!v);
              toast.error(r.error);
            }
          });
        }}
      />
    </div>
  );
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const { errors, clear, isPending, run } = useForm();
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !isPending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-destructive" />
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and everything in it: expenses, income, wallets, categories, friends
              and dues. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id="delete-account-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              run(() => deleteAccount({ password }));
            }}
          >
            <Field data-invalid={Boolean(errors.password)}>
              <FieldLabel htmlFor="delete-password">Enter your password to confirm</FieldLabel>
              <PasswordInput
                id="delete-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clear("password");
                }}
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password && <FieldError>{errors.password}</FieldError>}
            </Field>
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button type="submit" form="delete-account-form" variant="destructive" disabled={isPending || !password}>
              {isPending && <Loader2 className="animate-spin" />}
              Delete forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
