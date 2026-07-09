"use client";

import { useEffect, useRef } from "react";
import { useGameState } from "@/lib/state/useGameState";
import { MapView } from "@/components/MapView";
import { Leaderboard } from "@/components/Leaderboard";
import { usStatesGameState } from "@/lib/state/gameAtoms";
import type { RegionFeature } from "@/lib/games/data";
import { shuffle } from "@/lib/games/geo";
import { submitScore } from "@/lib/games/scores";
import { getGame } from "@/lib/games/registry";

const game = getGame("us-states")!;
const mode = game.modes[0];

export function USStatesMode({ states }: { states: RegionFeature[] }) {
  const [state, setState] = useGameState(usStatesGameState);
  const submittedRef = useRef(false);

  // Start a fresh shuffled run once states arrive — guarded on
  // `state.order.length` (not just the dependency array), the same pattern
  // as every other mode's setup effect: useGameState's setState is a new
  // function identity every render, so an unguarded effect here would
  // reshuffle on every render it causes, one after another, endlessly
  // changing the current target.
  useEffect(() => {
    if (state.order.length === 0 && states.length > 0) {
      setState({
        order: shuffle(states.map((f) => f.properties.name)),
        index: 0,
        score: 0,
        lastClicked: null,
        lastResult: null,
        wrongGuesses: [],
        correctGuesses: [],
        finished: false,
      });
    }
  }, [states, state.order.length, setState]);

  const target = state.order[state.index];

  function handlePolygonClick(feature: RegionFeature) {
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
        wrongGuesses:
          !correct && !prev.wrongGuesses.includes(clickedName)
            ? [...prev.wrongGuesses, clickedName]
            : prev.wrongGuesses,
        correctGuesses:
          correct && !prev.correctGuesses.includes(clickedName)
            ? [...prev.correctGuesses, clickedName]
            : prev.correctGuesses,
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
    setState({
      order: shuffle(states.map((f) => f.properties.name)),
      index: 0,
      score: 0,
      lastClicked: null,
      lastResult: null,
      wrongGuesses: [],
      correctGuesses: [],
      finished: false,
    });
  }

  return (
    <>
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
              regionsData={states}
              projection="albersUsa"
              stroke={() => "var(--foreground)"}
              label={(f) => f.properties.name}
              fill={(f) => {
                const name = f.properties.name;
                if (state.lastResult) {
                  if (name === target) return "rgba(22, 163, 74, 0.75)";
                  if (name === state.lastClicked && state.lastResult === "wrong") {
                    return "rgba(220, 38, 38, 0.75)";
                  }
                }
                // Once guessed, a state stays red/green for the rest of
                // the game (not just this round's brief feedback) — a
                // visual record of what's already been ruled out or found.
                if (state.wrongGuesses.includes(name)) return "rgba(220, 38, 38, 0.45)";
                if (state.correctGuesses.includes(name)) return "rgba(22, 163, 74, 0.45)";
                return "rgba(37, 99, 235, 0.15)";
              }}
              onRegionClick={handlePolygonClick}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold">
              {state.score} / {state.order.length}
            </p>
            <p className="text-muted-foreground">States correctly identified</p>
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
    </>
  );
}
