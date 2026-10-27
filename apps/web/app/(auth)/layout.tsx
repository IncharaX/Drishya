import type { ReactNode } from "react";
import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="paper-grid min-h-dvh">
      <header className="border-b-[1.5px] border-ink bg-paper px-5 py-3.5 sm:px-8">
        <Brand />
      </header>
      <main className="mx-auto max-w-[500px] px-5 py-14 sm:py-20">
        {children}
        <p className="mt-7 text-center font-display text-xl text-ink-muted">
          A clearer way to learn.
        </p>
      </main>
    </div>
  );
}
