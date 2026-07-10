"use client";

import { MapView } from "@/components/MapView";
import { Leaderboard } from "@/components/Leaderboard";
import { GameResultActions } from "@/components/games/GameResultActions";
import type { CountryFeature } from "@/lib/games/data";
import { useRoundGame } from "@/lib/games/useRoundGame";

export function CountriesMapMode({
  gameSlug,
  countries,
  projection,
}: {
  gameSlug: string;
  countries: CountryFeature[];
  projection?: "mercator" | "albersUsa" | "pacific";
}) {
  const { game, mode, state, target, submitGuess, playAgain } = useRoundGame({
    gameSlug,
    modeSlug: "countries",
    items: countries,
    getId: (c) => c.properties.name,
  });

  function handleRegionClick(feature: CountryFeature) {
    submitGuess(feature.properties.name, feature.properties.name === target);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {!state.finished ? (
        <>
          <div
            className={`rounded-lg border p-4 text-center text-lg font-medium transition-colors ${
              state.lastResult === "correct"
                ? "border-success bg-success/10 text-success"
                : state.lastResult === "wrong"
                  ? "border-error bg-error/10 text-error"
                  : "border-border bg-surface"
            }`}
          >
            Click on: <span className="font-bold">{target}</span>
            <span className="ml-3 text-sm text-muted-foreground">
              ({state.index + 1}/{state.order.length}) · Score: {state.score}
            </span>
          </div>

          <div className="relative flex-1 rounded-lg border border-border overflow-hidden">
            <MapView
              regionsData={countries}
              projection={projection}
              label={(f) => f.properties.name}
              stroke={() => "var(--foreground)"}
              fill={(f) => {
                const name = f.properties.name;
                if (state.lastResult) {
                  if (name === target) return "rgba(22, 163, 74, 0.75)";
                  if (name === state.lastAnswer && state.lastResult === "wrong") {
                    return "rgba(220, 38, 38, 0.75)";
                  }
                }
                // Once guessed, a country stays red/green for the rest of
                // the game (not just this round's brief feedback) — a
                // visual record of what's already been ruled out or found.
                if (state.wrongGuesses.includes(name)) return "rgba(220, 38, 38, 0.45)";
                if (state.correctGuesses.includes(name)) return "rgba(22, 163, 74, 0.45)";
                return "rgba(37, 99, 235, 0.15)";
              }}
              onRegionClick={handleRegionClick}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold">
              {state.score} / {state.order.length}
            </p>
            <p className="text-muted-foreground">Countries correctly identified</p>
          </div>
          <GameResultActions onPlayAgain={playAgain} />
          <div className="w-full max-w-sm">
            <Leaderboard key={String(state.finished)} gameSlug={game.slug} mode={mode} currentScore={state.score} />
          </div>
        </div>
      )}
    </div>
  );
}
