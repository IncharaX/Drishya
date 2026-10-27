"use client";

import { Button } from "@drishya/ui/components/button";
import { Input } from "@drishya/ui/components/input";
import { Label } from "@drishya/ui/components/label";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function PasswordForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setPending(true);
    setMessage("");
    setError("");
    try {
      const result = await authClient.changePassword({
        currentPassword: String(fields.get("currentPassword")),
        newPassword: String(fields.get("newPassword")),
        revokeOtherSessions: true,
      });
      if (result.error) {
        setError(result.error.message ?? "Couldn’t change your password.");
        return;
      }
      form.reset();
      setMessage("Password updated. Your other sessions have been signed out.");
    } catch {
      setError("We couldn’t reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      <div className="space-y-2">
        <Label htmlFor="currentPassword" className="field-label">
          Current password
        </Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword" className="field-label">
          New password
        </Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          disabled={pending}
        />
        <p className="text-xs text-ink-muted">
          Use 8–128 characters. Other devices will be signed out.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="bg-green-soft p-3 text-sm">
          {message}
        </p>
      )}
      <Button disabled={pending} type="submit">
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
