"use client";

import { useEffect, useRef, useState } from "react";
import { useGameState } from "@/lib/state/useGameState";
import { MapView } from "@/components/MapView";
import { Leaderboard } from "@/components/Leaderboard";
import { stockholmGameState } from "@/lib/state/gameAtoms";
import { fetchDistricts, type DistrictFeature } from "@/lib/games/data";
import { shuffle } from "@/lib/games/geo";
import { submitScore } from "@/lib/games/scores";
import { getGame } from "@/lib/games/registry";

const game = getGame("stockholm-stadsdelar")!;
const mode = game.modes[0];

export default function StockholmGame() {
  const [districts, setDistricts] = useState<DistrictFeature[] | null>(null);
  const [state, setState] = useGameState(stockholmGameState);
  const submittedRef = useRef(false);

  // Load district borders + start a fresh shuffled run on mount. Guarded on
  // `districts` (not just the dependency array) — useGameState's setState
  // is a new function identity every render, so an unguarded effect here
  // would refetch and reshuffle on every render it causes, one after
  // another, endlessly changing the current target.
  useEffect(() => {
    if (districts) return;
    fetchDistricts(game.dataFile).then((features) => {
      setDistricts(features);
      setState({
        order: shuffle(features.map((f) => f.properties.name)),
        index: 0,
        score: 0,
        lastClicked: null,
        lastResult: null,
        finished: false,
      });
    });
  }, [districts, setState]);

  const target = state.order[state.index];

  function handlePolygonClick(feature: DistrictFeature) {
    const clickedName = feature.properties.name;
    setState((prev) => {
      if (prev.finished || prev.lastResult) return prev;
      const currentTarget = prev.order[prev.index];
      const correct = clickedName === currentTarget;
      return {
        ...prev,
        lastClicked: clickedName,
        lastResult: correct ? "correct" : "wrong",
        score: correct ? prev.score + 1 : prev.score,
      };
    });
  }

  // After showing feedback briefly, advance to the next round (or finish).
  useEffect(() => {
    if (!state.lastResult) return;
    const timeout = setTimeout(() => {
      setState((prev) => {
        const nextIndex = prev.index + 1;
        const finished = nextIndex >= prev.order.length;
        return {
          ...prev,
          index: nextIndex,
          finished,
          lastClicked: null,
          lastResult: null,
        };
      });
    }, 900);
    return () => clearTimeout(timeout);
  }, [state.lastResult, setState]);

  useEffect(() => {
    if (state.finished && !submittedRef.current) {
      submittedRef.current = true;
      submitScore(game.slug, mode.slug, state.score).catch(() => {});
    }
  }, [state.finished, state.score]);

  function playAgain() {
    submittedRef.current = false;
    if (!districts) return;
    setState({
      order: shuffle(districts.map((f) => f.properties.name)),
      index: 0,
      score: 0,
      lastClicked: null,
      lastResult: null,
      finished: false,
    });
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">{game.name}</h1>

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
            {districts ? (
              <>
                Click on: <span className="font-bold">{target}</span>
                <span className="ml-3 text-sm text-muted-foreground">
                  ({state.index + 1}/{state.order.length}) · Score: {state.score}
                </span>
              </>
            ) : (
              "Loading map..."
            )}
          </div>

          <div className="relative flex-1 rounded-lg border border-border overflow-hidden">
            {districts && (
              <MapView
                regionsData={districts}
                stroke={() => "#0f172a"}
                label={(f) => f.properties.name}
                fill={(f) => {
                  const name = f.properties.name;
                  if (state.lastResult) {
                    if (name === target) return "rgba(22, 163, 74, 0.75)";
                    if (name === state.lastClicked && state.lastResult === "wrong") {
                      return "rgba(220, 38, 38, 0.75)";
                    }
                  }
                  return "rgba(37, 99, 235, 0.15)";
                }}
                onRegionClick={handlePolygonClick}
              />
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold">
              {state.score} / {state.order.length}
            </p>
            <p className="text-muted-foreground">Districts correctly identified</p>
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
    </main>
  );
}
