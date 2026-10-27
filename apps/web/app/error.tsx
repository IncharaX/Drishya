"use client";

import { Button } from "@drishya/ui/components/button";

export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="font-display text-4xl">We couldn’t load this page.</h1>
      <p className="mb-6 mt-4 text-ink-muted">
        Check that the API is running, then try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
