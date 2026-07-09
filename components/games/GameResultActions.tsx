import Link from "next/link";

// The "Play again" + "Back to games" pair shown on every mode's results
// screen — identical across all 10 mode components, so it's extracted here
// rather than repeated per-file.
export function GameResultActions({ onPlayAgain }: { onPlayAgain: () => void }) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onPlayAgain}
        className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
      >
        Play again
      </button>
      <Link
        href="/games"
        className="rounded-md border border-border px-6 py-3 font-medium hover:bg-surface"
      >
        Back to games
      </Link>
    </div>
  );
}
