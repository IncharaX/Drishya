import Link from "next/link";

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="Drishya home"
      className="flex w-fit items-center gap-2.5 border-[1.5px] border-ink bg-card py-1.5 pl-1.5 pr-3 shadow-[var(--shadow-sm)]"
    >
      <span className="grid size-7 place-items-center bg-ink font-display text-xl text-paper">
        d
      </span>
      <span className="text-sm font-semibold tracking-[.04em]">DRISHYA</span>
    </Link>
  );
}
