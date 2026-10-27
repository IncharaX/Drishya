import { Button } from "@drishya/ui/components/button";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { PasswordForm } from "@/components/password-form";
import { requireSession } from "@/lib/session";

export default async function AccountPage() {
  const { user } = await requireSession();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b-[1.5px] border-ink px-5 py-3.5 sm:px-8">
        <Brand />
        <Button variant="ghost" asChild>
          <Link href="/workspace">Back to studio</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="font-display text-5xl">Your account</h1>
        <p className="mb-8 mt-3 text-sm text-ink-muted">
          {user.name} · {user.email}
        </p>
        <WindowPanel title="Change password" accent="purple">
          <div className="p-6">
            <PasswordForm />
          </div>
        </WindowPanel>
      </main>
    </div>
  );
}
