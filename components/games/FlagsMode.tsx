"use client";

import { useState } from "react";
import { Leaderboard } from "@/components/Leaderboard";
import type { CountryFeature } from "@/lib/games/data";
import { useRoundGame } from "@/lib/games/useRoundGame";
import { getAutocompleteMatch } from "@/lib/games/text";

export function FlagsMode({
  gameSlug,
  countries,
}: {
  gameSlug: string;
  countries: CountryFeature[];
}) {
  const { game, mode, state, target, submitGuess, playAgain } = useRoundGame({
    gameSlug,
    modeSlug: "flags",
    items: countries,
    getId: (c) => c.properties.name,
  });
  const [input, setInput] = useState("");

  const byName = new Map(countries.map((c) => [c.properties.name, c]));
  const targetCountry = target ? byName.get(target) : undefined;
  const names = countries.map((c) => c.properties.name);

  function guess(answer: string) {
    submitGuess(answer, answer.toLowerCase() === target?.toLowerCase());
    setInput("");
  }

  function handleChange(value: string) {
    const match = getAutocompleteMatch(value, names);
    if (match) {
      guess(match);
      return;
    }
    setInput(value);
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-4">
      {!state.finished ? (
        <>
          <div
            className={`w-full rounded-lg border p-4 text-center text-lg font-medium transition-colors ${
              state.lastResult === "correct"
                ? "border-success bg-success/10 text-success"
                : state.lastResult === "wrong"
                  ? "border-error bg-error/10 text-error"
                  : "border-border bg-surface"
            }`}
          >
            {!state.lastResult ? (
              <>
                Which country&apos;s flag is this?
                <span className="ml-3 text-sm text-muted-foreground">
                  ({state.index + 1}/{state.order.length}) · Score: {state.score}
                </span>
              </>
            ) : (
              <span>
                {state.lastResult === "correct" ? "Correct!" : "Not quite —"} that&apos;s{" "}
                <span className="font-bold">{target}</span>
              </span>
            )}
          </div>

          {targetCountry && (
            // eslint-disable-next-line @next/next/no-img-element -- external flagcdn.com images, not worth Next/Image config for a fixed-size flag
            <img
              src={targetCountry.properties.flagUrl}
              alt="Flag to guess"
              className="h-40 w-64 rounded-md border border-border object-cover shadow-sm"
            />
          )}

          <input
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) guess(input.trim());
            }}
            disabled={!!state.lastResult}
            autoFocus
            placeholder="Type the country name..."
            className="w-full rounded-md border border-border bg-surface px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold">
              {state.score} / {state.order.length}
            </p>
            <p className="text-muted-foreground">Flags correctly identified</p>
          </div>
          <button
            onClick={playAgain}
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Play again
          </button>
          <div className="w-full max-w-sm">
            <Leaderboard key={String(state.finished)} gameSlug={game.slug} mode={mode} />
          </div>
        </div>
      )}
    </div>
  );
}
