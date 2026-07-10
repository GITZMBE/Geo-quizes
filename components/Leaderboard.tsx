"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { formatScoreValue } from "@/lib/games/scores";
import type { GameMode } from "@/lib/games/registry";

type LeaderboardEntry = {
  id: string;
  value: number;
  type: "POINTS" | "TIME_MS";
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
};

// Give this a `key` that changes (e.g. per finished run) if it needs to
// refetch — that remounts the component with fresh initial state instead of
// resetting state imperatively inside an effect.
export function Leaderboard({
  gameSlug,
  mode,
  currentScore,
}: {
  gameSlug: string;
  mode: GameMode;
  // The score value just submitted for this run, if any. submitScore() is
  // fire-and-forget from the caller's finished-round effect, so the GET
  // below has no guarantee of running after that write lands — merging the
  // current run's score in here client-side means it shows up immediately
  // and correctly instead of only after a lucky race, or not at all if the
  // player never revisits this leaderboard.
  currentScore?: number;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/games/${gameSlug}/leaderboard?mode=${mode.slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setEntries(data.top);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [gameSlug, mode.slug]);

  // Merge the current run's score into the fetched top 10 rather than
  // trusting the fetch to already include it — re-sorted and re-capped so
  // this matches what the list will look like once the async submit lands,
  // just without the wait. If the fetched list already contains this same
  // user+value (the submit won the race after all), skip adding a
  // duplicate row instead of showing the player's own score twice.
  const user = session?.user;
  const displayEntries = useMemo(() => {
    if (!entries) return entries;
    if (currentScore == null || !user) return entries;

    const alreadyPresent = entries.some((e) => e.user.id === user.id && e.value === currentScore);
    if (alreadyPresent) return entries;

    const currentEntry: LeaderboardEntry = {
      id: "current-run",
      value: currentScore,
      type: mode.scoreType,
      createdAt: new Date().toISOString(),
      user: { id: user.id, name: user.name ?? "You", image: user.image ?? null },
    };

    const merged = [...entries, currentEntry];
    merged.sort((a, b) => (mode.scoreType === "TIME_MS" ? a.value - b.value : b.value - a.value));
    return merged.slice(0, 10);
  }, [entries, currentScore, user, mode.scoreType]);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
        Top 10 — {mode.name}
      </h3>
      {error && <p className="text-sm text-error">Couldn&apos;t load leaderboard.</p>}
      {!error && !displayEntries && <p className="text-sm text-muted-foreground">Loading...</p>}
      {displayEntries && displayEntries.length === 0 && (
        <p className="text-sm text-muted-foreground">No scores yet — be the first!</p>
      )}
      {displayEntries && displayEntries.length > 0 && (
        <ol className="flex flex-col gap-1">
          {displayEntries.map((entry, i) => (
            <li
              key={entry.id}
              className={`flex items-center justify-between text-sm ${
                entry.id === "current-run" ? "font-semibold text-primary" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-5 text-muted-foreground">{i + 1}.</span>
                <span>
                  {entry.user.name ?? "Anonymous"}
                  {entry.id === "current-run" && " (you, just now)"}
                </span>
              </span>
              <span className="font-medium">{formatScoreValue(entry.type, entry.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
