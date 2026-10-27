"use client";

import { Button } from "@drishya/ui/components/button";
import { Input } from "@drishya/ui/components/input";
import { Label } from "@drishya/ui/components/label";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    try {
      const credentials = {
        email: String(fields.get("email")).trim(),
        password: String(fields.get("password")),
      };
      const result = isSignUp
        ? await authClient.signUp.email({
            ...credentials,
            name: String(fields.get("name")).trim(),
          })
        : await authClient.signIn.email(credentials);
      if (result.error) {
        setError(
          result.error.message ?? "Unable to sign in. Please try again.",
        );
        return;
      }
      router.replace("/workspace");
      router.refresh();
    } catch {
      setError("We couldn’t reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <WindowPanel
      title={isSignUp ? "A new beginning" : "Back to learning"}
      accent={isSignUp ? "green" : "pink"}
    >
      <div className="p-6 sm:p-8">
        <h1 className="font-display text-4xl">
          {isSignUp ? "Make room for curiosity." : "Good to see you again."}
        </h1>
        <p className="mb-7 mt-3 text-sm text-ink-muted">
          {isSignUp
            ? "Create your Drishya account with an email and password."
            : "Sign in to your visual teaching studio."}
        </p>
        <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="name" className="field-label">
                Your name
              </Label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                placeholder="What should we call you?"
                required
                minLength={1}
                maxLength={100}
                disabled={pending}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email" className="field-label">
              Email address
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              maxLength={254}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="field-label">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                minLength={isSignUp ? 8 : undefined}
                maxLength={128}
                disabled={pending}
                className="pr-12"
                aria-describedby={isSignUp ? "password-hint" : undefined}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-0 grid size-10 place-items-center text-ink-muted"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {isSignUp && (
              <p id="password-hint" className="text-xs text-ink-muted">
                Use 8–128 characters.
              </p>
            )}
          </div>
          {error && (
            <p
              role="alert"
              className="border-l-4 border-destructive bg-[var(--red-soft)] px-3 py-2 text-sm"
            >
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
            {!pending && <ArrowRight className="size-4" />}
          </Button>
        </form>
        <p className="mt-6 border-t border-border pt-5 text-center text-sm text-ink-muted">
          {isSignUp ? "Already have an account?" : "New around here?"}{" "}
          <Link
            href={isSignUp ? "/sign-in" : "/sign-up"}
            className="font-medium text-ink underline underline-offset-4"
          >
            {isSignUp ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </WindowPanel>
  );
}
