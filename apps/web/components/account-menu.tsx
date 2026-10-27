"use client";

import { Button } from "@drishya/ui/components/button";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const { data } = authClient.useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Couldn’t sign out. Try again.");
        return;
      }
      onSignOut();
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Couldn’t sign out. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/account"
        className="text-xs text-ink-muted underline underline-offset-4"
      >
        {data?.user.name ?? "Account"}
      </Link>
      <Button variant="ghost" size="sm" disabled={pending} onClick={signOut}>
        <LogOut className="size-3.5" />
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
