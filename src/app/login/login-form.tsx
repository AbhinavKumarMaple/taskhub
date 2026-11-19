"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password" className="text-xs font-medium text-fg-muted">
        Password
      </label>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "login-error" : undefined}
      />
      {state.error && (
        <p id="login-error" role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={pending} className="mt-1 w-full">
        Sign in
      </Button>
    </form>
  );
}
